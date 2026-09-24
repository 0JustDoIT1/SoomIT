from contextlib import ExitStack
from types import SimpleNamespace as NS
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from apps.clinical.views import (
    DoctorPrescriptionSafetyCheckAPIView as Safety,
    _allergy_names,
    _dur_pair_matches,
    _safety_input_snapshot,
)


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
        self.serializers.return_value.data = {}
        self.request = NS(user=object(), data={})
        self.patient = object()
        self.safety_results = MagicMock()
        self.safety_results.filter.return_value.exists.return_value = False
        self.prescription = NS(
            prescription_status="DRAFT",
            case=NS(patient=self.patient),
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

    def test_allergy_exact_match_and_unconfirmed_states(self):
        item = self.prescription_item(drug_name="Pemetrexed", ingredient="Pemetrexed")
        self.prescription.items.all.return_value = [item]

        self.profiles.filter.return_value.first.return_value = NS(allergies=["pemetrexed"])
        self.post()
        self.assertEqual(self.created(source_code="ALLERGY_CHECK", result="BLOCK")[0]["prescription_item"], item)

        self.results.create.reset_mock()
        self.profiles.filter.return_value.first.return_value = None
        self.post()
        self.assertTrue(self.created(source_code="ALLERGY_UNCONFIRMED", result="WARNING"))

        self.results.create.reset_mock()
        self.profiles.filter.return_value.first.return_value = NS(allergies={"invalid": "shape"})
        self.post()
        self.assertTrue(self.created(source_code="ALLERGY_UNCONFIRMED", result="WARNING"))

    def test_allergy_empty_list_is_confirmed_and_fuzzy_name_does_not_block(self):
        item = self.prescription_item(drug_name="Pemetrexed", ingredient="Pemetrexed")
        self.prescription.items.all.return_value = [item]
        self.profiles.filter.return_value.first.return_value = NS(allergies=["Pemetrexed sodium"])

        self.post()
        self.assertTrue(self.created(source_code="ALLERGY_CHECK", result="PASS"))
        self.assertFalse(self.created(source_code="ALLERGY_CHECK", result="BLOCK"))
        self.assertEqual(_allergy_names(NS(allergies=[])), (set(), True))

    def test_dur_exact_pair_blocks_and_unmapped_medication_warns(self):
        item = self.prescription_item(item_seq="100")
        medication = NS(
            mfds_item_seq="200",
            medication_name="Drug B",
            ingredient_name="Ingredient B",
            drug=NS(mfds_item_seq="200"),
        )
        self.prescription.items.all.return_value = [item]
        self.profiles.filter.return_value.first.return_value = NS(allergies=[])
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
        self.profiles.filter.return_value.first.return_value = NS(allergies=[])

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
        self.profiles.filter.return_value.first.return_value = NS(allergies=[])
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
        self.profiles.filter.return_value.first.return_value = NS(allergies=[])

        response = self.post()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.prescription.prescription_status, "VALIDATED")

    def test_unresolved_warning_keeps_prescription_in_draft_for_recheck(self):
        self.prescription.items.all.return_value = [self.prescription_item(item_seq="100")]
        self.profiles.filter.return_value.first.return_value = NS(allergies=[])
        self.safety_results.filter.side_effect = lambda **kwargs: NS(
            exists=lambda: kwargs.get("source_code__in") is not None,
        )

        response = self.post()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.prescription.prescription_status, "DRAFT")

    def test_block_result_keeps_prescription_in_draft(self):
        self.prescription.items.all.return_value = [self.prescription_item(item_seq="100")]
        self.profiles.filter.return_value.first.return_value = NS(allergies=[])
        self.safety_results.filter.side_effect = lambda **kwargs: NS(
            exists=lambda: kwargs.get("result") == "BLOCK",
        )

        response = self.post()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.prescription.prescription_status, "DRAFT")

    def test_validated_prescription_can_run_safety_check_again(self):
        self.prescription.prescription_status = "VALIDATED"
        self.prescription.items.all.return_value = [self.prescription_item(item_seq="100")]
        self.profiles.filter.return_value.first.return_value = NS(allergies=[])

        response = Safety.post.__wrapped__(Safety(), self.request, "case", "prescription")

        self.assertEqual(response.status_code, 200)
        self.safety_results.all.return_value.delete.assert_called_once()
