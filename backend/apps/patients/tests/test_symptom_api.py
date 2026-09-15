from datetime import datetime, timezone as datetime_timezone
from unittest.mock import patch

from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Hospital
from apps.patients.models import Patient, SymptomLog


class PatientSymptomLogAPITests(APITestCase):
    url = "/api/patients/symptoms/"

    def setUp(self):
        hospital = Hospital.objects.create(
            name="증상 API 테스트 병원",
            code="SYMPTOM-API-TEST",
        )
        self.patient = Patient.objects.create(
            hospital=hospital,
            patient_code="P0001",
            name="테스트 환자",
            birth_date="1980-01-01",
            sex=Patient.Sex.UNKNOWN,
            phone_number="010-0000-0000",
            phone_number_hash="test-phone-hash",
        )

    def _post(self, symptom_type, severity, server_now, **extra):
        data = {
            "symptom_type": symptom_type,
            "symptom_description": "테스트 기록",
            "severity": severity,
            "logged_at": extra.get(
                "client_logged_at",
                "2000-01-01T00:00:00Z",
            ),
        }
        with patch(
            "apps.patients.views.timezone.now",
            return_value=server_now,
        ):
            return self.client.post(self.url, data, format="json")

    def test_first_symptom_of_korea_date_is_created_with_server_time(self):
        server_now = datetime(
            2026,
            9,
            14,
            15,
            30,
            tzinfo=datetime_timezone.utc,
        )

        response = self._post("기침", 3, server_now)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        symptom = SymptomLog.objects.get()
        self.assertEqual(symptom.logged_at, server_now)
        self.assertEqual(symptom.risk_level, SymptomLog.RiskLevel.GREEN)

    def test_duplicate_symptom_on_same_korea_date_returns_conflict(self):
        first_recorded_at = datetime(
            2026,
            9,
            14,
            15,
            10,
            tzinfo=datetime_timezone.utc,
        )
        existing = SymptomLog.objects.create(
            patient=self.patient,
            symptom_type="기침",
            severity=3,
            risk_level=SymptomLog.RiskLevel.GREEN,
            logged_at=first_recorded_at,
        )
        server_now = datetime(
            2026,
            9,
            15,
            5,
            0,
            tzinfo=datetime_timezone.utc,
        )

        response = self._post("기침", 5, server_now)

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "daily_symptom_duplicate")
        self.assertEqual(response.data["detail"], "오늘 이미 기침을 기록했어요.")
        self.assertEqual(response.data["symptom_type"], "기침")
        self.assertEqual(response.data["record_date"], "2026-09-15")
        self.assertEqual(response.data["existing_record_id"], str(existing.id))
        self.assertEqual(SymptomLog.objects.count(), 1)

    def test_different_symptom_on_same_korea_date_is_created(self):
        server_now = datetime(
            2026,
            9,
            15,
            3,
            0,
            tzinfo=datetime_timezone.utc,
        )
        SymptomLog.objects.create(
            patient=self.patient,
            symptom_type="기침",
            severity=3,
            risk_level=SymptomLog.RiskLevel.GREEN,
            logged_at=server_now,
        )

        response = self._post("호흡곤란", 5, server_now)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["risk_level"], SymptomLog.RiskLevel.RED)
        self.assertEqual(SymptomLog.objects.count(), 2)

    def test_same_symptom_on_next_korea_date_is_created(self):
        previous_korea_date = datetime(
            2026,
            9,
            15,
            14,
            59,
            tzinfo=datetime_timezone.utc,
        )
        SymptomLog.objects.create(
            patient=self.patient,
            symptom_type="기침",
            severity=4,
            risk_level=SymptomLog.RiskLevel.YELLOW,
            logged_at=previous_korea_date,
        )
        next_korea_date = datetime(
            2026,
            9,
            15,
            15,
            0,
            tzinfo=datetime_timezone.utc,
        )

        response = self._post("기침", 4, next_korea_date)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["risk_level"], SymptomLog.RiskLevel.YELLOW)
        self.assertEqual(SymptomLog.objects.count(), 2)
