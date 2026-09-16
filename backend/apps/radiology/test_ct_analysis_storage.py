from django.test import SimpleTestCase, override_settings

from apps.radiology.services.ct_analysis_storage import build_ct_analysis_output_uri


class CtAnalysisStorageTestCase(SimpleTestCase):
    @override_settings(CT_ANALYSIS_OUTPUT_GCS_PREFIX="gs://test-bucket/ct-analysis/")
    def test_builds_hospital_case_order_analysis_path(self):
        self.assertEqual(
            build_ct_analysis_output_uri(
                hospital_id="hospital-1",
                case_id="case-1",
                order_id="order-1",
                analysis_id="analysis-1",
            ),
            "gs://test-bucket/ct-analysis/hospital-1/case-1/order-1/analysis-1",
        )

    @override_settings(CT_ANALYSIS_OUTPUT_GCS_PREFIX="gs://test-bucket/ct-analysis")
    def test_rejects_path_separator_in_component(self):
        with self.assertRaises(ValueError):
            build_ct_analysis_output_uri(
                hospital_id="hospital/1",
                case_id="case-1",
                order_id="order-1",
                analysis_id="analysis-1",
            )
