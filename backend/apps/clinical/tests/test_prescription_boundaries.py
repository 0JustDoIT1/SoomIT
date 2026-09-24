from contextlib import ExitStack
from decimal import Decimal
import json
from types import SimpleNamespace as NS
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError
from apps.clinical.serializers import DoctorPrescriptionSerializer, PrescriptionItemUpdateSerializer
from apps.clinical.views import (DoctorPrescriptionAPIView as Create,
    DoctorSafetyWarningAcknowledgeAPIView as Acknowledge,
    DoctorPrescriptionItemUpdateAPIView as Update,
    DoctorPrescriptionFinalizeAPIView as Finalize,
    DoctorPrescriptionSafetyCheckAPIView as Safety)


class PrescriptionBoundaryTests(SimpleTestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        def mock(name):
            return self.stack.enter_context(patch("apps.clinical.views." + name))
        self.rx = mock("Prescription.objects")
        self.items = mock("PrescriptionItem.objects")
        self.cases = mock("LungCancerCase.objects")
        self.decisions = mock("TreatmentDecision.objects")
        self.drugs = mock("RegimenDrug.objects")
        self.profiles = mock("PatientHealthProfile.objects")
        self.medications = mock("CurrentMedication.objects")
        self.labs = mock("LabResult.objects")
        self.snapshot = mock("_safety_input_snapshot")
        self.output = mock("DoctorPrescriptionSerializer")
        self.atomic = mock("transaction.atomic")
        self.request = NS(user=object(), data={})
        self.case = NS(patient=object(), current_stage="PRESCRIPTION")
        self.cases.all.return_value.select_for_update.return_value.filter.return_value.first.return_value = self.case
        self.regimen = NS(induction_cycles=4)
        self.decisions.select_related.return_value.filter.return_value.order_by.return_value.first.return_value = NS(
            selected_regimen=self.regimen,
            requires_drug_prescription=True,
        )
        self.rx.filter.return_value.exists.return_value = False
        self.output.return_value.validated_data = {"cycle_number": 1, "phase": "INDUCTION"}
        self.output.return_value.data = {}
        self.output.return_value.save.return_value = NS(id="rx")
        self.drug = NS(dose_basis="FIXED", dose=Decimal(80), result_unit="mg",
                       drug=object(), route="ORAL", administration_day="daily", frequency=None)
        self.drugs.filter.return_value.select_related.return_value.order_by.return_value = [self.drug]
        self.prescription = MagicMock(prescription_status="VALIDATED")
        self.prescription.case.current_stage = "PRESCRIPTION"
        self.prescription.treatment_decision.clinical_result.result_status = "CONFIRMED"
        self.snapshot.return_value = {"snapshot": "current"}
        self.medications.filter.return_value.select_related.return_value = []
        (
            self.prescription.safety_check_results.filter.return_value
            .order_by.return_value.first.return_value
        ) = NS(message=json.dumps(self.snapshot.return_value))
        self.rx.select_for_update.return_value.filter.return_value.first.return_value = self.prescription
        self.rx.select_for_update.return_value.select_related.return_value.filter.return_value.first.return_value = self.prescription
        self.rx.select_for_update.return_value.select_related.return_value.prefetch_related.return_value.filter.return_value.first.return_value = self.prescription

    def create(self):
        return Create.post.__wrapped__(Create(), self.request, "case")

    def test_empty_phase_prevents_header(self):
        self.drugs.filter.return_value.select_related.return_value.order_by.return_value = []
        with self.assertRaises(ValidationError):
            self.create()
        self.output.return_value.save.assert_not_called()
        self.items.create.assert_not_called()

    def test_cycle_and_phase_serializer_validation(self):
        for value in (0, -1, 1.5, "invalid"):
            serializer = DoctorPrescriptionSerializer(data={
                "cycle_number": value, "phase": "INDUCTION", "cycle_start_date": "2026-09-14"})
            self.assertFalse(serializer.is_valid())
            self.assertIn("cycle_number", serializer.errors)
        serializer = DoctorPrescriptionSerializer(data={
            "cycle_number": 1, "phase": "INVALID", "cycle_start_date": "2026-09-14"})
        self.assertFalse(serializer.is_valid())
        self.assertIn("phase", serializer.errors)

    def test_induction_limit_and_other_phases(self):
        self.output.return_value.validated_data = {"cycle_number": 5, "phase": "INDUCTION"}
        self.assertEqual(self.create().status_code, 400)
        self.output.return_value.save.assert_not_called()
        for phase in ("MAINTENANCE", "CONTINUOUS"):
            self.output.return_value.validated_data = {"cycle_number": 5, "phase": phase}
            self.assertEqual(self.create().status_code, 201)

    def test_lock_precedes_duplicate_query_and_duplicate_blocks(self):
        events = []
        self.cases.all.return_value.select_for_update.return_value.filter.return_value.first.side_effect = lambda: events.append("lock") or self.case
        self.rx.filter.return_value.exists.side_effect = lambda: events.append("duplicate") or True
        self.assertEqual(self.create().status_code, 400)
        self.assertEqual(events, ["lock", "duplicate"])
        self.cases.all.return_value.select_for_update.assert_called_once_with(of=("self",))
        self.rx.filter.assert_called_once_with(case=self.case, regimen=self.regimen, cycle_number=1)
        self.output.return_value.save.assert_not_called()

    def test_successful_creation_locks_and_creates_items(self):
        self.assertEqual(self.create().status_code, 201)
        self.cases.all.return_value.select_for_update.assert_called_once_with(of=("self",))
        self.items.create.assert_called_once()
        self.assertIsNone(self.items.create.call_args.kwargs["final_dose"])

    def test_get_preserves_history_for_an_owned_inactive_case(self):
        inactive_case = NS(case_status="CLOSED")
        self.cases.filter.return_value.first.return_value = inactive_case
        self.rx.filter.return_value.select_related.return_value.prefetch_related.return_value.order_by.return_value = []

        response = Create().get(self.request, "case")

        self.assertEqual(response.status_code, 200)
        self.cases.filter.assert_called_once_with(id="case", primary_doctor=self.request.user)

    def test_creation_requires_the_prescription_stage(self):
        self.case.current_stage = "TREATMENT"

        response = self.create()

        self.assertEqual(response.status_code, 400)
        self.output.return_value.save.assert_not_called()

    def test_non_drug_treatment_does_not_create_a_prescription(self):
        treatment_decision = self.decisions.select_related.return_value.filter.return_value.order_by.return_value.first.return_value
        treatment_decision.selected_regimen = None
        treatment_decision.requires_drug_prescription = False

        response = self.create()

        self.assertEqual(response.status_code, 400)
        self.assertIn("비약물", response.data["detail"])
        self.output.assert_not_called()

    def test_finalize_requires_the_prescription_stage(self):
        self.prescription.case.current_stage = "TREATMENT"

        response = Finalize.post.__wrapped__(Finalize(), self.request, "case", "rx")

        self.assertEqual(response.status_code, 400)
        self.prescription.save.assert_not_called()

    def test_finalize_rejects_draft_and_repeated_final_requests(self):
        for prescription_status in ("DRAFT", "FINAL"):
            with self.subTest(prescription_status=prescription_status):
                self.prescription.prescription_status = prescription_status
                self.prescription.save.reset_mock()

                response = Finalize.post.__wrapped__(Finalize(), self.request, "case", "rx")

                self.assertEqual(response.status_code, 400)
                self.prescription.save.assert_not_called()

    def test_invalid_final_dose_has_no_writes(self):
        for value in ("NaN", "Infinity", "-Infinity", "-1", "0.0001", "1000000000", "bad", None):
            self.request.data = {"final_dose": value}
            with self.subTest(value=value), self.assertRaises(ValidationError):
                Update.patch.__wrapped__(Update(), self.request, "case", "rx", "item")
            self.items.filter.return_value.first.return_value.save.assert_not_called()
            self.prescription.safety_check_results.all.return_value.delete.assert_not_called()
            self.prescription.save.assert_not_called()

    def test_patch_success_invalidates_safety_and_returns_draft(self):
        self.request.data = {"final_dose": "123.456"}
        response = Update.patch.__wrapped__(Update(), self.request, "case", "rx", "item")
        self.assertEqual(response.status_code, 200)
        self.rx.select_for_update.assert_called_once_with(of=("self",))
        item = self.items.filter.return_value.first.return_value
        self.assertEqual(item.final_dose, Decimal("123.456"))
        item.save.assert_called_once()
        self.prescription.safety_check_results.all.return_value.delete.assert_called_once()
        self.assertEqual(self.prescription.prescription_status, "DRAFT")

    def test_patch_error_reaches_atomic_rollback(self):
        self.request.data = {"final_dose": "123.456"}
        failure = RuntimeError("save failed")
        self.items.filter.return_value.first.return_value.save.side_effect = failure
        with patch("django.db.transaction.Atomic.__enter__"), \
                patch("django.db.transaction.Atomic.__exit__", return_value=False) as exit_atomic:
            with self.assertRaises(RuntimeError):
                Update().patch(self.request, "case", "rx", "item")
        self.prescription.safety_check_results.all.return_value.delete.assert_not_called()
        self.prescription.save.assert_not_called()
        self.assertIs(exit_atomic.call_args.args[1], failure)

    def test_finalize_checks_after_lock(self):
        items = self.prescription.items.all.return_value
        safety = self.prescription.safety_check_results.all.return_value
        items.exists.return_value = True
        items.filter.return_value.exists.return_value = False
        safety.exists.return_value = True
        safety.order_by.return_value.first.return_value = None
        safety.filter.return_value.exists.return_value = False
        for block, warning, expected in ((True, False, 400), (False, True, 400), (False, False, 200)):
            self.prescription.prescription_status = "VALIDATED"
            self.prescription.save.reset_mock()
            safety.filter.side_effect = lambda **kw: NS(exists=lambda: block if kw.get("result") == "BLOCK" else warning)
            response = Finalize.post.__wrapped__(Finalize(), self.request, "case", "rx")
            self.assertEqual(response.status_code, expected)
            if expected == 400:
                self.prescription.save.assert_not_called()
        self.rx.select_for_update.assert_called_with(of=("self",))

    def test_safety_rechecks_status_under_same_lock(self):
        response = Safety.post.__wrapped__(Safety(), self.request, "case", "rx")
        self.assertEqual(response.status_code, 400)
        self.rx.select_for_update.assert_called_once_with(of=("self",))
        self.prescription.safety_check_results.all.return_value.delete.assert_not_called()

    def test_unresolved_warning_cannot_be_finalized_after_acknowledgment(self):
        items = self.prescription.items.all.return_value
        safety = self.prescription.safety_check_results.all.return_value
        items.exists.return_value = True
        items.filter.return_value.exists.return_value = False
        safety.exists.return_value = True
        safety.order_by.return_value.first.return_value = None

        def safety_filter(**kwargs):
            return NS(
                exists=lambda: kwargs.get("source_code__in") is not None,
            )

        safety.filter.side_effect = safety_filter
        response = Finalize.post.__wrapped__(Finalize(), self.request, "case", "rx")
        self.assertEqual(response.status_code, 400)
        self.prescription.save.assert_not_called()

    def test_finalize_requires_safety_recheck_when_patient_inputs_changed(self):
        items = self.prescription.items.all.return_value
        safety = self.prescription.safety_check_results.all.return_value
        items.exists.return_value = True
        items.filter.return_value.exists.return_value = False
        safety.exists.return_value = True
        safety.filter.return_value.exists.return_value = False
        safety.order_by.return_value.first.return_value = NS(checked_at=object())

        with patch("apps.clinical.views.CurrentMedication.objects") as medications, \
                patch("apps.clinical.views.PatientHealthProfile.objects") as profiles, \
                patch("apps.clinical.views.LabResult.objects") as labs:
            medications.filter.return_value.exists.return_value = True
            profiles.filter.return_value.exists.return_value = False
            labs.filter.return_value.exists.return_value = False
            response = Finalize.post.__wrapped__(Finalize(), self.request, "case", "rx")

        self.assertEqual(response.status_code, 400)
        self.prescription.save.assert_not_called()

    def test_finalize_rejects_missing_malformed_or_stale_safety_snapshot(self):
        items = self.prescription.items.all.return_value
        safety = self.prescription.safety_check_results.all.return_value
        items.exists.return_value = True
        items.filter.return_value.exists.return_value = False
        safety.exists.return_value = True
        safety.filter.return_value.exists.return_value = False
        snapshot_result = (
            self.prescription.safety_check_results.filter.return_value
            .order_by.return_value.first
        )

        for saved_result in (
            None,
            NS(message="not-json"),
            NS(message=json.dumps({"snapshot": "old"})),
        ):
            with self.subTest(saved_result=saved_result):
                self.prescription.prescription_status = "VALIDATED"
                self.prescription.save.reset_mock()
                snapshot_result.return_value = saved_result

                response = Finalize.post.__wrapped__(Finalize(), self.request, "case", "rx")

                self.assertEqual(response.status_code, 400)
                self.prescription.save.assert_not_called()

    def test_prescription_serializer_hides_internal_safety_snapshot(self):
        internal = NS(source_code="SAFETY_INPUT_SNAPSHOT")
        visible = NS(source_code="DUPLICATION_CHECK")
        prescription = NS(safety_check_results=MagicMock())
        prescription.safety_check_results.all.return_value = [internal, visible]

        with patch("apps.clinical.serializers.SafetyCheckResultSerializer") as serializer:
            serializer.return_value.data = [{"source_code": "DUPLICATION_CHECK"}]
            data = DoctorPrescriptionSerializer().get_safety_check_results(prescription)

        serializer.assert_called_once_with([visible], many=True)
        self.assertEqual(data, [{"source_code": "DUPLICATION_CHECK"}])

    def test_finalized_items_cannot_be_patched(self):
        self.prescription.prescription_status = "FINAL"
        response = Update.patch.__wrapped__(Update(), self.request, "case", "rx", "item")
        self.assertEqual(response.status_code, 400)
        self.items.filter.assert_not_called()

    def test_prescription_mutations_require_the_prescription_stage(self):
        self.prescription.case.current_stage = "TREATMENT"

        update_response = Update.patch.__wrapped__(Update(), self.request, "case", "rx", "item")
        safety_response = Safety.post.__wrapped__(Safety(), self.request, "case", "rx")
        acknowledge_response = Acknowledge.post.__wrapped__(Acknowledge(), self.request, "case", "rx")

        self.assertEqual(update_response.status_code, 400)
        self.assertEqual(safety_response.status_code, 400)
        self.assertEqual(acknowledge_response.status_code, 400)
        self.items.filter.assert_not_called()
        self.prescription.safety_check_results.all.return_value.delete.assert_not_called()
        self.prescription.safety_check_results.filter.assert_not_called()

    def test_warning_acknowledgment_requires_a_reason(self):
        warning_results = self.prescription.safety_check_results.filter.return_value
        warning_results.exists.return_value = True
        self.request.data = {"acknowledgment_note": "   "}

        response = Acknowledge.post.__wrapped__(Acknowledge(), self.request, "case", "rx")

        self.assertEqual(response.status_code, 400)
        warning_results.update.assert_not_called()

    def test_warning_acknowledgment_excludes_unresolved_recheck_warnings(self):
        warning_results = self.prescription.safety_check_results.filter.return_value
        warning_results.exists.return_value = True
        acknowledgeable_results = warning_results.exclude.return_value
        acknowledgeable_results.exists.return_value = True
        self.request.data = {"acknowledgment_note": "  reviewed  "}

        response = Acknowledge.post.__wrapped__(Acknowledge(), self.request, "case", "rx")

        self.assertEqual(response.status_code, 200)
        acknowledgeable_results.update.assert_called_once()
        self.assertEqual(
            acknowledgeable_results.update.call_args.kwargs["acknowledgment_note"],
            "reviewed",
        )
