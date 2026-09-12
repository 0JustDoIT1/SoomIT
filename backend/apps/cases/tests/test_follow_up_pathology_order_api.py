from datetime import date
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.cases.models import ExaminationOrder, LungCancerCase, Stage
from apps.cases.services.pathology_orders import create_follow_up_pathology_order
from apps.clinical.models import ClinicalResult
from apps.pathology.models import PathologyWorkItem
from apps.patients.models import Patient


class DoctorFollowUpPathologyOrderAPITests(TestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(name="테스트 병원", code="ORDER-TEST")
        pulmonology = Department.objects.create(
            hospital=self.hospital, code="PULMONOLOGY", name="호흡기내과"
        )
        doctor_role = DepartmentRole.objects.create(
            department=pulmonology, role=DepartmentRole.Role.DOCTOR, display_name="의사"
        )
        self.doctor = User.objects.create_user(
            login_id="order-doctor", password="test", name="담당의", department_role=doctor_role,
            account_status=User.AccountStatus.ACTIVE,
        )
        self.other_doctor = User.objects.create_user(
            login_id="other-doctor", password="test", name="다른의", department_role=doctor_role,
            account_status=User.AccountStatus.ACTIVE,
        )
        self.patient = Patient.objects.create(
            hospital=self.hospital, patient_code="ORDER-P001", name="가상환자",
            birth_date=date(1970, 1, 1), sex=Patient.Sex.FEMALE,
            phone_number="010-0000-0000", phone_number_hash="order-test-hash",
        )
        self.case = LungCancerCase.objects.create(
            patient=self.patient, case_code="ORDER-CASE-001", primary_doctor=self.doctor,
            current_stage=Stage.PATHOLOGY,
        )
        self.subtype_order = ExaminationOrder.objects.create(
            case=self.case, exam_type=ExaminationOrder.ExamType.WSI,
            pathology_test_type=ExaminationOrder.PathologyTestType.SUBTYPE,
            requesting_doctor=self.doctor, purpose="SUBTYPE",
        )
        self.url = reverse(
            "doctor-follow-up-pathology-order", kwargs={"case_id": self.case.id}
        )
        self.client = APIClient()
        self.authenticate(self.doctor)

    def authenticate(self, user):
        refresh = RefreshToken.for_user(user)
        refresh["hospital_id"] = str(self.hospital.id)
        refresh["department_id"] = str(user.department_role.department_id)
        refresh["department_code"] = "PULMONOLOGY"
        refresh["role"] = DepartmentRole.Role.DOCTOR
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def confirm_subtype(self):
        return ClinicalResult.objects.create(
            case=self.case, examination_order=self.subtype_order, stage=Stage.PATHOLOGY,
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
        )

    def payload(self, test_type):
        return {
            "pathology_test_type": test_type,
            "priority": ExaminationOrder.Priority.NORMAL,
            "purpose": "추가 병리 검사",
            "clinical_note": "",
        }

    def test_rejects_pdl1_and_gene_before_confirmed_subtype(self):
        for test_type in ("PDL1", "GENE"):
            response = self.client.post(self.url, self.payload(test_type), format="json")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ExaminationOrder.objects.filter(case=self.case).count(), 1)

    def test_creates_order_and_initial_work_item_atomically(self):
        self.confirm_subtype()
        response = self.client.post(self.url, self.payload("PDL1"), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        order = ExaminationOrder.objects.get(id=response.data["examination_order_id"])
        work_item = PathologyWorkItem.objects.get(id=response.data["pathology_work_item_id"])
        self.assertEqual(order.exam_type, ExaminationOrder.ExamType.WSI)
        self.assertEqual(order.pathology_test_type, ExaminationOrder.PathologyTestType.PDL1)
        self.assertEqual(order.requesting_doctor, self.doctor)
        self.assertEqual(order.status, ExaminationOrder.Status.ORDERED)
        self.assertEqual(work_item.examination_order, order)
        self.assertEqual(work_item.task_type, PathologyWorkItem.TaskType.WSI_UPLOAD)
        self.assertEqual(work_item.status, PathologyWorkItem.Status.PENDING)
        self.subtype_order.refresh_from_db()
        self.assertEqual(
            self.subtype_order.pathology_test_type,
            ExaminationOrder.PathologyTestType.SUBTYPE,
        )

    def test_allows_pdl1_and_gene_as_independent_orders(self):
        self.confirm_subtype()
        self.assertEqual(self.client.post(self.url, self.payload("PDL1"), format="json").status_code, 201)
        self.assertEqual(self.client.post(self.url, self.payload("GENE"), format="json").status_code, 201)

    def test_blocks_only_same_type_active_duplicate(self):
        self.confirm_subtype()
        self.client.post(self.url, self.payload("PDL1"), format="json")
        duplicate = self.client.post(self.url, self.payload("PDL1"), format="json")
        gene = self.client.post(self.url, self.payload("GENE"), format="json")
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(gene.status_code, status.HTTP_201_CREATED)

    def test_allows_same_type_again_after_completed_or_cancelled_order(self):
        self.confirm_subtype()
        for terminal_status in (
            ExaminationOrder.Status.COMPLETED,
            ExaminationOrder.Status.CANCELLED,
        ):
            old_order = ExaminationOrder.objects.create(
                case=self.case,
                exam_type=ExaminationOrder.ExamType.WSI,
                pathology_test_type=ExaminationOrder.PathologyTestType.PDL1,
                requesting_doctor=self.doctor,
                purpose="과거 검사",
                status=terminal_status,
            )
            response = self.client.post(self.url, self.payload("PDL1"), format="json")
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
            ExaminationOrder.objects.filter(id=response.data["examination_order_id"]).update(
                status=ExaminationOrder.Status.COMPLETED
            )
            old_order.delete()

    def test_rolls_back_order_when_work_item_creation_fails(self):
        self.confirm_subtype()
        with patch(
            "apps.cases.services.pathology_orders.PathologyWorkItem.objects.create",
            side_effect=RuntimeError("work item failure"),
        ):
            with self.assertRaises(RuntimeError):
                create_follow_up_pathology_order(
                    case=self.case,
                    requesting_doctor=self.doctor,
                    pathology_test_type=ExaminationOrder.PathologyTestType.GENE,
                    priority=ExaminationOrder.Priority.NORMAL,
                    purpose="추가 병리 검사",
                    clinical_note="",
                )
        self.assertFalse(
            ExaminationOrder.objects.filter(
                case=self.case,
                pathology_test_type=ExaminationOrder.PathologyTestType.GENE,
            ).exists()
        )

    def test_rejects_subtype_and_another_doctors_case(self):
        self.confirm_subtype()
        subtype = self.client.post(self.url, self.payload("SUBTYPE"), format="json")
        self.assertEqual(subtype.status_code, status.HTTP_400_BAD_REQUEST)
        self.authenticate(self.other_doctor)
        forbidden_case = self.client.post(self.url, self.payload("PDL1"), format="json")
        self.assertEqual(forbidden_case.status_code, status.HTTP_404_NOT_FOUND)

    def test_created_work_item_is_visible_to_pathology_workstation(self):
        self.confirm_subtype()
        created = self.client.post(self.url, self.payload("GENE"), format="json")
        pathology = Department.objects.create(
            hospital=self.hospital, code="PATHOLOGY", name="병리과"
        )
        role = DepartmentRole.objects.create(
            department=pathology, role=DepartmentRole.Role.TECHNOLOGIST,
            display_name="병리사",
        )
        pathologist = User.objects.create_user(
            login_id="path-order-test", password="test", name="병리사",
            department_role=role, account_status=User.AccountStatus.ACTIVE,
        )
        refresh = RefreshToken.for_user(pathologist)
        refresh["hospital_id"] = str(self.hospital.id)
        refresh["department_id"] = str(pathology.id)
        refresh["department_code"] = "PATHOLOGY"
        refresh["role"] = DepartmentRole.Role.TECHNOLOGIST
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        response = self.client.get(reverse("pathology:workstation-list"))
        ids = {str(item["id"]) for item in response.data["results"]}
        self.assertIn(str(created.data["pathology_work_item_id"]), ids)
