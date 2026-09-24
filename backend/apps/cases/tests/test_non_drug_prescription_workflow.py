from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import uuid4

from django.test import SimpleTestCase

from apps.cases.views import DoctorCaseWorkflowDecisionAPIView
from apps.clinical.models import TreatmentDecision


class NonDrugPrescriptionWorkflowTests(SimpleTestCase):
    def run_closure(self, treatment_decision, *, has_final=False, has_any=False):
        case = Mock(id=uuid4(), current_stage="PRESCRIPTION", case_status="ACTIVE")
        result = SimpleNamespace(
            id=uuid4(),
            workflow_stage="TREATMENT",
            treatment_detail=treatment_decision,
        )
        request = SimpleNamespace(
            user=Mock(),
            data={
                "action": "CASE_CLOSED",
                "source_clinical_result_id": str(result.id),
                "target_stage": None,
                "reason": "Confirmed treatment plan",
            },
        )

        with patch("apps.cases.views.LungCancerCase.objects") as cases, \
                patch("apps.cases.views.ClinicalResult.objects") as results, \
                patch("apps.cases.views.Prescription.objects") as prescriptions, \
                patch("apps.cases.views.ClinicianDecision.objects") as decisions:
            cases.select_for_update.return_value.filter.return_value.first.return_value = case
            results.select_for_update.return_value.filter.return_value.first.return_value = result

            def prescription_filter(**kwargs):
                exists = has_final if "prescription_status" in kwargs else has_any
                return SimpleNamespace(exists=lambda: exists)

            prescriptions.filter.side_effect = prescription_filter
            response = DoctorCaseWorkflowDecisionAPIView.post.__wrapped__(
                DoctorCaseWorkflowDecisionAPIView(), request, case.id,
            )
            return response, case, decisions

    def test_surgery_radiation_and_observation_can_close_without_prescription(self):
        for treatment_type in (
            TreatmentDecision.TreatmentType.SURGERY,
            TreatmentDecision.TreatmentType.RADIATION,
            TreatmentDecision.TreatmentType.OBSERVATION,
        ):
            with self.subTest(treatment_type=treatment_type):
                response, case, decisions = self.run_closure(
                    TreatmentDecision(treatment_type=treatment_type),
                )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(case.case_status, "CLOSED")
                decisions.create.assert_called_once()

    def test_drug_treatment_still_requires_a_final_prescription(self):
        response, case, decisions = self.run_closure(
            TreatmentDecision(
                treatment_type=TreatmentDecision.TreatmentType.CHEMOTHERAPY,
            ),
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(case.case_status, "ACTIVE")
        decisions.create.assert_not_called()

    def test_non_drug_treatment_with_existing_prescription_history_requires_final(self):
        response, case, decisions = self.run_closure(
            TreatmentDecision(
                treatment_type=TreatmentDecision.TreatmentType.OBSERVATION,
            ),
            has_any=True,
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(case.case_status, "ACTIVE")
        decisions.create.assert_not_called()

    def test_final_prescription_keeps_the_existing_closure_path(self):
        response, case, decisions = self.run_closure(
            TreatmentDecision(
                treatment_type=TreatmentDecision.TreatmentType.CHEMOTHERAPY,
            ),
            has_final=True,
            has_any=True,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(case.case_status, "CLOSED")
        decisions.create.assert_called_once()
