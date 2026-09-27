from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse

from apps.ai_results.models import AiAnalysis, AiResult, ModelVersion
from apps.cases.models import ExaminationOrder, WorkflowStage
from apps.clinical.models import ClinicalResult, TnmResult
from apps.cases.tests import test_examination_order_api as order_tests


class WorkflowStageBoundaryTests(TestCase):
    setUp = order_tests.DoctorExaminationOrderAPITests.setUp
    prepare_ct_result = order_tests.DoctorExaminationOrderAPITests.prepare_ct_result

    def _stage(self, stage):
        self.case.current_stage = stage
        self.case.save(update_fields=["current_stage"])

    def test_ct_confirmation_cannot_bypass_stage_guard_by_omitting_advance(self):
        result = self.prepare_ct_result()
        url = reverse("doctor-ct-result-confirm", kwargs={"case_id": self.case.id, "result_id": result.id})
        for stage in (WorkflowStage.XRAY, WorkflowStage.TREATMENT):
            with self.subTest(stage=stage):
                self._stage(stage)
                response = self.client.post(url, {}, format="json")
                self.assertEqual(response.status_code, 400, response.data)
                result.refresh_from_db()
                self.assertEqual(result.result_status, "DRAFT")

    def _tnm(self, confirmed=False):
        result = ClinicalResult.objects.create(case=self.case, workflow_stage="PET_CT_TNM", result_status="CONFIRMED" if confirmed else "DRAFT")
        TnmResult.objects.create(clinical_result=result, t_category="T2", n_category="N1", m_category="M0", evidence={"stage": {"stage_group_status": "candidate_ready", "stage_group_candidate": "IIB"}})
        return result

    def test_tnm_confirm_and_stage_writes_require_current_stage(self):
        for stage in (WorkflowStage.XRAY, WorkflowStage.TREATMENT):
            for endpoint in ("doctor-tnm-confirm", "doctor-tnm-stage", "doctor-tnm-stage-confirm"):
                with self.subTest(stage=stage, endpoint=endpoint):
                    self._stage(stage)
                    result = self._tnm(confirmed=endpoint != "doctor-tnm-confirm")
                    url = reverse(endpoint, kwargs={"case_id": self.case.id, "result_id": result.id})
                    with patch("apps.clinical.views.request_tnm_stage", return_value={"stage_group_status": "candidate_ready", "stage_group_candidate": "IIB"}) as inference:
                        response = self.client.post(url, {}, format="json")
                    self.assertEqual(response.status_code, 400, response.data)
                    inference.assert_not_called()
                    result.tnm_detail.refresh_from_db()
                    self.assertFalse(result.tnm_detail.stage_group)
                    result.delete()

    def test_tnm_stage_candidate_can_be_calculated_before_category_confirmation(self):
        self._stage(WorkflowStage.PET_CT_TNM)
        result = self._tnm(confirmed=False)
        candidate = {
            "stage_group_status": "candidate_ready",
            "stage_group_candidate": "IIB",
            "warnings": [],
        }

        with patch("apps.clinical.views.request_tnm_stage", return_value=candidate):
            response = self.client.post(reverse(
                "doctor-tnm-stage",
                kwargs={"case_id": self.case.id, "result_id": result.id},
            ), {}, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        result.refresh_from_db()
        result.tnm_detail.refresh_from_db()
        self.assertEqual(result.result_status, ClinicalResult.ResultStatus.DRAFT)
        self.assertEqual(result.tnm_detail.evidence["stage"], candidate)

    def test_ct_and_tnm_draft_writes_require_current_stage(self):
        for stage, analysis_type, endpoint, payload in (
            ("CT", "CT_ANALYSIS", "doctor-ct-result", {"overall_assessment": "NODULE_DETECTED"}),
            ("PET_CT_TNM", "PET_CT_TNM_ANALYSIS", "doctor-tnm-draft", {"t_category": "T2", "n_category": "N1", "m_category": "M0"}),
        ):
            order = ExaminationOrder.objects.create(case=self.case, order_type=stage, requesting_doctor=self.doctor, purpose="QA boundary")
            model = ModelVersion.objects.create(model_name=stage, version="1", analysis_type=analysis_type)
            analysis = AiAnalysis.objects.create(case=self.case, examination_order=order, analysis_type=analysis_type, model_version=model, status="SUCCEEDED")
            ai = AiResult.objects.create(ai_analysis=analysis, schema_version="1", result_payload={})
            for current in ("XRAY", "TREATMENT"):
                with self.subTest(stage=stage, current=current):
                    self._stage(current)
                    response = self.client.post(reverse(endpoint, kwargs={"case_id": self.case.id}), {**payload, "reviewed_ai_result_id": str(ai.id)}, format="json")
                    self.assertEqual(response.status_code, 400, response.data)
                    self.assertFalse(ClinicalResult.objects.filter(case=self.case).exists())
