from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.ai_results.models import AiAnalysis, AiResult, ModelVersion
from apps.cases.models import CaseConsultationRequest, CaseImageAsset, ClinicianDecision, ExaminationOrder, LungCancerCase, WorkflowStage
from apps.cases.services.examination_orders import ExaminationOrderCreationError
from apps.clinical.models import (
    ClinicalResult,
    CtResult,
    Prescription,
    Regimen,
    TreatmentDecision,
    TreatmentPhase,
    TnmResult,
    XrayResult,
)
from apps.pathology.models import PathologyWorkItem
from apps.patients.models import Appointment, Patient
from apps.radiology.models import RadiologyReview


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

    def prepare_ct_result(self, result_status=ClinicalResult.ResultStatus.DRAFT):
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
        result = ClinicalResult.objects.create(
            case=self.case,
            examination_order=ct_order,
            workflow_stage=WorkflowStage.CT,
            result_status=result_status,
            confirmed_by_user=self.doctor if result_status == ClinicalResult.ResultStatus.CONFIRMED else None,
            confirmed_at=timezone.now() if result_status == ClinicalResult.ResultStatus.CONFIRMED else None,
        )
        CtResult.objects.create(
            clinical_result=result,
            overall_assessment="NODULE_DETECTED",
        )
        return result

    def prepare_prescription_stage(
        self,
        prescription_status=None,
        treatment_type=TreatmentDecision.TreatmentType.OBSERVATION,
    ):
        result = self.confirm(WorkflowStage.TREATMENT)
        treatment_decision = TreatmentDecision.objects.create(
            clinical_result=result,
            ai_recommendation_action=TreatmentDecision.AiRecommendationAction.NOT_USED,
            treatment_type=treatment_type,
            treatment_plan="Follow the confirmed treatment plan.",
        )
        self.case.current_stage = WorkflowStage.PRESCRIPTION
        self.case.save(update_fields=["current_stage", "updated_at"])
        if prescription_status is not None:
            regimen = Regimen.objects.create(
                regimen_code=f"CLOSE-{prescription_status}",
                regimen_name="Closure policy regimen",
                cancer_type="NSCLC",
            )
            Prescription.objects.create(
                case=self.case,
                treatment_decision=treatment_decision,
                regimen=regimen,
                cycle_number=1,
                phase=TreatmentPhase.CONTINUOUS,
                cycle_start_date=date.today(),
                prescription_status=prescription_status,
                prescribed_by_user=self.doctor,
                prescribed_at=timezone.now(),
            )
        return result

    def test_order_list_includes_the_latest_active_appointment_time(self):
        order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.XRAY,
            requesting_doctor=self.doctor,
            priority=ExaminationOrder.Priority.NORMAL,
            purpose="Chest X-ray",
        )
        scheduled_at = timezone.now().replace(microsecond=0)
        Appointment.objects.create(
            patient=self.case.patient,
            case=self.case,
            examination_order=order,
            doctor=self.doctor,
            scheduled_at=scheduled_at,
            appointment_status=Appointment.AppointmentStatus.CONFIRMED,
            visit_status=Appointment.VisitStatus.SCHEDULED,
            created_by_type=Appointment.CreatedByType.DOCTOR_ORDER,
        )

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["scheduled_at"], scheduled_at)
        self.assertEqual(response.data[0]["appointment_status"], Appointment.AppointmentStatus.CONFIRMED)

    def test_requires_confirmed_predecessor_and_blocks_active_duplicate(self):
        self.assertEqual(self.post_order("CT").status_code, 400)
        self.confirm(WorkflowStage.XRAY)
        created = self.post_order("CT")
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["order_type"], "CT")
        self.assertIsNone(created.data["pathology_work_item_id"])
        self.assertEqual(self.post_order("CT").status_code, 400)

    def test_rejects_an_order_created_from_a_completed_or_future_stage(self):
        self.confirm(WorkflowStage.XRAY)
        self.case.current_stage = WorkflowStage.CT
        self.case.save(update_fields=["current_stage", "updated_at"])

        response = self.post_order("CT")

        self.assertEqual(response.status_code, 400)
        self.assertIn("현재 진료 단계", response.data["detail"])

    def test_pathology_gene_order_creates_upload_work_item_atomically(self):
        self.confirm(WorkflowStage.PET_CT_TNM)
        self.case.current_stage = WorkflowStage.PET_CT_TNM
        self.case.save(update_fields=["current_stage", "updated_at"])
        created = self.post_order("PATHOLOGY_GENE")
        self.assertEqual(created.status_code, 201)
        order = ExaminationOrder.objects.get(id=created.data["id"])
        work_item = PathologyWorkItem.objects.get(id=created.data["pathology_work_item_id"])
        self.assertEqual(work_item.examination_order, order)
        self.assertEqual(work_item.task_type, PathologyWorkItem.TaskType.WSI_UPLOAD)

    def prepare_pathology_gene_submission(self):
        self.case.current_stage = WorkflowStage.PATHOLOGY_GENE
        self.case.save(update_fields=["current_stage", "updated_at"])
        pathology_order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PATHOLOGY_GENE,
            requesting_doctor=self.doctor,
            purpose="Pathology review",
        )
        return PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=pathology_order,
            task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
            status=PathologyWorkItem.Status.PENDING,
        )

    def test_pdl1_requires_pathologist_submission(self):
        self.case.current_stage = WorkflowStage.PATHOLOGY_GENE
        self.case.save(update_fields=["current_stage", "updated_at"])

        response = self.post_order("PDL1")

        self.assertEqual(response.status_code, 400)
        self.assertFalse(ExaminationOrder.objects.filter(
            case=self.case, order_type=ExaminationOrder.OrderType.PDL1,
        ).exists())

    def test_submitted_pathology_gene_result_allows_pdl1_order_and_blocks_duplicate(self):
        review_item = self.prepare_pathology_gene_submission()

        created = self.post_order("PDL1")

        self.assertEqual(created.status_code, 201)
        pdl1_order = ExaminationOrder.objects.get(id=created.data["id"])
        pdl1_work_item = PathologyWorkItem.objects.get(id=created.data["pathology_work_item_id"])
        self.assertEqual(pdl1_order.order_type, ExaminationOrder.OrderType.PDL1)
        self.assertNotEqual(pdl1_order.id, review_item.examination_order_id)
        self.assertEqual(pdl1_work_item.examination_order, pdl1_order)
        self.assertEqual(pdl1_work_item.task_type, PathologyWorkItem.TaskType.WSI_UPLOAD)
        self.assertEqual(pdl1_work_item.status, PathologyWorkItem.Status.PENDING)
        self.assertEqual(self.post_order("PDL1").status_code, 400)

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
        self.case.current_stage = WorkflowStage.PET_CT_TNM
        self.case.save(update_fields=["current_stage", "updated_at"])
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
        self.case.current_stage = WorkflowStage.PET_CT_TNM
        self.case.save(update_fields=["current_stage", "updated_at"])
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

    def test_case_list_includes_referred_out_cases_for_result_review(self):
        self.case.case_status = LungCancerCase.CaseStatus.REFERRED_OUT
        self.case.save(update_fields=["case_status", "updated_at"])

        response = self.client.get(reverse("doctor-case-list"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["case_code"], self.case.case_code)
        self.assertEqual(response.data[0]["case_status"], LungCancerCase.CaseStatus.REFERRED_OUT)

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

    def test_workflow_creates_the_required_next_order_and_advances_the_case(self):
        result = self.confirm(WorkflowStage.XRAY)
        url = reverse("doctor-case-workflow-decision", kwargs={"case_id": self.case.id})

        response = self.client.post(url, {
            "action": "PROCEED_NEXT_STAGE",
            "source_clinical_result_id": str(result.id),
            "target_stage": "CT",
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.case.refresh_from_db()
        self.assertEqual(self.case.current_stage, WorkflowStage.CT)
        self.assertTrue(ExaminationOrder.objects.filter(
            case=self.case,
            order_type=ExaminationOrder.OrderType.CT,
            status=ExaminationOrder.Status.ORDERED,
        ).exists())

    def test_completed_order_does_not_count_as_the_active_next_order(self):
        result = self.confirm(WorkflowStage.XRAY)
        ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.CT,
            requesting_doctor=self.doctor,
            priority=ExaminationOrder.Priority.NORMAL,
            purpose="Historical CT",
            status=ExaminationOrder.Status.COMPLETED,
        )

        response = self.client.post(
            reverse("doctor-case-workflow-decision", kwargs={"case_id": self.case.id}),
            {
                "action": "PROCEED_NEXT_STAGE",
                "source_clinical_result_id": str(result.id),
                "target_stage": WorkflowStage.CT,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(ExaminationOrder.objects.filter(
            case=self.case,
            order_type=ExaminationOrder.OrderType.CT,
            status=ExaminationOrder.Status.ORDERED,
        ).exists())

    def test_ct_draft_retry_keeps_one_clinical_result(self):
        self.case.current_stage = WorkflowStage.CT
        self.case.save(update_fields=["current_stage", "updated_at"])
        order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.CT,
            requesting_doctor=self.doctor,
            priority=ExaminationOrder.Priority.NORMAL,
            purpose="CT review",
            status=ExaminationOrder.Status.COMPLETED,
        )
        model = ModelVersion.objects.create(
            model_name="ct-draft-lock-model",
            version="1.0",
            analysis_type="CT_ANALYSIS",
        )
        analysis = AiAnalysis.objects.create(
            case=self.case,
            examination_order=order,
            analysis_type="CT_ANALYSIS",
            model_version=model,
            status=AiAnalysis.Status.SUCCEEDED,
        )
        ai_result = AiResult.objects.create(ai_analysis=analysis, schema_version="ct-v1", result_payload={})
        url = reverse("doctor-ct-result", kwargs={"case_id": self.case.id})
        payload = {
            "reviewed_ai_result_id": str(ai_result.id),
            "overall_assessment": "NODULE_DETECTED",
            "finding_summary": "Stable finding",
        }

        first = self.client.post(url, payload, format="json")
        existing = ClinicalResult.objects.get(id=first.data["id"])
        existing.ct_detail.overall_malignancy_risk = Decimal("93.11")
        existing.ct_detail.save(update_fields=["overall_malignancy_risk"])
        second = self.client.post(url, payload, format="json")

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data["id"], second.data["id"])
        existing.ct_detail.refresh_from_db()
        self.assertEqual(existing.ct_detail.overall_malignancy_risk, Decimal("93.11"))
        self.assertEqual(ClinicalResult.objects.filter(
            case=self.case,
            examination_order=order,
            workflow_stage=WorkflowStage.CT,
        ).count(), 1)

    def test_tnm_draft_retry_keeps_one_result_and_stores_indeterminate_m(self):
        self.case.current_stage = WorkflowStage.PET_CT_TNM
        self.case.save(update_fields=["current_stage", "updated_at"])
        order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PET_CT_TNM,
            requesting_doctor=self.doctor,
            priority=ExaminationOrder.Priority.NORMAL,
            purpose="TNM review",
            status=ExaminationOrder.Status.COMPLETED,
        )
        model = ModelVersion.objects.create(
            model_name="tnm-draft-lock-model",
            version="1.0",
            analysis_type="PET_CT_TNM_ANALYSIS",
        )
        analysis = AiAnalysis.objects.create(
            case=self.case,
            examination_order=order,
            analysis_type="PET_CT_TNM_ANALYSIS",
            model_version=model,
            status=AiAnalysis.Status.SUCCEEDED,
        )
        ai_result = AiResult.objects.create(ai_analysis=analysis, schema_version="tnm-v1", result_payload={})
        url = reverse("doctor-tnm-draft", kwargs={"case_id": self.case.id})
        payload = {
            "reviewed_ai_result_id": str(ai_result.id),
            "t_category": "T2",
            "n_category": "N0",
            "m_category": "M_indeterminate",
        }

        first = self.client.post(url, payload, format="json")
        second = self.client.post(url, payload, format="json")

        replacement_analysis = AiAnalysis.objects.create(
            case=self.case,
            examination_order=order,
            analysis_type="PET_CT_TNM_ANALYSIS",
            model_version=model,
            status=AiAnalysis.Status.SUCCEEDED,
        )
        replacement_ai_result = AiResult.objects.create(
            ai_analysis=replacement_analysis,
            schema_version="tnm-v1",
            result_payload={},
        )
        replacement_payload = {**payload, "reviewed_ai_result_id": str(replacement_ai_result.id)}
        replacement = self.client.post(url, replacement_payload, format="json")

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(replacement.status_code, 200)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(first.data["id"], replacement.data["id"])
        results = ClinicalResult.objects.filter(
            case=self.case,
            examination_order=order,
            workflow_stage=WorkflowStage.PET_CT_TNM,
        )
        self.assertEqual(results.count(), 1)
        self.assertEqual(results.get().reviewed_ai_result_id, replacement_ai_result.id)
        self.assertEqual(TnmResult.objects.get(clinical_result=results.get()).m_category, "M_indeterminate")

    def test_department_wide_consultation_response_locks_only_the_request(self):
        consultation = CaseConsultationRequest.objects.create(
            case=self.case,
            requested_by_user=self.doctor,
            recipient_user=None,
            target_department_code="PULMONOLOGY",
            question="Please review",
        )

        response = self.client.patch(
            reverse(
                "doctor-case-consultation-response",
                kwargs={"case_id": self.case.id, "consultation_id": consultation.id},
            ),
            {"status": "RESPONDED", "response_note": "Reviewed"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        consultation.refresh_from_db()
        self.assertEqual(consultation.status, CaseConsultationRequest.Status.RESPONDED)

    def test_workflow_rejects_case_closure_without_a_final_prescription(self):
        result = self.prepare_prescription_stage(Prescription.PrescriptionStatus.DRAFT)
        url = reverse("doctor-case-workflow-decision", kwargs={"case_id": self.case.id})

        closed = self.client.post(url, {
            "action": "CASE_CLOSED",
            "source_clinical_result_id": str(result.id),
            "reason": "Regular follow-up",
        }, format="json")

        self.assertEqual(closed.status_code, 400)
        self.case.refresh_from_db()
        self.assertEqual(self.case.case_status, LungCancerCase.CaseStatus.ACTIVE)
        self.assertFalse(ClinicianDecision.objects.filter(case=self.case).exists())

    def test_workflow_records_case_closure_and_follow_up_reason_with_a_final_prescription(self):
        result = self.prepare_prescription_stage(Prescription.PrescriptionStatus.FINAL)
        url = reverse("doctor-case-workflow-decision", kwargs={"case_id": self.case.id})

        payload = {
            "action": "CASE_CLOSED",
            "source_clinical_result_id": str(result.id),
            "reason": "Regular follow-up",
        }
        closed = self.client.post(url, payload, format="json")
        self.assertEqual(closed.status_code, 200)
        self.case.refresh_from_db()
        self.assertEqual(self.case.case_status, LungCancerCase.CaseStatus.CLOSED)
        self.assertIsNotNone(self.case.closed_at)
        decision = ClinicianDecision.objects.get(case=self.case)
        self.assertEqual(decision.decision_type, ClinicianDecision.DecisionType.CLOSE_CASE)
        self.assertEqual(decision.reason, "Regular follow-up")

        repeated = self.client.post(url, payload, format="json")
        self.assertEqual(repeated.status_code, 404)
        self.assertEqual(ClinicianDecision.objects.filter(case=self.case).count(), 1)

    def _assert_non_drug_treatment_can_close_without_prescription(self, treatment_type):
        result = self.prepare_prescription_stage(treatment_type=treatment_type)
        response = self.client.post(
            reverse("doctor-case-workflow-decision", kwargs={"case_id": self.case.id}),
            {
                "action": "CASE_CLOSED",
                "source_clinical_result_id": str(result.id),
                "reason": "Confirmed non-drug treatment plan",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.case.refresh_from_db()
        self.assertEqual(self.case.case_status, LungCancerCase.CaseStatus.CLOSED)
        self.assertFalse(Prescription.objects.filter(case=self.case).exists())

    def test_surgery_can_close_without_a_prescription(self):
        self._assert_non_drug_treatment_can_close_without_prescription(
            TreatmentDecision.TreatmentType.SURGERY,
        )

    def test_radiation_can_close_without_a_prescription(self):
        self._assert_non_drug_treatment_can_close_without_prescription(
            TreatmentDecision.TreatmentType.RADIATION,
        )

    def test_observation_can_close_without_a_prescription(self):
        self._assert_non_drug_treatment_can_close_without_prescription(
            TreatmentDecision.TreatmentType.OBSERVATION,
        )

    def test_workflow_referral_does_not_require_a_final_prescription(self):
        result = self.confirm(WorkflowStage.XRAY)
        response = self.client.post(
            reverse("doctor-case-workflow-decision", kwargs={"case_id": self.case.id}),
            {
                "action": ClinicianDecision.DecisionType.REFERRED_OUT,
                "source_clinical_result_id": str(result.id),
                "reason": "Transfer for specialized care",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.case.refresh_from_db()
        self.assertEqual(self.case.case_status, LungCancerCase.CaseStatus.REFERRED_OUT)
        self.assertEqual(
            ClinicianDecision.objects.get(case=self.case).decision_type,
            ClinicianDecision.DecisionType.REFERRED_OUT,
        )

    def test_pathology_draft_confirmation_creates_pdl1_order_work_item_and_advances_case(self):
        pathology_order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PATHOLOGY_GENE,
            requesting_doctor=self.doctor,
            priority=ExaminationOrder.Priority.NORMAL,
            purpose="Pathology and gene testing",
            status=ExaminationOrder.Status.COMPLETED,
        )
        result = ClinicalResult.objects.create(
            case=self.case,
            examination_order=pathology_order,
            workflow_stage=WorkflowStage.PATHOLOGY_GENE,
            result_status=ClinicalResult.ResultStatus.DRAFT,
        )
        review = PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=pathology_order,
            task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
            status=PathologyWorkItem.Status.PENDING,
        )
        self.case.current_stage = WorkflowStage.PATHOLOGY_GENE
        self.case.save(update_fields=["current_stage", "updated_at"])

        response = self.client.post(
            reverse("doctor-case-workflow-decision", kwargs={"case_id": self.case.id}),
            {
                "action": "PROCEED_NEXT_STAGE",
                "source_clinical_result_id": str(result.id),
                "target_stage": "PDL1",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.case.refresh_from_db()
        result.refresh_from_db()
        review.refresh_from_db()
        self.assertEqual(self.case.current_stage, WorkflowStage.PDL1)
        self.assertEqual(result.result_status, ClinicalResult.ResultStatus.CONFIRMED)
        self.assertEqual(review.status, PathologyWorkItem.Status.COMPLETED)
        pdl1_order = ExaminationOrder.objects.get(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PDL1,
        )
        self.assertTrue(PathologyWorkItem.objects.filter(
            examination_order=pdl1_order,
            task_type=PathologyWorkItem.TaskType.WSI_UPLOAD,
            status=PathologyWorkItem.Status.PENDING,
        ).exists())
        self.assertTrue(ClinicianDecision.objects.filter(
            case=self.case,
            source_clinical_result=result,
            decision_type=ClinicianDecision.DecisionType.PROCEED_NEXT_STAGE,
            target_stage=WorkflowStage.PDL1,
        ).exists())

    def test_confirmed_pdl1_result_advances_to_treatment_without_an_examination_order(self):
        result = ClinicalResult.objects.create(
            case=self.case,
            workflow_stage=WorkflowStage.PDL1,
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
        )
        self.case.current_stage = WorkflowStage.PDL1
        self.case.save(update_fields=["current_stage", "updated_at"])

        response = self.client.post(
            reverse("doctor-case-workflow-decision", kwargs={"case_id": self.case.id}),
            {
                "action": "PROCEED_NEXT_STAGE",
                "source_clinical_result_id": str(result.id),
                "target_stage": "TREATMENT",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.case.refresh_from_db()
        self.assertEqual(self.case.current_stage, WorkflowStage.TREATMENT)
        self.assertFalse(ExaminationOrder.objects.filter(case=self.case).exists())

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

    def test_xray_workflow_confirms_the_submitted_radiology_review(self):
        xray_order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.XRAY,
            requesting_doctor=self.doctor,
            priority=ExaminationOrder.Priority.NORMAL,
            purpose="Chest X-ray",
        )
        asset = CaseImageAsset.objects.create(
            case=self.case,
            examination_order=xray_order,
            workflow_stage=WorkflowStage.XRAY,
            image_type=CaseImageAsset.ImageType.XRAY,
            storage_type=CaseImageAsset.StorageType.GCS,
            storage_uri="gs://test/xray-review-handoff.png",
            file_format="PNG",
            status=CaseImageAsset.Status.READY,
        )
        model = ModelVersion.objects.create(
            model_name="xray-review-handoff-model",
            version="1.0",
            analysis_type="XRAY_ANALYSIS",
        )
        analysis = AiAnalysis.objects.create(
            case=self.case,
            examination_order=xray_order,
            source_image_asset=asset,
            analysis_type="XRAY_ANALYSIS",
            model_version=model,
            status=AiAnalysis.Status.SUCCEEDED,
        )
        ai_result = AiResult.objects.create(
            ai_analysis=analysis,
            schema_version="1.0",
            result_payload={},
        )
        review = RadiologyReview.objects.create(
            case=self.case,
            examination_order=xray_order,
            ai_analysis=analysis,
            assigned_doctor=self.doctor,
            submitted_by=self.doctor,
            submitted_at=timezone.now(),
            status=RadiologyReview.Status.PENDING,
        )

        response = self.client.post(
            reverse("doctor-xray-workflow", kwargs={"case_id": self.case.id}),
            {
                "assessment": "SUSPICIOUS",
                "next_action": "ORDER_CT",
                "priority": "NORMAL",
                "purpose": "Characterize X-ray finding",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        result = ClinicalResult.objects.get(case=self.case, workflow_stage=WorkflowStage.XRAY)
        review.refresh_from_db()
        self.assertEqual(result.examination_order, xray_order)
        self.assertEqual(result.source_image_asset, asset)
        self.assertEqual(result.reviewed_ai_result, ai_result)
        self.assertEqual(review.status, RadiologyReview.Status.COMPLETED)

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

    def test_ct_result_confirmation_creates_pet_ct_order_and_advances_the_case(self):
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
            "finding_summary": "Right upper lobe nodule",
        }, format="json")

        self.assertEqual(draft_response.status_code, 201)
        result = ClinicalResult.objects.get(id=draft_response.data["id"])
        self.assertEqual(result.result_status, ClinicalResult.ResultStatus.DRAFT)
        self.assertEqual(result.ct_detail.overall_assessment, "NODULE_DETECTED")
        confirm_url = reverse("doctor-ct-result-confirm", kwargs={"case_id": self.case.id, "result_id": result.id})
        confirm_response = self.client.post(
            confirm_url,
            {"advance_to_next_stage": True},
            format="json",
        )

        self.assertEqual(confirm_response.status_code, 200)
        result.refresh_from_db()
        self.assertEqual(result.result_status, ClinicalResult.ResultStatus.CONFIRMED)
        self.case.refresh_from_db()
        self.assertEqual(self.case.current_stage, WorkflowStage.PET_CT_TNM)
        self.assertEqual(confirm_response.data["current_stage"], WorkflowStage.PET_CT_TNM)
        self.assertEqual(ExaminationOrder.objects.filter(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PET_CT_TNM,
            status=ExaminationOrder.Status.ORDERED,
        ).count(), 1)
        self.assertTrue(ClinicianDecision.objects.filter(
            case=self.case,
            source_clinical_result=result,
            decision_type=ClinicianDecision.DecisionType.PROCEED_NEXT_STAGE,
            target_stage=WorkflowStage.PET_CT_TNM,
        ).exists())

    def test_pathology_to_pdl1_failure_rolls_back_confirmation_and_transition(self):
        pathology_order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PATHOLOGY_GENE,
            requesting_doctor=self.doctor,
            priority=ExaminationOrder.Priority.NORMAL,
            purpose="Pathology and gene testing",
            status=ExaminationOrder.Status.COMPLETED,
        )
        result = ClinicalResult.objects.create(
            case=self.case,
            examination_order=pathology_order,
            workflow_stage=WorkflowStage.PATHOLOGY_GENE,
            result_status=ClinicalResult.ResultStatus.DRAFT,
        )
        review = PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=pathology_order,
            task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
            status=PathologyWorkItem.Status.PENDING,
        )
        self.case.current_stage = WorkflowStage.PATHOLOGY_GENE
        self.case.save(update_fields=["current_stage", "updated_at"])

        with patch(
            "apps.cases.views.create_examination_order",
            side_effect=ExaminationOrderCreationError("PD-L1 order failed"),
        ):
            response = self.client.post(
                reverse("doctor-case-workflow-decision", kwargs={"case_id": self.case.id}),
                {
                    "action": "PROCEED_NEXT_STAGE",
                    "source_clinical_result_id": str(result.id),
                    "target_stage": "PDL1",
                },
                format="json",
            )

        self.assertEqual(response.status_code, 400)
        self.case.refresh_from_db()
        result.refresh_from_db()
        review.refresh_from_db()
        self.assertEqual(self.case.current_stage, WorkflowStage.PATHOLOGY_GENE)
        self.assertEqual(result.result_status, ClinicalResult.ResultStatus.DRAFT)
        self.assertEqual(review.status, PathologyWorkItem.Status.PENDING)
        self.assertFalse(ExaminationOrder.objects.filter(case=self.case, order_type=ExaminationOrder.OrderType.PDL1).exists())
        self.assertFalse(ClinicianDecision.objects.filter(case=self.case).exists())

    def test_ct_result_save_uses_the_order_linked_to_the_selected_ai_result(self):
        linked_order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.CT,
            requesting_doctor=self.doctor,
            priority=ExaminationOrder.Priority.NORMAL,
            purpose="CT with AI result",
            status=ExaminationOrder.Status.COMPLETED,
        )
        model = ModelVersion.objects.create(
            model_name="ct-order-link-model",
            version="1.0",
            analysis_type="CT_ANALYSIS",
        )
        analysis = AiAnalysis.objects.create(
            case=self.case,
            examination_order=linked_order,
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
        ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.CT,
            requesting_doctor=self.doctor,
            priority=ExaminationOrder.Priority.NORMAL,
            purpose="Newer CT order without this AI result",
            status=ExaminationOrder.Status.ORDERED,
        )
        self.case.current_stage = WorkflowStage.CT
        self.case.save(update_fields=["current_stage", "updated_at"])

        response = self.client.post(
            reverse("doctor-ct-result", kwargs={"case_id": self.case.id}),
            {
                "reviewed_ai_result_id": str(ai_result.id),
                "overall_assessment": "NODULE_DETECTED",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        saved = ClinicalResult.objects.get(id=response.data["id"])
        self.assertEqual(saved.examination_order, linked_order)

    def test_ct_result_confirmation_reuses_an_existing_active_pet_ct_order(self):
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
        existing_pet_order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PET_CT_TNM,
            requesting_doctor=self.doctor,
            priority=ExaminationOrder.Priority.NORMAL,
            purpose="Existing PET-CT/TNM order",
            status=ExaminationOrder.Status.ORDERED,
        )
        result = ClinicalResult.objects.create(
            case=self.case,
            examination_order=ct_order,
            workflow_stage=WorkflowStage.CT,
            result_status=ClinicalResult.ResultStatus.DRAFT,
        )
        CtResult.objects.create(
            clinical_result=result,
            overall_assessment="NODULE_DETECTED",
        )

        response = self.client.post(
            reverse("doctor-ct-result-confirm", kwargs={"case_id": self.case.id, "result_id": result.id}),
            {"advance_to_next_stage": True},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        result.refresh_from_db()
        self.case.refresh_from_db()
        self.assertEqual(result.result_status, ClinicalResult.ResultStatus.CONFIRMED)
        self.assertEqual(self.case.current_stage, WorkflowStage.PET_CT_TNM)
        self.assertEqual(ExaminationOrder.objects.filter(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PET_CT_TNM,
        ).count(), 1)
        self.assertTrue(ExaminationOrder.objects.filter(id=existing_pet_order.id).exists())

    def test_ct_result_confirmation_rolls_back_when_pet_ct_order_creation_fails(self):
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
        result = ClinicalResult.objects.create(
            case=self.case,
            examination_order=ct_order,
            workflow_stage=WorkflowStage.CT,
            result_status=ClinicalResult.ResultStatus.DRAFT,
        )
        CtResult.objects.create(
            clinical_result=result,
            overall_assessment="NODULE_DETECTED",
        )

        with patch(
            "apps.cases.services.examination_orders.create_examination_order",
            side_effect=ExaminationOrderCreationError("Order failed"),
        ):
            response = self.client.post(
                reverse("doctor-ct-result-confirm", kwargs={"case_id": self.case.id, "result_id": result.id}),
                {"advance_to_next_stage": True},
                format="json",
            )

        self.assertEqual(response.status_code, 400)
        result.refresh_from_db()
        self.case.refresh_from_db()
        self.assertEqual(result.result_status, ClinicalResult.ResultStatus.DRAFT)
        self.assertEqual(self.case.current_stage, WorkflowStage.CT)
        self.assertFalse(ClinicianDecision.objects.filter(case=self.case).exists())

    def test_ct_result_confirmation_reuses_a_scheduled_pet_ct_order(self):
        result = self.prepare_ct_result()
        scheduled_order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PET_CT_TNM,
            requesting_doctor=self.doctor,
            priority=ExaminationOrder.Priority.NORMAL,
            purpose="Scheduled PET-CT/TNM",
            status=ExaminationOrder.Status.SCHEDULED,
        )

        response = self.client.post(
            reverse("doctor-ct-result-confirm", kwargs={"case_id": self.case.id, "result_id": result.id}),
            {"advance_to_next_stage": True},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(ExaminationOrder.objects.filter(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PET_CT_TNM,
        ).count(), 1)
        self.assertTrue(ExaminationOrder.objects.filter(id=scheduled_order.id).exists())

    def test_ct_result_confirmation_creates_a_new_order_after_completed_history(self):
        result = self.prepare_ct_result()
        ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PET_CT_TNM,
            requesting_doctor=self.doctor,
            priority=ExaminationOrder.Priority.NORMAL,
            purpose="Completed PET-CT/TNM",
            status=ExaminationOrder.Status.COMPLETED,
        )

        response = self.client.post(
            reverse("doctor-ct-result-confirm", kwargs={"case_id": self.case.id, "result_id": result.id}),
            {"advance_to_next_stage": True},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(ExaminationOrder.objects.filter(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PET_CT_TNM,
        ).count(), 2)
        self.assertEqual(ExaminationOrder.objects.filter(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PET_CT_TNM,
            status=ExaminationOrder.Status.ORDERED,
        ).count(), 1)

    def test_ct_result_confirmation_creates_a_new_order_after_cancelled_history(self):
        result = self.prepare_ct_result()
        ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PET_CT_TNM,
            requesting_doctor=self.doctor,
            priority=ExaminationOrder.Priority.NORMAL,
            purpose="Cancelled PET-CT/TNM",
            status=ExaminationOrder.Status.CANCELLED,
        )

        response = self.client.post(
            reverse("doctor-ct-result-confirm", kwargs={"case_id": self.case.id, "result_id": result.id}),
            {"advance_to_next_stage": True},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(ExaminationOrder.objects.filter(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PET_CT_TNM,
        ).count(), 2)
        self.assertEqual(ExaminationOrder.objects.filter(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PET_CT_TNM,
            status=ExaminationOrder.Status.ORDERED,
        ).count(), 1)

    def test_confirmed_ct_result_recovers_the_pet_ct_transition(self):
        result = self.prepare_ct_result(ClinicalResult.ResultStatus.CONFIRMED)
        existing_order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PET_CT_TNM,
            requesting_doctor=self.doctor,
            priority=ExaminationOrder.Priority.NORMAL,
            purpose="Existing PET-CT/TNM",
            status=ExaminationOrder.Status.ORDERED,
        )

        response = self.client.post(
            reverse("doctor-ct-result-confirm", kwargs={"case_id": self.case.id, "result_id": result.id}),
            {"advance_to_next_stage": True},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.case.refresh_from_db()
        self.assertEqual(self.case.current_stage, WorkflowStage.PET_CT_TNM)
        self.assertEqual(response.data["current_stage"], WorkflowStage.PET_CT_TNM)
        self.assertEqual(ExaminationOrder.objects.filter(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PET_CT_TNM,
        ).count(), 1)
        self.assertTrue(ExaminationOrder.objects.filter(id=existing_order.id).exists())

    def test_repeated_ct_transition_request_is_idempotent(self):
        result = self.prepare_ct_result()
        url = reverse("doctor-ct-result-confirm", kwargs={"case_id": self.case.id, "result_id": result.id})

        first = self.client.post(url, {"advance_to_next_stage": True}, format="json")
        second = self.client.post(url, {"advance_to_next_stage": True}, format="json")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.data["current_stage"], WorkflowStage.PET_CT_TNM)
        self.assertEqual(ExaminationOrder.objects.filter(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PET_CT_TNM,
        ).count(), 1)
        self.assertEqual(ClinicianDecision.objects.filter(
            case=self.case,
            source_stage=WorkflowStage.CT,
            target_stage=WorkflowStage.PET_CT_TNM,
        ).count(), 1)

    def test_ct_transition_handles_multiple_historical_pet_ct_orders(self):
        result = self.prepare_ct_result()
        for order_status in (ExaminationOrder.Status.COMPLETED, ExaminationOrder.Status.CANCELLED):
            ExaminationOrder.objects.create(
                case=self.case,
                order_type=ExaminationOrder.OrderType.PET_CT_TNM,
                requesting_doctor=self.doctor,
                priority=ExaminationOrder.Priority.NORMAL,
                purpose=f"Historical {order_status} PET-CT/TNM",
                status=order_status,
            )

        response = self.client.post(
            reverse("doctor-ct-result-confirm", kwargs={"case_id": self.case.id, "result_id": result.id}),
            {"advance_to_next_stage": True},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(ExaminationOrder.objects.filter(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PET_CT_TNM,
            status__in=[ExaminationOrder.Status.ORDERED, ExaminationOrder.Status.SCHEDULED],
        ).count(), 1)
