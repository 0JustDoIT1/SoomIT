from datetime import date
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.cases.models import LungCancerCase
from apps.clinical.medication_schedule_serializers import DoctorMedicationScheduleSerializer
from apps.clinical.models import ClinicalResult, Drug, Prescription, PrescriptionItem, Regimen, SafetyCheckResult, TreatmentDecision
from apps.patients.models import MedicationSchedule, Patient, PatientAccount


class MedicationScheduleValidationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        hospital = Hospital.objects.create(name="Schedule Hospital", code="MED-SCOPE")
        department = Department.objects.create(hospital=hospital, code="PULMONOLOGY", name="Pulmonology")
        role = DepartmentRole.objects.create(department=department, role="DOCTOR", display_name="Doctor")
        cls.doctor = User.objects.create_user(login_id="med-scope-doctor", name="Doctor", department_role=role, account_status="ACTIVE")
        patient = Patient.objects.create(hospital=hospital, patient_code="MED-SCOPE", name="Synthetic", birth_date=date(1970, 1, 1), sex="FEMALE", phone_number="01000000000", phone_number_hash="med-scope")
        cls.account = PatientAccount.objects.create(patient=patient, name="Synthetic", phone_number_hash="med-scope-account", link_status="LINKED")
        cls.case = LungCancerCase.objects.create(patient=patient, case_code="MED-SCOPE", primary_doctor=cls.doctor, current_stage="PRESCRIPTION")
        result = ClinicalResult.objects.create(case=cls.case, workflow_stage="TREATMENT", result_status="CONFIRMED")
        decision = TreatmentDecision.objects.create(clinical_result=result, ai_recommendation_action="NOT_USED", treatment_type="TARGETED_THERAPY", treatment_plan="Synthetic")
        regimen = Regimen.objects.create(regimen_code="MED-SCOPE", regimen_name="Synthetic", cancer_type="NSCLC")
        cls.prescription = Prescription.objects.create(case=cls.case, treatment_decision=decision, regimen=regimen, cycle_number=1, phase="CONTINUOUS", cycle_start_date=date(2026, 9, 27), prescription_status="FINAL", prescribed_by_user=cls.doctor, prescribed_at=timezone.now())
        other = Prescription.objects.create(case=cls.case, treatment_decision=decision, regimen=regimen, cycle_number=2, phase="CONTINUOUS", cycle_start_date=date(2026, 9, 27), prescription_status="FINAL", prescribed_by_user=cls.doctor, prescribed_at=timezone.now())
        drug = Drug.objects.create(drug_name="Synthetic", ingredient_name="Synthetic")
        cls.items = {}
        for name, rx, route in (("oral", cls.prescription, "ORAL"), ("foreign", other, "ORAL"), ("nonoral", cls.prescription, "INTRAVENOUS")):
            cls.items[name] = PrescriptionItem.objects.create(prescription=rx, drug=drug, standard_dose=80, dose_basis="FIXED", final_dose=80, unit="mg", route=route)

    def setUp(self):
        self.client = APIClient()
        token = RefreshToken.for_user(self.doctor)
        token["hospital_id"] = str(self.case.patient.hospital_id)
        token["department_code"] = "PULMONOLOGY"
        token["role"] = "DOCTOR"
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        self.url = reverse("doctor-medication-schedule-list-create", kwargs={"case_id": self.case.id, "prescription_id": self.prescription.id})

    def payload(self, item="oral"):
        ids = [] if item == "empty" else [str(uuid4()) if item == "missing" else str(self.items[item].id)]
        return {"prescription_item_ids": ids, "reminder_time": "09:00", "start_date": "2026-09-27", "repeat_type": "DAILY"}

    def test_serializer_valid_oral_item(self):
        serializer = DoctorMedicationScheduleSerializer(data=self.payload(), context={"prescription": self.prescription})
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_serializer_rejects_foreign_nonoral_empty_and_missing_items(self):
        for item in ("foreign", "nonoral", "empty", "missing"):
            with self.subTest(item=item):
                serializer = DoctorMedicationScheduleSerializer(data=self.payload(item), context={"prescription": self.prescription})
                self.assertFalse(serializer.is_valid())
                self.assertIn("prescription_item_ids", serializer.errors)

    def test_api_creates_valid_schedule_and_items(self):
        response = self.client.post(self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        schedule = MedicationSchedule.objects.get(id=response.data["id"])
        self.assertEqual(schedule.prescription_id, self.prescription.id)
        self.assertEqual(schedule.patient_account_id, self.account.id)
        self.assertEqual(schedule.items.get().prescription_item_id, self.items["oral"].id)

    def test_api_rejects_invalid_create_without_writes(self):
        for item in ("foreign", "nonoral", "empty", "missing"):
            with self.subTest(item=item):
                response = self.client.post(self.url, self.payload(item), format="json")
                self.assertEqual(response.status_code, 400, response.data)
                self.assertFalse(MedicationSchedule.objects.exists())

    def test_api_patch_rejects_invalid_items_and_preserves_relationship(self):
        response = self.client.post(self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        url = reverse("doctor-medication-schedule-detail", kwargs={"case_id": self.case.id, "prescription_id": self.prescription.id, "schedule_id": response.data["id"]})
        for item in ("foreign", "nonoral", "empty", "missing"):
            with self.subTest(item=item):
                response = self.client.patch(url, {"prescription_item_ids": self.payload(item)["prescription_item_ids"]}, format="json")
                self.assertEqual(response.status_code, 400, response.data)
                self.assertEqual(MedicationSchedule.objects.get().items.get().prescription_item_id, self.items["oral"].id)
        self.assertEqual(self.client.patch(url, {"reminder_time": "10:00"}, format="json").status_code, 200)

    def finalize(self, item):
        self.prescription.prescription_status = "VALIDATED"
        self.prescription.save(update_fields=["prescription_status"])
        SafetyCheckResult.objects.create(prescription=self.prescription, check_type="DOSE", result="PASS", message="Synthetic", checked_at=timezone.now())
        url = reverse("doctor-prescription-finalize", kwargs={"case_id": self.case.id, "prescription_id": self.prescription.id})
        with patch("apps.clinical.views.evaluate_prescription_safety_freshness", return_value=SimpleNamespace(status="CURRENT")):
            return self.client.post(url, {"medication_schedules": [self.payload(item)]}, format="json")

    def test_nested_finalize_accepts_valid_schedule(self):
        response = self.finalize("oral")
        self.assertEqual(response.status_code, 200, response.data)
        self.prescription.refresh_from_db()
        self.assertEqual(self.prescription.prescription_status, "FINAL")
        self.assertEqual(MedicationSchedule.objects.get().items.get().prescription_item_id, self.items["oral"].id)

    def test_nested_finalize_rejects_invalid_items_without_finalizing(self):
        for item in ("foreign", "nonoral", "empty", "missing"):
            with self.subTest(item=item):
                response = self.finalize(item)
                self.assertEqual(response.status_code, 400, response.data)
                self.prescription.refresh_from_db()
                self.assertEqual(self.prescription.prescription_status, "VALIDATED")
                self.assertFalse(MedicationSchedule.objects.exists())
