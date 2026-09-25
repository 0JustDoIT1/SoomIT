from django.test import SimpleTestCase

from apps.patients.services.air_quality_rules import (
    ALERT_ADVISORY,
    ALERT_WARNING,
    build_air_quality_guidance,
    grade_pm10,
    grade_pm25,
)


class AirQualityRulesTestCase(SimpleTestCase):
    def test_pm10_boundaries(self):
        expected = {
            0: "GOOD",
            30: "GOOD",
            31: "NORMAL",
            80: "NORMAL",
            81: "BAD",
            150: "BAD",
            151: "VERY_BAD",
        }
        for value, grade in expected.items():
            with self.subTest(value=value):
                self.assertEqual(grade_pm10(value), grade)

    def test_pm25_boundaries(self):
        expected = {
            0: "GOOD",
            15: "GOOD",
            16: "NORMAL",
            35: "NORMAL",
            36: "BAD",
            75: "BAD",
            76: "VERY_BAD",
        }
        for value, grade in expected.items():
            with self.subTest(value=value):
                self.assertEqual(grade_pm25(value), grade)

    def test_higher_grade_is_final_grade(self):
        result = build_air_quality_guidance(pm10=30, pm25=41)
        self.assertEqual(result["pm10_grade"], "GOOD")
        self.assertEqual(result["pm25_grade"], "BAD")
        self.assertEqual(result["final_grade"], "BAD")

    def test_advisory_guidance_has_priority(self):
        result = build_air_quality_guidance(
            pm10=10,
            pm25=5,
            alert_type=ALERT_ADVISORY,
        )
        self.assertEqual(result["final_grade"], "BAD")
        self.assertEqual(result["alert_type"], "ADVISORY")
        self.assertIn("주의보가 발령", result["message"])

    def test_warning_guidance_has_priority(self):
        result = build_air_quality_guidance(
            pm10=10,
            pm25=5,
            alert_type=ALERT_WARNING,
        )
        self.assertEqual(result["final_grade"], "VERY_BAD")
        self.assertEqual(result["alert_type"], "WARNING")
        self.assertIn("경보가 발령", result["message"])
