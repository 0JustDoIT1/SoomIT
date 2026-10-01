"""The demo Safety Check follows the persisted prescription contract without DUR calls."""

import json
from datetime import date
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.cases.models import LungCancerCase
from apps.clinical.models import (
    ClinicalResult, Drug, Prescription, PrescriptionItem, Regimen,
    SafetyCheckResult, TreatmentDecision,
)
from apps.patients.models import LabResult, Patient, PatientHealthProfile


class DemoSafetyCheckTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        hospital = Hospital.objects.create(name="Demo Safety Hospital", code="DEMO-SAFETY")
        department = Department.objects.create(hospital=hospital, code="PULMONOLOGY", name="Pulmonology")
        role = DepartmentRole.objects.create(department=department, role="DOCTOR", display_name="Doctor")
        cls.doctor = User.objects.create_user(
            login_id="demo-safety-doctor", name="Demo Doctor",
            department_role=role, account_status="ACTIVE",
        )
        cls.patient = Patient.objects.create(
            hospital=hospital, patient_code="DEMO-SAFETY", name="Synthetic",
            birth_date=date(1970, 1, 1), sex="FEMALE",
            phone_number="01000000000", phone_number_hash="demo-safety",
        )
        cls.case = LungCancerCase.objects.create(
            patient=cls.patient, case_code="DEMO-SAFETY",
            primary_doctor=cls.doctor, current_stage="PRESCRIPTION",
        )
        result = ClinicalResult.objects.create(
            case=cls.case, workflow_stage="TREATMENT", result_status="CONFIRMED",
        )
        decision = TreatmentDecision.objects.create(
            clinical_result=result, ai_recommendation_action="NOT_USED",
            treatment_type="TARGETED_THERAPY", treatment_plan="Synthetic",
        )
        regimen = Regimen.objects.create(
            regimen_code="DEMO-SAFETY", regimen_name="Synthetic", cancer_type="NSCLC",
        )
        cls.prescription = Prescription.objects.create(
            case=cls.case, treatment_decision=decision, regimen=regimen,
            cycle_number=1, phase="CONTINUOUS", cycle_start_date=date(2026, 9, 27),
            prescription_status="DRAFT", prescribed_by_user=cls.doctor,
            prescribed_at=timezone.now(),
        )
        drug = Drug.objects.create(drug_name="Synthetic", ingredient_name="Synthetic")
        cls.item = PrescriptionItem.objects.create(
            prescription=cls.prescription, drug=drug, standard_dose=80,
            dose_basis="FIXED", final_dose=80, unit="mg", route="ORAL",
        )
        PatientHealthProfile.objects.create(patient=cls.patient, allergy_status="NONE")
        cls.lab = LabResult.objects.create(
            patient=cls.patient, creatinine=0.9, egfr=92, ast=24, alt=28,
            total_bilirubin=0.8, tested_at=timezone.now(), recorded_by_user=cls.doctor,
        )

    def setUp(self):
        token = RefreshToken.for_user(self.doctor)
        token["hospital_id"] = str(self.case.patient.hospital_id)
        token["department_code"] = "PULMONOLOGY"
        token["role"] = "DOCTOR"
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        self.demo_url = reverse(
            "doctor-prescription-demo-safety-check",
            kwargs={"case_id": self.case.id, "prescription_id": self.prescription.id},
        )
        self.finalize_url = reverse(
            "doctor-prescription-finalize",
            kwargs={"case_id": self.case.id, "prescription_id": self.prescription.id},
        )

    @override_settings(SAFETY_DEMO_ENABLED=False)
    def test_disabled_demo_endpoint_does_not_write(self):
        response = self.client.post(self.demo_url, {}, format="json")
        self.assertEqual(response.status_code, 404)
        self.prescription.refresh_from_db()
        self.assertEqual(self.prescription.prescription_status, "DRAFT")
        self.assertFalse(SafetyCheckResult.objects.filter(prescription=self.prescription).exists())

    @override_settings(SAFETY_DEMO_ENABLED=True)
    def test_demo_pass_is_persisted_and_supports_freshness_and_finalization(self):
        with patch("apps.clinical.views.DurClient.query") as dur_query:
            response = self.client.post(self.demo_url, {}, format="json")
            dur_query.assert_not_called()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["prescription_status"], "VALIDATED")
        self.assertEqual(response.data["safety_freshness"], "CURRENT")
        self.assertEqual(len(response.data["safety_check_results"]), 5)
        self.assertTrue(all(row["result"] == "PASS" for row in response.data["safety_check_results"]))
        snapshot = SafetyCheckResult.objects.get(
            prescription=self.prescription, source_code="SAFETY_INPUT_SNAPSHOT",
        )
        self.assertEqual(snapshot.source, "DEMO_SAFETY")
        self.assertEqual(json.loads(snapshot.message)["latest_lab"]["id"], str(self.lab.id))

        self.lab.egfr = 89
        self.lab.save(update_fields=["egfr"])
        stale = self.client.post(self.finalize_url, {"medication_schedules": []}, format="json")
        self.assertEqual(stale.status_code, 400)

        refreshed = self.client.post(self.demo_url, {}, format="json")
        self.assertEqual(refreshed.status_code, 200, refreshed.data)
        self.assertEqual(refreshed.data["safety_freshness"], "CURRENT")
        finalized = self.client.post(self.finalize_url, {"medication_schedules": []}, format="json")
        self.assertEqual(finalized.status_code, 200, finalized.data)
        self.prescription.refresh_from_db()
        self.assertEqual(self.prescription.prescription_status, "FINAL")

    @override_settings(SAFETY_DEMO_ENABLED=True)
    def test_demo_keeps_final_dose_requirement(self):
        self.item.final_dose = None
        self.item.save(update_fields=["final_dose"])
        response = self.client.post(self.demo_url, {}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(SafetyCheckResult.objects.filter(prescription=self.prescription).exists())
