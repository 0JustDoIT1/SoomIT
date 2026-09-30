from django.test import SimpleTestCase

from apps.patients.serializers import LabResultSerializer


class LabResultValidationTests(SimpleTestCase):
    def test_negative_values_are_rejected_for_each_measurement(self):
        for field in ("creatinine", "egfr", "ast", "alt", "total_bilirubin"):
            with self.subTest(field=field):
                serializer = LabResultSerializer(data={"tested_at": "2026-09-30T00:00:00Z", field: "-1"})
                self.assertFalse(serializer.is_valid())
                self.assertIn(field, serializer.errors)

    def test_empty_measurements_are_rejected(self):
        serializer = LabResultSerializer(data={"tested_at": "2026-09-30T00:00:00Z", "egfr": None})
        self.assertFalse(serializer.is_valid())

    def test_zero_and_positive_measurements_are_accepted(self):
        for value in ("0", "90.25"):
            serializer = LabResultSerializer(data={"tested_at": "2026-09-30T00:00:00Z", "egfr": value})
            self.assertTrue(serializer.is_valid(), serializer.errors)
