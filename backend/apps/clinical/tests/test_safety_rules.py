from contextlib import ExitStack
import json
from types import SimpleNamespace as NS
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from apps.clinical.views import (
    DoctorPrescriptionSafetyCheckAPIView as Safety,
    _allergy_names,
    _dur_pair_matches,
    _safety_input_snapshot,
)
from apps.clinical.safety import SafetyFreshness, compare_safety_snapshot


class SafetyRuleTests(SimpleTestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)

        def mock(name):
            return self.stack.enter_context(patch(f"apps.clinical.views.{name}"))

        self.prescriptions = mock("Prescription.objects")
        self.results = mock("SafetyCheckResult.objects")
        self.profiles = mock("PatientHealthProfile.objects")
        self.medications = mock("CurrentMedication.objects")
        self.labs = mock("LabResult.objects")
        self.serializers = mock("DoctorPrescriptionSerializer")
        self.dur_client = mock("DurClient")
        self.freshness = mock("evaluate_prescription_safety_freshness")
        self.freshness.return_value = NS(status=SafetyFreshness.CURRENT)
        self.serializers.return_value.data = {}
        self.request = NS(user=object(), data={})
        self.patient = object()
        self.safety_results = MagicMock()
        self.safety_results.filter.return_value.exists.return_value = False
        self.prescription = NS(
            prescription_status="DRAFT",
            case=NS(patient=self.patient, current_stage="PRESCRIPTION"),
            items=MagicMock(),
            safety_check_results=self.safety_results,
            id="prescription",
            save=MagicMock(),
        )
        (
            self.prescriptions.select_for_update.return_value
            .select_related.return_value
            .prefetch_related.return_value
            .filter.return_value
            .first.return_value
        ) = self.prescription
        self.prescriptions.select_related.return_value.prefetch_related.return_value.get.return_value = self.prescription
        self.medications.filter.return_value.select_related.return_value = []
        self.labs.filter.return_value.order_by.return_value.first.return_value = NS(
            creatinine=1,
            egfr=90,
            ast=20,
            alt=20,
            total_bilirubin=1,
        )
        self.dur_client.return_value.query.return_value = NS(
            status="SUCCESS_EMPTY",
            rows=[],
        )

    def post(self):
        self.prescription.prescription_status = "DRAFT"
        return Safety.post.__wrapped__(Safety(), self.request, "case", "prescription")

    def prescription_item(self, *, drug_name="Drug A", ingredient="Ingredient A", item_seq=None, final_dose=1):
        return NS(
            mfds_item_seq=item_seq,
            final_dose=final_dose,
            drug=NS(
                drug_name=drug_name,
                ingredient_name=ingredient,
                mfds_item_seq=item_seq,
            ),
        )

    def created(self, *, source_code=None, result=None):
        records = [call.kwargs for call in self.results.create.call_args_list]
        return [
            record for record in records
            if (source_code is None or record["source_code"] == source_code)
            and (result is None or record["result"] == result)
        ]

    def test_safety_requires_item_and_final_dose_before_deleting_results(self):
        self.prescription.items.all.return_value = []
        response = self.post()
        self.assertEqual(response.status_code, 400)
        self.safety_results.all.return_value.delete.assert_not_called()
        self.prescription.items.all.return_value = [self.prescription_item(final_dose=None)]
        response = self.post()
        self.assertEqual(response.status_code, 400)
        self.safety_results.all.return_value.delete.assert_not_called()

    def test_safety_snapshot_detects_deleted_inputs(self):
        item = self.prescription_item(item_seq="100")
        item.id = "item-1"
        medication = NS(id="med-1", medication_name="Medication", ingredient_name="Ingredient", mfds_item_seq="200")
        lab = NS(id="lab-1", tested_at="2026-01-01", creatinine=1, egfr=90, ast=20, alt=20, total_bilirubin=1)
        profile = NS(allergies=[], allergy_status=None)
        snapshot = _safety_input_snapshot(items=[item], medications=[medication], patient_profile=profile, latest_lab=lab)
        self.assertNotEqual(snapshot, _safety_input_snapshot(items=[], medications=[medication], patient_profile=profile, latest_lab=lab))
        self.assertNotEqual(snapshot, _safety_input_snapshot(items=[item], medications=[], patient_profile=profile, latest_lab=lab))
        self.assertNotEqual(snapshot, _safety_input_snapshot(items=[item], medications=[medication], patient_profile=profile, latest_lab=None))

        changed_inputs = (
            _safety_input_snapshot(
                items=[item],
                medications=[NS(id="med-2", medication_name="New medication", ingredient_name="New", mfds_item_seq="201")],
                patient_profile=profile,
                latest_lab=lab,
            ),
            _safety_input_snapshot(
                items=[item],
                medications=[medication],
                patient_profile=NS(allergies=["Ingredient"], allergy_status="PRESENT"),
                latest_lab=lab,
            ),
            _safety_input_snapshot(
                items=[item],
                medications=[medication],
                patient_profile=profile,
                latest_lab=NS(id="lab-2", tested_at="2026-01-02", creatinine=2, egfr=45, ast=30, alt=30, total_bilirubin=2),
            ),
        )
        for current_snapshot in changed_inputs:
            with self.subTest(current_snapshot=current_snapshot):
                freshness = compare_safety_snapshot(
                    saved_message=json.dumps(snapshot),
                    current_snapshot=current_snapshot,
                )
                self.assertEqual(freshness.status, SafetyFreshness.RECHECK_REQUIRED)
        self.assertEqual(
            compare_safety_snapshot(
                saved_message=json.dumps(snapshot),
                current_snapshot=snapshot,
                inputs_changed=True,
            ).status,
            SafetyFreshness.RECHECK_REQUIRED,
        )

    def test_allergy_exact_match_and_unconfirmed_states(self):
        item = self.prescription_item(drug_name="Pemetrexed", ingredient="Pemetrexed")
        self.prescription.items.all.return_value = [item]

        self.profiles.filter.return_value.first.return_value = NS(allergies=["pemetrexed"], allergy_status="PRESENT")
        self.post()
        self.assertEqual(self.created(source_code="ALLERGY_CHECK", result="BLOCK")[0]["prescription_item"], item)

        self.results.create.reset_mock()
        self.profiles.filter.return_value.first.return_value = None
        self.post()
        self.assertTrue(self.created(source_code="ALLERGY_UNCONFIRMED", result="WARNING"))

        self.results.create.reset_mock()
        self.profiles.filter.return_value.first.return_value = NS(allergies={"invalid": "shape"}, allergy_status="PRESENT")
        self.post()
        self.assertTrue(self.created(source_code="ALLERGY_UNCONFIRMED", result="WARNING"))

    def test_allergy_empty_list_is_confirmed_and_fuzzy_name_does_not_block(self):
        item = self.prescription_item(drug_name="Pemetrexed", ingredient="Pemetrexed")
        self.prescription.items.all.return_value = [item]
        self.profiles.filter.return_value.first.return_value = NS(allergies=["Pemetrexed sodium"], allergy_status="PRESENT")

        self.post()
        self.assertTrue(self.created(source_code="ALLERGY_CHECK", result="PASS"))
        self.assertFalse(self.created(source_code="ALLERGY_CHECK", result="BLOCK"))
        self.assertEqual(_allergy_names(NS(allergies=[], allergy_status="NONE")), (set(), True))

    def test_unconfirmed_empty_allergy_list_is_not_treated_as_safe(self):
        self.prescription.items.all.return_value = [self.prescription_item(item_seq="100")]
        self.profiles.filter.return_value.first.return_value = NS(
            allergies=[], allergy_status="UNCONFIRMED",
        )
        self.safety_results.filter.side_effect = lambda **kwargs: NS(
            exists=lambda: kwargs.get("source_code__in") is not None,
        )

        response = self.post()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(self.created(source_code="ALLERGY_UNCONFIRMED", result="WARNING"))
        self.assertEqual(self.prescription.prescription_status, "DRAFT")

    def test_dur_exact_pair_blocks_and_unmapped_medication_warns(self):
        item = self.prescription_item(item_seq="100")
        medication = NS(
            mfds_item_seq="200",
            medication_name="Drug B",
            ingredient_name="Ingredient B",
            drug=NS(mfds_item_seq="200"),
        )
        self.prescription.items.all.return_value = [item]
        self.profiles.filter.return_value.first.return_value = NS(allergies=[], allergy_status="NONE")
        self.medications.filter.return_value.select_related.return_value = [medication]

        def query(operation, item_seq):
            if operation == "getUsjntTabooInfoList03" and item_seq == "100":
                return NS(
                    status="SUCCESS_WITH_RESULTS",
                    rows=[{
                        "item_seq": "100",
                        "mixture_item_seq": "200",
                        "prohibition_content": "병용금기",
                        "remark": None,
                    }],
                )
            return NS(status="SUCCESS_EMPTY", rows=[])

        self.dur_client.return_value.query.side_effect = query
        self.post()
        self.assertTrue(self.created(result="BLOCK"))
        self.assertTrue(_dur_pair_matches({"item_seq": "200", "mixture_item_seq": "100"}, "100", "200"))

        self.results.create.reset_mock()
        medication.drug = None
        medication.mfds_item_seq = None
        self.post()
        self.assertTrue(self.created(source_code="DUR_MAPPING_UNRESOLVED", result="WARNING"))

    def test_dur_error_and_textual_rule_are_warnings(self):
        item = self.prescription_item(item_seq="100")
        self.prescription.items.all.return_value = [item]
        self.profiles.filter.return_value.first.return_value = NS(allergies=[], allergy_status="NONE")

        self.dur_client.return_value.query.return_value = NS(status="ERROR", rows=[])
        self.post()
        self.assertTrue(self.created(source_code="DUR_API_ERROR", result="WARNING"))
        self.assertFalse(self.created(result="BLOCK"))

        self.results.create.reset_mock()

        def query(operation, item_seq):
            if operation == "getPwnmTabooInfoList03":
                return NS(
                    status="SUCCESS_WITH_RESULTS",
                    rows=[{
                        "prohibition_content": "임부금기 내용",
                        "remark": "공식 비고",
                    }],
                )
            return NS(status="SUCCESS_EMPTY", rows=[])

        self.dur_client.return_value.query.side_effect = query
        self.post()
        warnings = self.created(source_code="DUR_getPwnmTabooInfoList03", result="WARNING")
        self.assertEqual(len(warnings), 1)
        self.assertIn("임부금기 내용", warnings[0]["message"])

    def test_lab_presence_is_not_a_normality_assessment(self):
        item = self.prescription_item()
        self.prescription.items.all.return_value = [item]
        self.profiles.filter.return_value.first.return_value = NS(allergies=[], allergy_status="NONE")
        self.post()
        messages = [call.kwargs["message"] for call in self.results.create.call_args_list[-2:]]
        self.assertTrue(all("값의 존재" in message for message in messages))

        self.results.create.reset_mock()
        self.labs.filter.return_value.order_by.return_value.first.return_value = NS(
            creatinine=None, egfr=None, ast=20, alt=20, total_bilirubin=1,
        )
        self.post()
        self.assertTrue(self.created(source_code="LAB_MISSING", result="WARNING"))

        self.results.create.reset_mock()
        self.labs.filter.return_value.order_by.return_value.first.return_value = NS(
            creatinine=1, egfr=90, ast=None, alt=None, total_bilirubin=None,
        )
        self.post()
        self.assertTrue(self.created(source_code="LAB_MISSING", result="WARNING"))

    def test_clean_safety_check_transitions_to_validated(self):
        self.prescription.items.all.return_value = [self.prescription_item(item_seq="100")]
        self.profiles.filter.return_value.first.return_value = NS(allergies=[], allergy_status="NONE")

        response = self.post()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.prescription.prescription_status, "VALIDATED")

    def test_unresolved_warning_keeps_prescription_in_draft_for_recheck(self):
        self.prescription.items.all.return_value = [self.prescription_item(item_seq="100")]
        self.profiles.filter.return_value.first.return_value = NS(allergies=[], allergy_status="NONE")
        self.safety_results.filter.side_effect = lambda **kwargs: NS(
            exists=lambda: kwargs.get("source_code__in") is not None,
        )

        response = self.post()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.prescription.prescription_status, "DRAFT")

    def test_block_result_keeps_prescription_in_draft(self):
        self.prescription.items.all.return_value = [self.prescription_item(item_seq="100")]
        self.profiles.filter.return_value.first.return_value = NS(allergies=[], allergy_status="NONE")
        self.safety_results.filter.side_effect = lambda **kwargs: NS(
            exists=lambda: kwargs.get("result") == "BLOCK",
        )

        response = self.post()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.prescription.prescription_status, "DRAFT")

    def test_validated_prescription_cannot_run_safety_check_again(self):
        self.prescription.prescription_status = "VALIDATED"
        self.prescription.items.all.return_value = [self.prescription_item(item_seq="100")]
        self.profiles.filter.return_value.first.return_value = NS(allergies=[], allergy_status="NONE")

        response = Safety.post.__wrapped__(Safety(), self.request, "case", "prescription")

        self.assertEqual(response.status_code, 400)
        self.safety_results.all.return_value.delete.assert_not_called()

    def test_stale_validated_prescription_can_run_safety_check_again(self):
        self.prescription.prescription_status = "VALIDATED"
        self.prescription.items.all.return_value = [self.prescription_item(item_seq="100")]
        self.profiles.filter.return_value.first.return_value = NS(allergies=[], allergy_status="NONE")
        self.freshness.return_value = NS(status=SafetyFreshness.RECHECK_REQUIRED)

        response = Safety.post.__wrapped__(Safety(), self.request, "case", "prescription")

        self.assertEqual(response.status_code, 200)
        self.safety_results.all.return_value.delete.assert_called_once()
        self.assertEqual(self.prescription.prescription_status, "VALIDATED")
        self.assertTrue(self.results.create.called)
        self.assertTrue(all(
            "acknowledged_at" not in call.kwargs
            and "acknowledged_by_user" not in call.kwargs
            and "acknowledgment_note" not in call.kwargs
            for call in self.results.create.call_args_list
        ))

    def test_final_prescription_cannot_run_safety_check_even_when_inputs_are_stale(self):
        self.prescription.prescription_status = "FINAL"
        self.prescription.items.all.return_value = [self.prescription_item(item_seq="100")]
        self.freshness.return_value = NS(status=SafetyFreshness.RECHECK_REQUIRED)

        response = Safety.post.__wrapped__(Safety(), self.request, "case", "prescription")

        self.assertEqual(response.status_code, 400)
        self.safety_results.all.return_value.delete.assert_not_called()

    def test_unexpected_safety_failure_rolls_back_without_validation(self):
        self.prescription.items.all.return_value = [self.prescription_item(item_seq="100")]
        self.profiles.filter.return_value.first.return_value = NS(
            allergies=[], allergy_status="NONE",
        )
        failure = RuntimeError("result write failed")
        self.results.create.side_effect = [MagicMock(), failure]

        with patch("django.db.transaction.Atomic.__enter__"), \
                patch("django.db.transaction.Atomic.__exit__", return_value=False) as exit_atomic:
            with self.assertRaises(RuntimeError):
                Safety().post(self.request, "case", "prescription")

        self.assertIs(exit_atomic.call_args.args[1], failure)
        self.assertEqual(self.prescription.prescription_status, "DRAFT")
        self.prescription.save.assert_not_called()

    def test_clean_safety_check_cannot_be_submitted_twice(self):
        self.prescription.items.all.return_value = [self.prescription_item(item_seq="100")]
        self.profiles.filter.return_value.first.return_value = NS(allergies=[], allergy_status="NONE")

        first_response = Safety.post.__wrapped__(Safety(), self.request, "case", "prescription")
        second_response = Safety.post.__wrapped__(Safety(), self.request, "case", "prescription")

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(second_response.status_code, 400)
        self.safety_results.all.return_value.delete.assert_called_once()
