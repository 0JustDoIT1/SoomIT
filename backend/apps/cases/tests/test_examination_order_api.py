from datetime import date

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.ai_results.models import AiAnalysis, AiResult, ModelVersion
from apps.cases.models import ClinicianDecision, ExaminationOrder, LungCancerCase, WorkflowStage
from apps.clinical.models import ClinicalResult, XrayResult
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

    def test_case_list_searches_assigned_cases_by_name_patient_code_or_case_code(self):
        additional_patient = Patient.objects.create(
            hospital=self.case.patient.hospital,
            patient_code="SEARCH-PATIENT",
            name="Searchable Patient",
            birth_date=date(1975, 2, 2),
            sex=Patient.Sex.MALE,
            phone_number="010-0000-0001",
            phone_number_hash="search-api",
        )
        LungCancerCase.objects.create(
            patient=additional_patient,
            case_code="SEARCH-CASE",
            primary_doctor=self.doctor,
            current_stage=WorkflowStage.CT,
        )
        list_url = reverse("doctor-case-list")

        for search in ("Searchable", "SEARCH-PATIENT", "SEARCH-CASE"):
            response = self.client.get(list_url, {"search": search})
            self.assertEqual(response.status_code, 200)
            self.assertEqual([item["case_code"] for item in response.data], ["SEARCH-CASE"])

    def test_confirmed_result_and_next_order_advance_the_case_with_an_audit_decision(self):
        result = self.confirm(WorkflowStage.XRAY)
        self.post_order("CT")
        url = reverse("doctor-case-workflow-decision", kwargs={"case_id": self.case.id})

        response = self.client.post(url, {
            "action": "PROCEED_NEXT_STAGE",
            "source_clinical_result_id": str(result.id),
            "target_stage": "CT",
            "reason": "X-ray result confirmed",
        }, format="json")

        self.assertEqual(response.status_code, 200)
        self.case.refresh_from_db()
        self.assertEqual(self.case.current_stage, WorkflowStage.CT)
        decision = ClinicianDecision.objects.get(case=self.case)
        self.assertEqual(decision.decision_type, ClinicianDecision.DecisionType.PROCEED_NEXT_STAGE)
        self.assertEqual(decision.source_clinical_result, result)
        self.assertEqual(decision.target_stage, WorkflowStage.CT)

    def test_workflow_requires_next_order_and_records_case_closure_reason(self):
        result = self.confirm(WorkflowStage.XRAY)
        url = reverse("doctor-case-workflow-decision", kwargs={"case_id": self.case.id})

        missing_order = self.client.post(url, {
            "action": "PROCEED_NEXT_STAGE",
            "source_clinical_result_id": str(result.id),
            "target_stage": "CT",
        }, format="json")
        self.assertEqual(missing_order.status_code, 400)

        closed = self.client.post(url, {
            "action": "CASE_CLOSED",
            "source_clinical_result_id": str(result.id),
            "reason": "No further examination required",
        }, format="json")
        self.assertEqual(closed.status_code, 200)
        self.case.refresh_from_db()
        self.assertEqual(self.case.case_status, LungCancerCase.CaseStatus.CLOSED)
        self.assertIsNotNone(self.case.closed_at)
        self.assertEqual(ClinicianDecision.objects.get(case=self.case).decision_type, ClinicianDecision.DecisionType.CLOSE_CASE)

    def test_xray_workflow_confirms_result_orders_ct_and_advances_atomically(self):
        url = reverse("doctor-xray-workflow", kwargs={"case_id": self.case.id})
        response = self.client.post(url, {
            "assessment": "SUSPICIOUS",
            "finding_summary": "Suspicious opacity",
            "next_action": "ORDER_CT",
            "priority": "URGENT",
            "purpose": "Characterize X-ray finding",
            "clinical_note": "Please assess lesion.",
        }, format="json")

        self.assertEqual(response.status_code, 201)
        self.case.refresh_from_db()
        result = ClinicalResult.objects.get(case=self.case, workflow_stage=WorkflowStage.XRAY)
        self.assertEqual(result.result_status, ClinicalResult.ResultStatus.CONFIRMED)
        self.assertEqual(result.xray_detail.assessment, XrayResult.Assessment.SUSPICIOUS)
        self.assertEqual(self.case.current_stage, WorkflowStage.CT)
        self.assertTrue(ExaminationOrder.objects.filter(case=self.case, order_type=ExaminationOrder.OrderType.CT).exists())
        self.assertEqual(ClinicianDecision.objects.get(case=self.case).decision_type, ClinicianDecision.DecisionType.PROCEED_NEXT_STAGE)

    def test_xray_workflow_requires_ct_purpose_without_persisting_a_result(self):
        url = reverse("doctor-xray-workflow", kwargs={"case_id": self.case.id})
        response = self.client.post(url, {"assessment": "SUSPICIOUS", "next_action": "ORDER_CT", "purpose": ""}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertFalse(ClinicalResult.objects.filter(case=self.case, workflow_stage=WorkflowStage.XRAY).exists())
        self.assertFalse(ExaminationOrder.objects.filter(case=self.case, order_type=ExaminationOrder.OrderType.CT).exists())

    def test_xray_workflow_closes_case_without_creating_a_next_order(self):
        url = reverse("doctor-xray-workflow", kwargs={"case_id": self.case.id})
        response = self.client.post(url, {"assessment": "NEGATIVE", "next_action": "CLOSE_CASE", "closure_reason": "No additional examination needed."}, format="json")

        self.assertEqual(response.status_code, 201)
        self.case.refresh_from_db()
        self.assertEqual(self.case.case_status, LungCancerCase.CaseStatus.CLOSED)
        self.assertFalse(ExaminationOrder.objects.filter(case=self.case, order_type=ExaminationOrder.OrderType.CT).exists())

    def test_ct_result_confirmation_then_pet_ct_order_advances_the_case(self):
        self.confirm(WorkflowStage.XRAY)
        ct_order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.CT,
            requesting_doctor=self.doctor,
            priority=ExaminationOrder.Priority.NORMAL,
            purpose="Chest CT",
            status=ExaminationOrder.Status.COMPLETED,
        )
        self.case.current_stage = WorkflowStage.CT
        self.case.save(update_fields=["current_stage", "updated_at"])
        model = ModelVersion.objects.create(
            model_name="ct-workflow-model",
            version="1.0",
            analysis_type="CT_ANALYSIS",
        )
        analysis = AiAnalysis.objects.create(
            case=self.case,
            examination_order=ct_order,
            analysis_type="CT_ANALYSIS",
            model_version=model,
            status=AiAnalysis.Status.SUCCEEDED,
        )
        ai_result = AiResult.objects.create(
            ai_analysis=analysis,
            schema_version="ct-v1",
            result_payload={},
            result_files=[],
        )
        result_url = reverse("doctor-ct-result", kwargs={"case_id": self.case.id})

        draft_response = self.client.post(result_url, {
            "reviewed_ai_result_id": str(ai_result.id),
            "overall_assessment": "NODULE_DETECTED",
            "overall_malignancy_risk": "82.5",
            "finding_summary": "Right upper lobe nodule",
        }, format="json")

        self.assertEqual(draft_response.status_code, 201)
        result = ClinicalResult.objects.get(id=draft_response.data["id"])
        self.assertEqual(result.result_status, ClinicalResult.ResultStatus.DRAFT)
        self.assertEqual(result.ct_detail.overall_assessment, "NODULE_DETECTED")
        confirm_url = reverse("doctor-ct-result-confirm", kwargs={"case_id": self.case.id, "result_id": result.id})
        self.assertEqual(self.client.post(confirm_url, {}, format="json").status_code, 200)
        result.refresh_from_db()
        self.assertEqual(result.result_status, ClinicalResult.ResultStatus.CONFIRMED)

        pet_order = self.post_order("PET_CT_TNM")
        self.assertEqual(pet_order.status_code, 201)
        decision_url = reverse("doctor-case-workflow-decision", kwargs={"case_id": self.case.id})
        decision_response = self.client.post(decision_url, {
            "action": "PROCEED_NEXT_STAGE",
            "source_clinical_result_id": str(result.id),
            "target_stage": "PET_CT_TNM",
            "reason": "CT result confirmed",
        }, format="json")

        self.assertEqual(decision_response.status_code, 200)
        self.case.refresh_from_db()
        self.assertEqual(self.case.current_stage, WorkflowStage.PET_CT_TNM)
        self.assertTrue(ClinicianDecision.objects.filter(
            case=self.case,
            source_clinical_result=result,
            decision_type=ClinicianDecision.DecisionType.PROCEED_NEXT_STAGE,
            target_stage=WorkflowStage.PET_CT_TNM,
        ).exists())
