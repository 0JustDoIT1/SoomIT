from decimal import Decimal
from types import SimpleNamespace as NS
from unittest.mock import patch

from django.test import SimpleTestCase

from apps.clinical.safety import build_safety_input_snapshot
from apps.patients.views import DoctorAllergyProfileAPIView


class DoctorAllergyProfileAPITests(SimpleTestCase):
    def setUp(self):
        self.patient = object()
        self.case = NS(patient=self.patient)
        self.request = NS(user=object(), data={
            "height_cm": "170.5",
            "weight_kg": "65.25",
            "allergy_status": "PRESENT",
            "allergies": ["Penicillin"],
        })
        self.view = DoctorAllergyProfileAPIView()
        self.view.kwargs = {"case_id": "case-1"}
        self.view.request = self.request

    def profile(self, **overrides):
        values = {
            "patient": self.patient,
            "height_cm": Decimal("170.50"),
            "weight_kg": Decimal("65.25"),
            "allergy_status": "PRESENT",
            "allergies": ["Penicillin"],
        }
        values.update(overrides)
        return NS(**values)

    def test_missing_profile_is_created_for_the_scoped_case_patient(self):
        saved = self.profile()
        with patch.object(self.view, "get_case", return_value=self.case), patch(
            "apps.patients.views.PatientHealthProfile.objects"
        ) as profiles:
            profiles.filter.return_value.first.return_value = None
            profiles.update_or_create.return_value = (saved, True)

            response = DoctorAllergyProfileAPIView.patch.__wrapped__(
                self.view, self.request, "case-1"
            )

        self.assertEqual(response.status_code, 200)
        profiles.update_or_create.assert_called_once_with(
            patient=self.patient,
            defaults={
                "height_cm": Decimal("170.5"),
                "weight_kg": Decimal("65.25"),
                "allergy_status": "PRESENT",
                "allergies": ["Penicillin"],
            },
        )

    def test_existing_profile_is_updated_and_reloaded_values_are_returned(self):
        existing = self.profile(
            height_cm=Decimal("160"), weight_kg=Decimal("55"),
            allergy_status="NONE", allergies=[],
        )
        saved = self.profile()
        with patch.object(self.view, "get_case", return_value=self.case), patch(
            "apps.patients.views.PatientHealthProfile.objects"
        ) as profiles:
            profiles.filter.return_value.first.side_effect = [existing, saved]
            profiles.update_or_create.return_value = (saved, False)

            patch_response = DoctorAllergyProfileAPIView.patch.__wrapped__(
                self.view, self.request, "case-1"
            )
            get_response = self.view.get(self.request, "case-1")

        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.data["height_cm"], "170.50")
        self.assertEqual(get_response.data["weight_kg"], "65.25")
        self.assertEqual(get_response.data["allergies"], ["Penicillin"])

    def test_unowned_or_inactive_case_cannot_create_or_update_a_profile(self):
        with patch("apps.patients.views.LungCancerCase.objects") as cases, patch(
            "apps.patients.views.PatientHealthProfile.objects"
        ) as profiles:
            cases.select_related.return_value.filter.return_value.first.return_value = None
            response = DoctorAllergyProfileAPIView.patch.__wrapped__(
                self.view, self.request, "case-1"
            )

        self.assertEqual(response.status_code, 404)
        cases.select_related.return_value.filter.assert_called_once_with(
            id="case-1",
            primary_doctor=self.request.user,
            case_status="ACTIVE",
        )
        profiles.filter.assert_not_called()
        profiles.update_or_create.assert_not_called()

    def test_missing_profile_get_returns_an_editable_initial_state(self):
        with patch.object(self.view, "get_case", return_value=self.case), patch(
            "apps.patients.views.PatientHealthProfile.objects"
        ) as profiles:
            profiles.filter.return_value.first.return_value = None
            response = self.view.get(self.request, "case-1")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {
            "allergy_status": "UNCONFIRMED",
            "allergies": [],
            "height_cm": None,
            "weight_kg": None,
        })

    def test_saved_allergy_values_feed_the_existing_safety_snapshot(self):
        saved = self.profile()

        snapshot = build_safety_input_snapshot(
            items=[], medications=[], patient_profile=saved, latest_lab=None,
        )

        self.assertEqual(snapshot["profile"]["allergy_status"], "PRESENT")
        self.assertEqual(snapshot["profile"]["allergies"], ["Penicillin"])
