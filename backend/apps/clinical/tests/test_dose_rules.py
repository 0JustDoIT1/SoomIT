from decimal import Decimal, ROUND_HALF_UP, ROUND_HALF_EVEN, localcontext
from types import SimpleNamespace as NS
from unittest.mock import MagicMock, patch
from contextlib import ExitStack

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError
from apps.clinical.views import calculate_bsa, calculate_dose, DoctorPrescriptionAPIView
from apps.clinical.models import Drug, PrescriptionItem
from apps.clinical.serializers import PrescriptionItemSerializer


class DoseRuleTests(SimpleTestCase):
    def test_patient_bsa_half_up_exact_boundary(self):
        # 169 * 56.25 / 3600 = 2.640625 = 1.625 ** 2.
        # An even preceding digit distinguishes HALF_UP from HALF_EVEN.
        with localcontext() as context:
            context.rounding = ROUND_HALF_EVEN
            self.assertEqual(calculate_bsa(169, Decimal("56.25")), Decimal("1.625"))
            for basis, dose in (("MG_PER_M2", 500), ("AUC", 5)):
                with self.subTest(basis=basis):
                    value = calculate_dose(basis, dose, 169, Decimal("56.25"), egfr=80)
                    self.assertEqual(value["patient_bsa"], Decimal("1.63"))
                    self.assertEqual(value["patient_bsa"].as_tuple().exponent, -2)
                    self.assertIsNone(value["final_dose"])

    def test_prescription_item_serializer_preserves_contract(self):
        # Unsaved model instances: serialization must not query or write the DB.
        drug = Drug(drug_name="Carboplatin", ingredient_name="Carboplatin")
        item = PrescriptionItem(
            drug=drug, standard_dose=Decimal(5), dose_basis="AUC",
            patient_bsa=Decimal("1.63"), target_auc=Decimal(5),
            renal_value=Decimal(75), renal_value_type="BSA_ADJUSTED_EGFR",
            calculated_dose=Decimal(500), final_dose=None, unit="mg",
            route="INTRAVENOUS", administration_day="1",
        )
        output = PrescriptionItemSerializer(item).data
        existing_fields = {
            "id", "drug", "drug_name", "ingredient_name", "standard_dose",
            "dose_basis", "dose_basis_label", "patient_bsa", "target_auc",
            "renal_value", "calculated_dose", "final_dose", "unit", "route",
            "route_label", "administration_day", "frequency", "instructions",
            "mfds_item_seq",
        }
        self.assertEqual(set(output), existing_fields | {"renal_value_type"})
        self.assertEqual(output["renal_value_type"], "BSA_ADJUSTED_EGFR")
        self.assertEqual(output["drug_name"], "Carboplatin")
        self.assertEqual(Decimal(output["calculated_dose"]), Decimal(500))
        self.assertIsNone(output["final_dose"])

    def test_fixed_and_final_separation(self):
        value = calculate_dose("FIXED", Decimal("80"))
        self.assertEqual(value["calculated_dose"], Decimal("80"))
        for field in ("final_dose", "patient_bsa", "target_auc", "renal_value"):
            self.assertIsNone(value[field])

    def test_mosteller_and_unrounded_product(self):
        self.assertEqual(calculate_bsa(160, "57.6"), Decimal("1.6"))
        self.assertEqual(calculate_dose("MG_PER_M2", 500, 160, "57.6")["calculated_dose"], Decimal(800))
        value = calculate_dose("MG_PER_M2", 500, 173, 67)
        expected = (Decimal(173) * Decimal(67) / Decimal(3600)).sqrt()
        self.assertEqual(value["patient_bsa"], expected.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        self.assertEqual(value["calculated_dose"], (Decimal(500) * expected).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP))
        self.assertNotEqual(value["calculated_dose"], Decimal(500) * value["patient_bsa"])
        self.assertIsInstance(value["calculated_dose"], Decimal)
        self.assertIsNone(value["final_dose"])

    def test_calvert_adjusted_input(self):
        value = calculate_dose("AUC", 5, 160, "57.6", egfr=Decimal("80.12"))
        self.assertEqual(value["calculated_dose"], Decimal("495"))
        self.assertEqual(value["renal_value"], Decimal("74"))
        self.assertEqual(value["renal_value_type"], "BSA_ADJUSTED_EGFR")
        self.assertEqual(value["target_auc"], Decimal(5))
        self.assertIsNone(value["final_dose"])
        self.assertEqual(value["patient_bsa"], Decimal("1.60"))

    def test_adjustment_uses_raw_bsa_and_half_up_boundaries(self):
        value = calculate_dose("AUC", "4.5", 173, 67, egfr=Decimal("80.12"))
        raw = calculate_bsa(173, 67)
        renal = (Decimal("80.12") * raw / Decimal("1.73")).quantize(Decimal(1), rounding=ROUND_HALF_UP)
        self.assertEqual(value["renal_value"], renal)
        self.assertEqual(value["calculated_dose"], (Decimal("4.5") * (renal + 25)).quantize(Decimal(1), rounding=ROUND_HALF_UP))
        # BSA 1.73 makes adjustment exactly 80.5, testing .5 upward at both steps.
        value = calculate_dose("AUC", "4.25", 173, "62.28", egfr="80.5")
        self.assertEqual(value["renal_value"], Decimal(81))
        self.assertEqual(value["calculated_dose"], Decimal(451))

    def test_missing_invalid_inputs_fail_closed(self):
        for args in [("MG_PER_M2", 500, None, 60), ("MG_PER_M2", 500, 170, None),
                     ("MG_PER_M2", 500, 0, 60), ("AUC", 5), ("AUC", None, None, None, 80),
                     ("AUC", 0, None, None, 80), ("AUC", 5, None, None, -1),
                     ("AUC", 5, None, 60, 80), ("AUC", 5, 170, None, 80),
                     ("AUC", 5, 170, 60, None), ("AUC", None, 170, 60, 80),
                     ("FIXED", "NaN"), ("FIXED", "Infinity"), ("FIXED", None),
                     ("OTHER", 5), ("MG_PER_KG", 5), ("UNKNOWN", 5)]:
            with self.subTest(args=args), self.assertRaises(ValidationError):
                calculate_dose(*args)

    def test_prescription_uses_profile_latest_lab_and_keeps_final_empty(self):
        with ExitStack() as stack:
            def mock(name):
                return stack.enter_context(patch("apps.clinical.views." + name))
            decision = mock("TreatmentDecision.objects")
            prescriptions = mock("Prescription.objects")
            items = mock("PrescriptionItem.objects")
            drugs = mock("RegimenDrug.objects")
            profiles = mock("PatientHealthProfile.objects")
            labs = mock("LabResult.objects")
            serializers = mock("DoctorPrescriptionSerializer")
            view = DoctorPrescriptionAPIView()
            case = NS(patient=object())
            stack.enter_context(patch.object(view, "get_case", return_value=case))
            regimen = NS(induction_cycles=4)
            decision.select_related.return_value.filter.return_value.order_by.return_value.first.return_value = NS(selected_regimen=regimen)
            prescriptions.filter.return_value.exists.return_value = False
            serializer = serializers.return_value
            serializer.validated_data = {"cycle_number": 1, "phase": "INDUCTION"}
            serializer.data = {}
            serializer.save.return_value = NS(phase="INDUCTION", id="rx")
            profiles.filter.return_value.first.return_value = NS(height_cm=160, weight_kg=Decimal("57.6"))
            labs.filter.return_value.order_by.return_value.first.return_value = NS(egfr=80)
            drugs.filter.return_value.select_related.return_value.order_by.return_value = [
                NS(dose_basis=basis, dose=Decimal(dose), result_unit="mg", drug=object(),
                   route="INTRAVENOUS", administration_day="1", frequency=None)
                for basis, dose in [("FIXED", "80"), ("MG_PER_M2", "500"), ("AUC", "5")]]
            response = DoctorPrescriptionAPIView.post.__wrapped__(view, NS(user=object(), data={}), "case")
            self.assertEqual(response.status_code, 201)
            self.assertEqual([call.kwargs["calculated_dose"] for call in items.create.call_args_list],
                             [Decimal(80), Decimal(800), Decimal(495)])
            self.assertEqual(items.create.call_args_list[-1].kwargs["renal_value_type"], "BSA_ADJUSTED_EGFR")
            self.assertEqual(items.create.call_args_list[-1].kwargs["renal_value"], Decimal(74))
            self.assertTrue(all(call.kwargs["final_dose"] is None for call in items.create.call_args_list))
            self.assertTrue(all(call.kwargs["unit"] == "mg" for call in items.create.call_args_list))
            labs.filter.return_value.order_by.assert_called_once_with("-tested_at", "-id")
