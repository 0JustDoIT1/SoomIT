"""Persist one synthetic case through every stage; mock only external DUR."""
from datetime import date
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from apps.cases.tests import test_examination_order_api as order_tests
from apps.cases.models import ExaminationOrder
from apps.clinical.dur_client import DurResult
from apps.clinical.models import (
    ClinicalResult, CtResult, TnmResult, PathologyResult, GeneResult, GeneFinding,
    PDL1Result, Regimen, TreatmentRule, Drug, RegimenDrug, TreatmentDecision, Prescription,
)
from apps.pathology.models import PathologyWorkItem
from apps.patients.models import PatientHealthProfile, LabResult


class ClinicalWorkflowEndToEndTests(TestCase):
    setUp = order_tests.DoctorExaminationOrderAPITests.setUp

    def api_url(self, name, **kwargs):
        return reverse(name, kwargs={"case_id": self.case.id, **kwargs})

    def post(self, name, data=None, expected=200, **kwargs):
        response = self.client.post(self.api_url(name, **kwargs), data or {}, format="json")
        self.assertEqual(response.status_code, expected, response.data)
        return response

    def stage(self, expected):
        self.case.refresh_from_db()
        self.assertEqual(self.case.current_stage, expected)
        self.visited.append(expected)

    def submitted(self, stage):
        order = ExaminationOrder.objects.get(case=self.case, order_type=stage)
        result = ClinicalResult.objects.create(case=self.case, examination_order=order, workflow_stage=stage, result_status="DRAFT")
        PathologyWorkItem.objects.create(case=self.case, examination_order=order, task_type="DIAGNOSTIC_REVIEW", status="PENDING")
        return result

    def test_one_case_xray_to_final_and_closure_with_persisted_guards(self):
        self.visited = []
        self.stage("XRAY")
        self.post("doctor-xray-workflow", {"assessment": "SUSPICIOUS", "finding_summary": "QA opacity", "next_action": "ORDER_CT", "priority": "NORMAL", "purpose": "QA CT", "clinical_note": "Synthetic test"}, expected=201)
        self.stage("CT")
        ct = ClinicalResult.objects.create(case=self.case, examination_order=ExaminationOrder.objects.get(case=self.case, order_type="CT"), workflow_stage="CT", result_status="DRAFT")
        CtResult.objects.create(clinical_result=ct, overall_assessment="NODULE_DETECTED")
        self.post("doctor-ct-result-confirm", {"advance_to_next_stage": True}, result_id=ct.id)
        self.stage("PET_CT_TNM")
        tnm = ClinicalResult.objects.create(case=self.case, examination_order=ExaminationOrder.objects.get(case=self.case, order_type="PET_CT_TNM"), workflow_stage="PET_CT_TNM", result_status="DRAFT")
        detail = TnmResult.objects.create(clinical_result=tnm, t_category="T2", n_category="N1", m_category="", evidence={"stage": {"stage_group_status": "candidate_ready", "stage_group_candidate": "IV"}})
        self.post("doctor-tnm-confirm", result_id=tnm.id, expected=400)
        detail.m_category = "M1"
        detail.save(update_fields=["m_category"])
        self.post("doctor-tnm-confirm", result_id=tnm.id)
        self.post("doctor-tnm-stage-confirm", {"advance_to_next_stage": True}, result_id=tnm.id)
        self.stage("PATHOLOGY_GENE")
        pathology = self.submitted("PATHOLOGY_GENE")
        PathologyResult.objects.create(clinical_result=pathology, malignancy_status="MALIGNANT", histologic_type="NSCLC", subtype="LUAD")
        gene = GeneResult.objects.create(clinical_result=pathology)
        GeneFinding.objects.create(gene_result=gene, gene_symbol="EGFR", assessment="LIKELY_POSITIVE")
        payload = {"gene_findings": [{"gene_symbol": "EGFR", "assessment": "LIKELY_POSITIVE", "alteration_code": None}]}
        self.post("doctor-submitted-pathology-result-confirm", payload, result_id=pathology.id, expected=400)
        self.assertEqual(self.case.current_stage, "PATHOLOGY_GENE")
        payload["gene_findings"][0]["alteration_code"] = "EGFR_EX19_DEL"
        self.post("doctor-submitted-pathology-result-confirm", payload, result_id=pathology.id)
        self.assertEqual(gene.gene_findings.get().alteration_code, "EGFR_EX19_DEL")
        self.post("doctor-case-workflow-decision", {"action": "PROCEED_NEXT_STAGE", "source_clinical_result_id": str(pathology.id), "target_stage": "PDL1"})
        self.stage("PDL1")
        pdl1 = self.submitted("PDL1")
        PDL1Result.objects.create(clinical_result=pdl1, tps_percent=60)
        self.post("doctor-submitted-pathology-result-confirm", {"tps_percent": 60, "indeterminate_reason": ""}, result_id=pdl1.id)
        self.post("doctor-case-workflow-decision", {"action": "PROCEED_NEXT_STAGE", "source_clinical_result_id": str(pdl1.id), "target_stage": "TREATMENT"})
        self.stage("TREATMENT")
        regimen = Regimen.objects.create(regimen_code="R1", regimen_name="QA R1", cancer_type="NSCLC")
        TreatmentRule.objects.create(rule_code="TR01", cancer_type="NSCLC", biomarker_condition={"alterations": {"EGFR": ["EGFR_EX19_DEL", "EGFR_L858R"]}}, regimen=regimen, priority=1)
        candidates = self.client.get(self.api_url("doctor-regimen-candidates"))
        self.assertEqual(candidates.status_code, 200)
        self.assertEqual([row["regimen_detail"]["regimen_code"] for row in candidates.data], ["R1"])
        self.post("doctor-treatment-decision", {"treatment_type": "TARGETED_THERAPY", "treatment_plan": "QA", "ai_recommendation_action": "NOT_USED", "selected_regimen": str(regimen.id)}, expected=201)
        decision = TreatmentDecision.objects.get(clinical_result__case=self.case)
        self.assertEqual(decision.selected_regimen, regimen)
        self.post("doctor-treatment-decision-confirm")
        self.stage("PRESCRIPTION")
        self.post("doctor-treatment-decision-confirm", expected=400)
        drug = Drug.objects.create(drug_name="QA drug", ingredient_name="QA ingredient", mfds_item_seq="999999999")
        RegimenDrug.objects.create(regimen=regimen, drug=drug, dose=80, dose_unit="mg", result_unit="mg", dose_basis="FIXED", route="INTRAVENOUS", administration_day="1", sequence=1, phase="CONTINUOUS")
        rx_response = self.post("doctor-prescription-list-create", {"cycle_number": 1, "phase": "CONTINUOUS", "cycle_start_date": str(date.today())}, expected=201)
        rx = Prescription.objects.get(id=rx_response.data["id"])
        self.assertEqual(rx.regimen, regimen)
        self.assertEqual(rx.items.get().calculated_dose, 80)
        self.post("doctor-prescription-finalize", prescription_id=rx.id, expected=400)
        PatientHealthProfile.objects.create(patient=self.case.patient, allergy_status="NONE")
        lab = LabResult.objects.create(patient=self.case.patient, creatinine=1, egfr=90, ast=20, alt=20, total_bilirubin=1, tested_at=timezone.now(), recorded_by_user=self.doctor)
        item = rx.items.get()
        item_url = self.api_url("doctor-prescription-item-update", prescription_id=rx.id, item_id=item.id)
        item_response = self.client.patch(item_url, {"final_dose": "80", "mfds_item_seq": "999999999"}, format="json")
        self.assertEqual(item_response.status_code, 200, item_response.data)
        with patch("apps.clinical.views.DurClient.query", return_value=DurResult(status="SUCCESS_EMPTY", source_operation="QA", item_seq="999999999")):
            self.post("doctor-prescription-safety-check", prescription_id=rx.id)
            rx.refresh_from_db()
            self.assertEqual(rx.prescription_status, "VALIDATED")
            lab.egfr = 89
            lab.save(update_fields=["egfr"])
            self.post("doctor-prescription-finalize", prescription_id=rx.id, expected=400)
            self.post("doctor-prescription-safety-check", prescription_id=rx.id)
        self.post("doctor-prescription-finalize", {"medication_schedules": []}, prescription_id=rx.id)
        rx.refresh_from_db()
        self.assertEqual(rx.prescription_status, "FINAL")
        self.post("doctor-prescription-finalize", prescription_id=rx.id, expected=400)
        item_url = self.api_url("doctor-prescription-item-update", prescription_id=rx.id, item_id=item.id)
        self.assertEqual(self.client.patch(item_url, {"final_dose": 1}, format="json").status_code, 400)
        self.assertEqual(self.client.delete(item_url).status_code, 405)
        self.assertEqual(self.client.delete(self.api_url("doctor-prescription-list-create")).status_code, 405)
        self.post("doctor-case-workflow-decision", {"action": "CASE_CLOSED", "source_clinical_result_id": str(decision.clinical_result_id), "reason": "QA complete", "follow_up_plan": "QA follow-up"})
        self.case.refresh_from_db()
        self.assertEqual(self.case.case_status, "CLOSED")
        self.assertEqual(self.visited, ["XRAY", "CT", "PET_CT_TNM", "PATHOLOGY_GENE", "PDL1", "TREATMENT", "PRESCRIPTION"])
