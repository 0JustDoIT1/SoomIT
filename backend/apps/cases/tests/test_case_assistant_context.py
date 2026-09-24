"""Unit tests for the workflow boundary applied to Case Assistant context."""

from types import SimpleNamespace

from django.test import SimpleTestCase

from apps.cases.models import ExaminationOrder, WorkflowStage
from apps.cases.services.case_assistant import filter_assistant_context_sources
from apps.clinical.models import ClinicalResult, Prescription


def result(stage, status=ClinicalResult.ResultStatus.CONFIRMED):
    return SimpleNamespace(workflow_stage=stage, result_status=status)


def analysis(analysis_type):
    return SimpleNamespace(analysis_type=analysis_type)


def order(order_type):
    return SimpleNamespace(order_type=order_type)


def prescription(status):
    return SimpleNamespace(prescription_status=status)


class CaseAssistantContextBoundaryTests(SimpleTestCase):
    def test_current_tnm_exposes_only_confirmed_prior_results_and_matching_ai(self):
        xray = result(WorkflowStage.XRAY)
        ct = result(WorkflowStage.CT)
        tnm_draft = result(WorkflowStage.PET_CT_TNM, ClinicalResult.ResultStatus.DRAFT)
        future_pathology = result(WorkflowStage.PATHOLOGY_GENE)
        future_pdl1 = result(WorkflowStage.PDL1)

        sources = filter_assistant_context_sources(
            WorkflowStage.PET_CT_TNM,
            [xray, ct, tnm_draft, future_pathology, future_pdl1],
            [
                analysis("XRAY_ANALYSIS"),
                analysis("CT_ANALYSIS"),
                analysis("PET_CT_TNM_ANALYSIS"),
                analysis("PATHOLOGY_GENE_ANALYSIS"),
                analysis("PDL1_ANALYSIS"),
                analysis("ALL_ANALYSES"),
            ],
            SimpleNamespace(clinical_result=future_pdl1),
            [prescription(Prescription.PrescriptionStatus.FINAL)],
            [
                order(ExaminationOrder.OrderType.CT),
                order(ExaminationOrder.OrderType.PET_CT_TNM),
                order(ExaminationOrder.OrderType.PATHOLOGY_GENE),
                order(ExaminationOrder.OrderType.PDL1),
            ],
        )

        self.assertEqual(sources["results"], [xray, ct])
        self.assertEqual(
            [item.analysis_type for item in sources["analyses"]],
            ["XRAY_ANALYSIS", "CT_ANALYSIS"],
        )
        self.assertIsNone(sources["treatment"])
        self.assertEqual(sources["prescriptions"], [])
        self.assertEqual(
            [item.order_type for item in sources["orders"]],
            [ExaminationOrder.OrderType.CT, ExaminationOrder.OrderType.PET_CT_TNM],
        )

    def test_treatment_and_prescription_require_their_real_final_states(self):
        pdl1 = result(WorkflowStage.PDL1)
        treatment_result = result(WorkflowStage.TREATMENT)
        treatment = SimpleNamespace(clinical_result=treatment_result)
        draft = prescription(Prescription.PrescriptionStatus.DRAFT)
        validated = prescription(Prescription.PrescriptionStatus.VALIDATED)
        final = prescription(Prescription.PrescriptionStatus.FINAL)

        treatment_sources = filter_assistant_context_sources(
            WorkflowStage.TREATMENT,
            [pdl1, treatment_result],
            [analysis("PDL1_ANALYSIS"), analysis("TREATMENT_RECOMMENDATION")],
            treatment,
            [final],
            [],
        )
        self.assertIs(treatment_sources["treatment"], treatment)
        self.assertEqual(
            [item.analysis_type for item in treatment_sources["analyses"]],
            ["PDL1_ANALYSIS", "TREATMENT_RECOMMENDATION"],
        )
        self.assertEqual(treatment_sources["prescriptions"], [])

        prescription_sources = filter_assistant_context_sources(
            WorkflowStage.PRESCRIPTION,
            [pdl1, treatment_result],
            [],
            treatment,
            [draft, validated, final],
            [],
        )
        self.assertEqual(prescription_sources["prescriptions"], [final])

    def test_draft_treatment_and_unknown_stage_fail_closed(self):
        treatment_draft = result(
            WorkflowStage.TREATMENT,
            ClinicalResult.ResultStatus.DRAFT,
        )
        treatment = SimpleNamespace(clinical_result=treatment_draft)

        sources = filter_assistant_context_sources(
            WorkflowStage.TREATMENT,
            [treatment_draft],
            [analysis("TREATMENT_RECOMMENDATION")],
            treatment,
            [],
            [],
        )
        self.assertEqual(sources["results"], [])
        self.assertEqual(sources["analyses"], [])
        self.assertIsNone(sources["treatment"])

        invalid = filter_assistant_context_sources(
            "UNKNOWN_STAGE",
            [result(WorkflowStage.XRAY)],
            [analysis("XRAY_ANALYSIS")],
            None,
            [],
            [order(ExaminationOrder.OrderType.XRAY)],
        )
        self.assertEqual(
            invalid,
            {
                "results": [],
                "analyses": [],
                "treatment": None,
                "prescriptions": [],
                "orders": [],
            },
        )
