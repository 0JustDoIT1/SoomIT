from datetime import date
import hashlib

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.cases.models import LungCancerCase
from apps.patients.models import Patient, PatientAccount


class StaffPatientScopeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.hospital = Hospital.objects.create(name="Local", code="SCOPE-A")
        cls.other_hospital = Hospital.objects.create(name="Other", code="SCOPE-B")
        department = Department.objects.create(hospital=cls.hospital, code="ADMINISTRATION", name="Administration")
        role = DepartmentRole.objects.create(department=department, role="MEDICAL_STAFF", display_name="Staff")
        cls.staff = User.objects.create_user(login_id="scope-staff", department_role=role, name="Staff", account_status="ACTIVE")
        cls.patients = []
        cls.cases = []
        for index, hospital in enumerate((cls.hospital, cls.other_hospital)):
            patient = Patient.objects.create(hospital=hospital, patient_code=f"SCOPE-{index}", name=f"Patient {index}", birth_date=date(1970, 1, 1), sex="FEMALE", phone_number=f"0100000000{index}", phone_number_hash=f"scope-{index}")
            cls.patients.append(patient)
            cls.cases.append(LungCancerCase.objects.create(patient=patient, case_code=f"SCOPE-{index}", current_stage="XRAY"))
        cls.foreign_account = PatientAccount.objects.create(patient=cls.patients[1], name="Other patient", phone_number="01000000001", phone_number_hash=hashlib.sha256(b"01000000001").hexdigest(), link_status="LINKED")

    def setUp(self):
        self.client = APIClient()

    def login(self, user=None):
        token = RefreshToken.for_user(user or self.staff)
        token["hospital_id"] = str(self.hospital.id)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")

    def patient_url(self, index=0):
        return reverse("patient-detail", kwargs={"id": self.patients[index].id})

    def test_anonymous_patient_list_and_create_denied(self):
        for method in ("get", "post"):
            with self.subTest(method=method):
                self.assertIn(getattr(self.client, method)(reverse("patient-list"), {}, format="json").status_code, (401, 403))

    def test_anonymous_patient_detail_and_all_mutations_denied(self):
        for method in ("get", "patch", "put", "delete"):
            with self.subTest(method=method):
                self.assertIn(getattr(self.client, method)(self.patient_url(), {"name": "Denied"}, format="json").status_code, (401, 403))
        self.patients[0].refresh_from_db()
        self.assertEqual(self.patients[0].name, "Patient 0")

    def test_anonymous_case_list_and_detail_denied(self):
        for url in (reverse("case-list"), reverse("case-detail", kwargs={"id": self.cases[0].id})):
            with self.subTest(url=url):
                self.assertIn(self.client.get(url).status_code, (401, 403))

    def test_same_hospital_lists_are_filtered(self):
        self.login()
        for name, expected in (("patient-list", self.patients[0]), ("case-list", self.cases[0])):
            response = self.client.get(reverse(name))
            self.assertEqual(response.status_code, 200)
            self.assertEqual([str(row["id"]) for row in response.data], [str(expected.id)])

    def test_same_hospital_retrieve_and_patch_allowed(self):
        self.login()
        self.assertEqual(self.client.get(self.patient_url()).status_code, 200)
        self.assertEqual(self.client.get(reverse("case-detail", kwargs={"id": self.cases[0].id})).status_code, 200)
        response = self.client.patch(self.patient_url(), {"name": "Updated"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.patients[0].refresh_from_db()
        self.assertEqual(self.patients[0].name, "Updated")

    def test_cross_hospital_patient_retrieve_patch_put_denied(self):
        self.login()
        for method in ("get", "patch", "put"):
            with self.subTest(method=method):
                response = getattr(self.client, method)(self.patient_url(1), {"name": "Denied"}, format="json")
                self.assertIn(response.status_code, (403, 404))
        self.patients[1].refresh_from_db()
        self.assertEqual(self.patients[1].name, "Patient 1")

    def test_cross_hospital_case_detail_denied(self):
        self.login()
        response = self.client.get(reverse("case-detail", kwargs={"id": self.cases[1].id}))
        self.assertIn(response.status_code, (403, 404))

    def test_hospital_cannot_be_changed_by_patch(self):
        self.login()
        response = self.client.patch(self.patient_url(), {"hospital_id": str(self.other_hospital.id), "hospital": str(self.other_hospital.id)}, format="json")
        self.assertEqual(response.status_code, 200)
        self.patients[0].refresh_from_db()
        self.assertEqual(self.patients[0].hospital_id, self.hospital.id)

    def test_cross_hospital_patient_create_denied_without_writes(self):
        self.login()
        payload = {"hospital_id": str(self.other_hospital.id), "patient_code": "DENIED", "name": "Denied", "birth_date": "1970-01-01", "sex": "FEMALE", "phone_number": "01099999999", "postal_code": "01000", "primary_doctor_id": str(self.staff.id)}
        response = self.client.post(reverse("patient-list"), payload, format="json")
        self.assertIn(response.status_code, (403, 404))
        self.assertFalse(Patient.objects.filter(patient_code="DENIED").exists())

    def test_anonymous_account_lookup_denied(self):
        response = self.client.post(reverse("patient-account-lookup"), {"phone_number": "01000000001"}, format="json")
        self.assertIn(response.status_code, (401, 403))

    def test_cross_hospital_account_lookup_does_not_disclose_patient(self):
        self.login()
        response = self.client.post(reverse("patient-account-lookup"), {"phone_number": "01000000001"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"status": "NOT_FOUND"})

    def test_disabled_staff_denied(self):
        self.staff.account_status = "DISABLED"
        self.staff.save(update_fields=["account_status"])
        self.login()
        self.assertIn(self.client.get(reverse("patient-list")).status_code, (401, 403))

    def test_unaffiliated_user_denied(self):
        user = User.objects.create_user(login_id="no-hospital", name="No hospital", account_status="ACTIVE")
        self.login(user)
        self.assertEqual(self.client.get(reverse("patient-list")).status_code, 403)

    def test_live_hospital_scope_does_not_trust_stale_token_claim(self):
        self.login()
        self.staff.department_role.department.hospital = self.other_hospital
        self.staff.department_role.department.save(update_fields=["hospital"])
        self.assertEqual(self.client.get(self.patient_url()).status_code, 404)
