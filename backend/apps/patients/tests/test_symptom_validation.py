from datetime import datetime, timezone as datetime_timezone

from django.test import SimpleTestCase
from rest_framework import status

from apps.patients.models import SymptomLog
from apps.patients.views import (
    DailySymptomDuplicate,
    _korea_day_window,
    calculate_symptom_risk,
)


class PatientSymptomValidationUnitTests(SimpleTestCase):
    def test_korea_day_window_changes_at_korea_midnight(self):
        before_midnight = datetime(
            2026,
            9,
            15,
            14,
            59,
            tzinfo=datetime_timezone.utc,
        )
        at_midnight = datetime(
            2026,
            9,
            15,
            15,
            0,
            tzinfo=datetime_timezone.utc,
        )

        before_date, before_start, before_end = _korea_day_window(
            before_midnight,
        )
        after_date, after_start, after_end = _korea_day_window(at_midnight)

        self.assertEqual(before_date.isoformat(), "2026-09-15")
        self.assertEqual(after_date.isoformat(), "2026-09-16")
        self.assertEqual(before_start.isoformat(), "2026-09-15T00:00:00+09:00")
        self.assertEqual(before_end, after_start)
        self.assertEqual(after_end.isoformat(), "2026-09-17T00:00:00+09:00")

    def test_duplicate_exception_has_expected_conflict_response(self):
        error = DailySymptomDuplicate(
            symptom_type="기침",
            record_date=datetime(2026, 9, 15).date(),
            existing_record_id="11111111-1111-1111-1111-111111111111",
        )

        self.assertEqual(error.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(str(error.detail["code"]), "daily_symptom_duplicate")
        self.assertEqual(
            str(error.detail["detail"]),
            "오늘 이미 기침을 기록했어요.",
        )
        self.assertEqual(str(error.detail["record_date"]), "2026-09-15")

    def test_existing_risk_rules_are_unchanged(self):
        self.assertEqual(
            calculate_symptom_risk("기침", 3),
            SymptomLog.RiskLevel.GREEN,
        )
        self.assertEqual(
            calculate_symptom_risk("기침", 4),
            SymptomLog.RiskLevel.YELLOW,
        )
        self.assertEqual(
            calculate_symptom_risk("호흡곤란", 5),
            SymptomLog.RiskLevel.RED,
        )
