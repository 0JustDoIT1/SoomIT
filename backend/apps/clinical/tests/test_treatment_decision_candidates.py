from contextlib import ExitStack
from types import SimpleNamespace as NS
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from apps.clinical.views import (
    DoctorRegimenCandidateListAPIView as Candidates,
    DoctorTreatmentDecisionAPIView as Save,
    DoctorTreatmentDecisionConfirmAPIView as Confirm,
)
from apps.cases.models import LungCancerCase
from apps.clinical.models import ClinicalResult, Regimen, TreatmentDecision, TreatmentRule
from apps.clinical.serializers import DoctorTreatmentDecisionSerializer, TreatmentRuleCandidateSerializer


class TreatmentDecisionCandidateTests(SimpleTestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        def mock(name):
            return self.stack.enter_context(patch("apps.clinical.views." + name))
        self.cases = mock("LungCancerCase.objects")
        self.results = mock("ClinicalResult.objects")
        self.decisions = mock("TreatmentDecision.objects")
        self.audit = mock("ClinicianDecision.objects")
        self.serializer_class = mock("DoctorTreatmentDecisionSerializer")
        self.atomic = mock("transaction.atomic")
        self.candidates = self.stack.enter_context(patch.object(Candidates, "get_queryset"))
        self.candidates.return_value = [NS(regimen_id="R1"), NS(regimen_id="R2"), NS(regimen_id="R1")]
        self.case = MagicMock()
        self.case.current_stage = "TREATMENT"
        self.cases.filter.return_value.first.return_value = self.case
        self.cases.all.return_value.select_for_update.return_value.filter.return_value.first.return_value = self.case
        self.cases.select_for_update.return_value.filter.return_value.first.return_value = self.case
        self.results.filter.return_value.first.return_value = None
        self.serializer = self.serializer_class.return_value
        self.serializer.validated_data = {"selected_regimen": NS(pk="R1")}
        self.serializer.data = {"selected_regimen": "R1"}
        self.request = NS(user=object(), data={"selected_regimen": "R1"})

    def test_save_allows_both_current_candidates(self):
        for code in ("R1", "R2"):
            with self.subTest(code=code):
                self.serializer.validated_data = {"selected_regimen": NS(pk=code)}
                response = Save().post(self.request, "case")
                self.assertEqual(response.status_code, 201)
        self.assertEqual(self.results.create.call_count, 2)
        self.assertEqual(self.serializer.save.call_count, 2)

    def test_invalid_candidate_or_empty_candidates_never_writes(self):
        for candidates in ([NS(regimen_id="R1"), NS(regimen_id="R2")], []):
            self.candidates.return_value = candidates
            self.serializer.validated_data = {"selected_regimen": NS(pk="R5")}
            with self.assertRaises(ValidationError) as error:
                Save().post(self.request, "case")
            self.assertIn("selected_regimen", error.exception.detail)
            self.results.create.assert_not_called()
            self.results.get_or_create.assert_not_called()
            self.serializer.save.assert_not_called()

    def test_request_validation_precedes_candidate_query_and_writes(self):
        self.serializer.is_valid.side_effect = ValidationError({"treatment_type": "invalid"})
        with self.assertRaises(ValidationError):
            Save().post(self.request, "case")
        self.candidates.assert_not_called()

        self.results.create.assert_not_called()
        self.serializer.save.assert_not_called()

    def test_partial_update_revalidates_retained_regimen(self):
        self.results.filter.return_value.first.return_value = NS(result_status="DRAFT")
        self.decisions.filter.return_value.first.return_value = NS(selected_regimen=NS(pk="R5"))
        self.serializer.validated_data = {}
        with self.assertRaises(ValidationError):
            Save().post(self.request, "case")
        self.serializer.save.assert_not_called()

    def test_no_regimen_draft_keeps_existing_policy(self):
        self.serializer.validated_data = {"selected_regimen": None}
        self.assertEqual(Save().post(self.request, "case").status_code, 201)
        self.candidates.assert_not_called()

    def prepare_confirmation(self, regimen="R1", treatment_type="TARGETED_THERAPY"):
        clinical = MagicMock(result_status="DRAFT")
        decision = NS(clinical_result=clinical, treatment_type=treatment_type,
                      selected_regimen=NS(pk=regimen) if regimen else None)
        self.confirmation_decision = decision
        self.results.select_for_update.return_value.filter.return_value.first.return_value = clinical
        self.decisions.select_related.return_value.filter.return_value.first.return_value = decision
        return clinical

    def test_draft_rejects_a_case_outside_the_treatment_stage(self):
        self.case.current_stage = "PDL1"

        response = Save().post(self.request, "case")

        self.assertEqual(response.status_code, 400)
        self.results.create.assert_not_called()
        self.serializer.save.assert_not_called()

    def test_confirmation_rechecks_after_results_change(self):
        Save().post(self.request, "case")
        clinical = self.prepare_confirmation()
        self.candidates.return_value = []
        # Invoke the body of the existing atomic-decorated endpoint without a DB.
        with self.assertRaises(ValidationError):
            Confirm.post.__wrapped__(Confirm(), self.request, "case")
        clinical.save.assert_not_called()
        self.assertEqual(clinical.result_status, "DRAFT")
        self.audit.create.assert_not_called()
        self.case.save.assert_not_called()
        self.assertEqual(self.candidates.call_count, 2)

    def test_confirmation_allows_current_candidate(self):
        clinical = self.prepare_confirmation()
        response = Confirm.post.__wrapped__(Confirm(), self.request, "case")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(clinical.result_status, "CONFIRMED")
        clinical.save.assert_called_once()
        self.assertEqual(self.case.current_stage, "PRESCRIPTION")
        self.case.save.assert_called_once_with(update_fields=["current_stage", "updated_at"])
        self.audit.create.assert_called_once()
        self.assertEqual(self.audit.create.call_args.kwargs["target_stage"], "PRESCRIPTION")
        self.assertIs(self.confirmation_decision.clinical_result, clinical)
        self.assertIs(clinical.case, self.case)

    def test_repeated_confirmation_does_not_duplicate_decision(self):
        clinical = self.prepare_confirmation()
        clinical.result_status = "CONFIRMED"

        response = Confirm.post.__wrapped__(Confirm(), self.request, "case")

        self.assertEqual(response.status_code, 400)
        self.audit.create.assert_not_called()
        self.case.save.assert_not_called()

    def test_confirmation_preserves_required_and_optional_policy(self):
        self.prepare_confirmation(regimen=None)
        response = Confirm.post.__wrapped__(Confirm(), self.request, "case")
        self.assertEqual(response.status_code, 400)
        self.prepare_confirmation(regimen=None, treatment_type="SURGERY")
        response = Confirm.post.__wrapped__(Confirm(), self.request, "case")
        self.assertEqual(response.status_code, 200)
        self.candidates.assert_not_called()

    def test_confirmation_rejects_a_case_outside_the_treatment_stage(self):
        self.case.current_stage = "PDL1"
        response = Confirm.post.__wrapped__(Confirm(), self.request, "case")

        self.assertEqual(response.status_code, 400)
        self.audit.create.assert_not_called()
        self.case.save.assert_not_called()

    def test_non_owner_or_inactive_case_rejected_by_both_endpoints(self):
        self.cases.filter.return_value.first.return_value = None
        self.cases.all.return_value.select_for_update.return_value.filter.return_value.first.return_value = None
        self.cases.select_for_update.return_value.filter.return_value.first.return_value = None
        for reason in ("non_owner", "inactive"):
            for view in (Save(), Confirm()):
                with self.subTest(reason=reason, endpoint=type(view).__name__):
                    post = view.post if isinstance(view, Save) else lambda r, c: Confirm.post.__wrapped__(view, r, c)
                    self.assertEqual(post(self.request, "case").status_code, 404)
        self.results.create.assert_not_called()
        self.serializer.save.assert_not_called()
        self.candidates.assert_not_called()


class CandidateContractTests(SimpleTestCase):
    def test_non_drug_treatment_ignores_a_stale_legacy_regimen(self):
        decision = TreatmentDecision(
            treatment_type=TreatmentDecision.TreatmentType.OBSERVATION,
        )
        decision.selected_regimen_id = "legacy-regimen"

        self.assertFalse(decision.requires_drug_prescription)

    def test_non_drug_draft_rejects_an_explicit_regimen(self):
        serializer = DoctorTreatmentDecisionSerializer()

        with self.assertRaises(ValidationError) as error:
            serializer.validate({
                "treatment_type": TreatmentDecision.TreatmentType.SURGERY,
                "selected_regimen": object(),
            })

        self.assertIn("selected_regimen", error.exception.detail)

    def test_treatment_decision_response_exposes_server_workflow_state(self):
        case = LungCancerCase(current_stage="PRESCRIPTION", case_status="ACTIVE")
        clinical_result = ClinicalResult(
            case=case,
            workflow_stage="TREATMENT",
            result_status="CONFIRMED",
        )
        decision = TreatmentDecision(
            clinical_result=clinical_result,
            ai_recommendation_action="NOT_USED",
            treatment_type="OBSERVATION",
            treatment_plan="Observation",
        )

        payload = DoctorTreatmentDecisionSerializer(decision).data

        self.assertEqual(payload["decision_status"], "CONFIRMED")
        self.assertEqual(payload["current_stage"], "PRESCRIPTION")
        self.assertEqual(payload["case_status"], "ACTIVE")
        self.assertFalse(payload["requires_prescription"])

    def test_queryset_order_and_response_contract(self):
        view = Candidates()
        r1 = Regimen(regimen_code="R1", regimen_name="R1", cancer_type="NSCLC")
        r2 = Regimen(regimen_code="R2", regimen_name="R2", cancer_type="NSCLC")
        rules = [TreatmentRule(rule_code="TR01", priority=2, regimen=r2, cancer_type="NSCLC"),
                 TreatmentRule(rule_code="TR01", priority=1, regimen=r1, cancer_type="NSCLC")]
        with patch.object(view, "_candidate_input", return_value={"case": object()}), \
                patch.object(view, "_match_rule", return_value=["암종 일치: NSCLC"]), \
                patch("apps.clinical.views.TreatmentRule.objects") as manager:
            queryset = manager.select_related.return_value.all.return_value
            queryset.__iter__.return_value = iter(rules)
            queryset.filter.return_value.order_by.return_value = [rules[1], rules[0]]
            output = list(view.get_queryset())
            queryset.filter.return_value.order_by.assert_called_once_with("priority", "rule_code")
        payload = TreatmentRuleCandidateSerializer(
            output, many=True, context={"match_reasons_by_id": view._match_reasons},
        ).data
        self.assertEqual([row["regimen_detail"]["regimen_code"] for row in payload], ["R1", "R2"])
        for row in payload:
            self.assertTrue({"id", "regimen", "regimen_detail", "priority", "match_reasons"}.issubset(row))
            self.assertEqual(row["match_reasons"], ["암종 일치: NSCLC"])
