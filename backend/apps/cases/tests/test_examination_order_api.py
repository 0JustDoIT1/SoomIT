from datetime import date

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.cases.models import ExaminationOrder, LungCancerCase, WorkflowStage
from apps.clinical.models import ClinicalResult
from apps.pathology.models import PathologyWorkItem
from apps.patients.models import Patient


class DoctorExaminationOrderAPITests(TestCase):
    def setUp(self):
        hospital = Hospital.objects.create(name="Order Hospital", code="ORDER-HOSP")
        department = Department.objects.create(hospital=hospital, code="PULMONOLOGY", name="Pulmonology")
        role = DepartmentRole.objects.create(department=department, role=DepartmentRole.Role.DOCTOR, display_name="Doctor")
        self.doctor = User.objects.create_user(login_id="order-api-doctor", password="test", name="Doctor", department_role=role, account_status=User.AccountStatus.ACTIVE)
        patient = Patient.objects.create(hospital=hospital, patient_code="ORDER-PATIENT", name="Patient", birth_date=date(1970, 1, 1), sex=Patient.Sex.FEMALE, phone_number="010-0000-0000", phone_number_hash="order-api")
        self.case = LungCancerCase.objects.create(patient=patient, case_code="ORDER-CASE", primary_doctor=self.doctor, current_stage=WorkflowStage.XRAY)
        token = RefreshToken.for_user(self.doctor)
        token["hospital_id"] = str(hospital.id)
        token["department_id"] = str(department.id)
        token["department_code"] = department.code
        token["role"] = role.role
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        self.url = reverse("doctor-examination-order-list-create", kwargs={"case_id": self.case.id})

    def confirm(self, stage):
        return ClinicalResult.objects.create(case=self.case, workflow_stage=stage, result_status=ClinicalResult.ResultStatus.CONFIRMED)

    def post_order(self, order_type):
        return self.client.post(self.url, {"order_type": order_type, "priority": "NORMAL", "purpose": "Next examination", "clinical_note": ""}, format="json")

    def test_requires_confirmed_predecessor_and_blocks_active_duplicate(self):
        self.assertEqual(self.post_order("CT").status_code, 400)
        self.confirm(WorkflowStage.XRAY)
        created = self.post_order("CT")
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["order_type"], "CT")
        self.assertIsNone(created.data["pathology_work_item_id"])
        self.assertEqual(self.post_order("CT").status_code, 400)

    def test_pathology_gene_order_creates_upload_work_item_atomically(self):
        self.confirm(WorkflowStage.PET_CT_TNM)
        created = self.post_order("PATHOLOGY_GENE")
        self.assertEqual(created.status_code, 201)
        order = ExaminationOrder.objects.get(id=created.data["id"])
        work_item = PathologyWorkItem.objects.get(id=created.data["pathology_work_item_id"])
        self.assertEqual(work_item.examination_order, order)
        self.assertEqual(work_item.task_type, PathologyWorkItem.TaskType.WSI_UPLOAD)

    def test_requesting_doctor_can_update_only_ordered_order(self):
        created = self.post_order("XRAY")
        order = ExaminationOrder.objects.get(id=created.data["id"])
        url = reverse("doctor-examination-order-detail", kwargs={"case_id": self.case.id, "order_id": order.id})

        response = self.client.patch(url, {"priority": "URGENT", "purpose": "Urgent chest X-ray"}, format="json")

        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.priority, ExaminationOrder.Priority.URGENT)
        self.assertEqual(order.purpose, "Urgent chest X-ray")
        order.status = ExaminationOrder.Status.SCHEDULED
        order.save(update_fields=["status", "updated_at"])
        self.assertEqual(self.client.patch(url, {"purpose": "changed"}, format="json").status_code, 400)

    def test_cancelling_pathology_order_cancels_pending_work_item(self):
        self.confirm(WorkflowStage.PET_CT_TNM)
        created = self.post_order("PATHOLOGY_GENE")
        order = ExaminationOrder.objects.get(id=created.data["id"])
        work_item = PathologyWorkItem.objects.get(examination_order=order)
        url = reverse("doctor-examination-order-detail", kwargs={"case_id": self.case.id, "order_id": order.id})

        response = self.client.delete(url)

        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        work_item.refresh_from_db()
        self.assertEqual(order.status, ExaminationOrder.Status.CANCELLED)
        self.assertEqual(work_item.status, PathologyWorkItem.Status.CANCELLED)

    def test_cannot_cancel_pathology_order_with_started_work_item(self):
        self.confirm(WorkflowStage.PET_CT_TNM)
        created = self.post_order("PATHOLOGY_GENE")
        order = ExaminationOrder.objects.get(id=created.data["id"])
        PathologyWorkItem.objects.filter(examination_order=order).update(status=PathologyWorkItem.Status.IN_PROGRESS)
        url = reverse("doctor-examination-order-detail", kwargs={"case_id": self.case.id, "order_id": order.id})

        response = self.client.delete(url)

        self.assertEqual(response.status_code, 400)
        order.refresh_from_db()
        self.assertEqual(order.status, ExaminationOrder.Status.ORDERED)
