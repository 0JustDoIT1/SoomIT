from copy import deepcopy

from django.test import SimpleTestCase

from apps.radiology.services.ct_analysis_inference import (
    CtAnalysisInferenceError,
    validate_phase1_response,
)


BASE_PAYLOAD = {
    "status": "READY_FOR_T_MODEL",
    "case_id": "case-001",
    "artifact_uri": "gs://soomit-bucket/ct-analysis/case-001/",
    "phase1_result_uri": "gs://soomit-bucket/ct-analysis/case-001/phase1/phase1_result.json",
    "t_input_uri": "gs://soomit-bucket/ct-analysis/case-001/phase1/t_input/case-001_0000.nii.gz",
    "result": {"nodules": [{"nodule_id": "N001"}]},
    "cornerstone_manifest_uri": "gs://soomit-bucket/ct-analysis/case-001/phase1/cornerstone/cornerstone_manifest.json",
    "cornerstone_segmentation": {
        "schema_version": "ct-cornerstone-labelmap-v1",
        "scalar_type": "uint8",
        "dimensions": [12, 12, 12],
        "labelmap_uri": "gs://soomit-bucket/ct-analysis/case-001/phase1/cornerstone/labelmap.bin",
        "metadata_uri": "gs://soomit-bucket/ct-analysis/case-001/phase1/cornerstone/labelmap_metadata.json",
        "geometry_uri": "gs://soomit-bucket/ct-analysis/case-001/phase1/cornerstone/geometry.json",
        "segments": [
            {"segment_index": 1, "id": "N001", "name": "Nodule 1", "category": "NODULE", "color": [255, 59, 48]},
            {"segment_index": 101, "id": "LUL", "name": "Left upper lobe", "category": "LUNG_LOBE", "color": [103, 200, 255]},
        ],
    },
}


class ValidatePhase1ResponseCornerstoneTests(SimpleTestCase):
    def test_accepts_a_well_formed_cornerstone_segmentation(self):
        payload = validate_phase1_response(deepcopy(BASE_PAYLOAD))
        self.assertEqual(payload["cornerstone_segmentation"]["segments"][0]["id"], "N001")

    def test_missing_cornerstone_fields_are_allowed(self):
        payload = deepcopy(BASE_PAYLOAD)
        del payload["cornerstone_manifest_uri"]
        del payload["cornerstone_segmentation"]
        validate_phase1_response(payload)

    def test_rejects_manifest_uri_outside_the_artifact_prefix(self):
        payload = deepcopy(BASE_PAYLOAD)
        payload["cornerstone_manifest_uri"] = "gs://soomit-bucket/other-bucket/cornerstone_manifest.json"
        with self.assertRaises(CtAnalysisInferenceError):
            validate_phase1_response(payload)

    def test_rejects_labelmap_uri_pointing_outside_cornerstone_prefix(self):
        payload = deepcopy(BASE_PAYLOAD)
        payload["cornerstone_segmentation"]["labelmap_uri"] = (
            "gs://soomit-bucket/ct-analysis/case-001/phase1/visualization/labelmap.bin"
        )
        with self.assertRaises(CtAnalysisInferenceError):
            validate_phase1_response(payload)

    def test_rejects_duplicate_segment_ids(self):
        payload = deepcopy(BASE_PAYLOAD)
        payload["cornerstone_segmentation"]["segments"].append(
            {"segment_index": 2, "id": "N001", "name": "Duplicate", "category": "NODULE", "color": [0, 0, 0]},
        )
        with self.assertRaises(CtAnalysisInferenceError):
            validate_phase1_response(payload)

    def test_rejects_out_of_range_segment_index(self):
        payload = deepcopy(BASE_PAYLOAD)
        payload["cornerstone_segmentation"]["segments"][0]["segment_index"] = 0
        with self.assertRaises(CtAnalysisInferenceError):
            validate_phase1_response(payload)

    def test_rejects_non_gs_labelmap_uri(self):
        payload = deepcopy(BASE_PAYLOAD)
        payload["cornerstone_segmentation"]["labelmap_uri"] = "https://example.com/labelmap.bin"
        with self.assertRaises(CtAnalysisInferenceError):
            validate_phase1_response(payload)
