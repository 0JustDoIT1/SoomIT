"""Real task orchestration with isolated ORM, storage and inference boundaries."""
import json
import runpy
from contextlib import ExitStack, nullcontext
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase

from apps.radiology import tasks


class TnmHistologyTests(SimpleTestCase):
    def resolve(self, values):
        rows = [SimpleNamespace(pathology_detail=SimpleNamespace(histologic_type=value)) for value in values]
        with patch.object(tasks.ClinicalResult, "objects") as results:
            results.select_related.return_value.filter.return_value = rows
            return tasks._confirmed_histology(SimpleNamespace(case_id="case-test"))

    def test_no_pathology_returns_unknown(self):
        self.assertEqual(self.resolve([]), "unknown")

    def test_luad_uses_actual_histology(self):
        self.assertEqual(self.resolve(["LUAD"]), "adenocarcinoma")

    def test_lusc_uses_actual_histology(self):
        self.assertEqual(self.resolve(["LUSC"]), "squamous cell carcinoma")

    def test_other_supported_values_are_preserved(self):
        for value, expected in [
            ("adenocarcinoma", "adenocarcinoma"),
            ("squamous", "squamous cell carcinoma"),
            ("squamous cell carcinoma", "squamous cell carcinoma"),
            ("large cell", "large cell"), ("nos", "nos"),
            ("other-not-specified", "nos"), ("unknown", "unknown"),
        ]:
            with self.subTest(value=value):
                self.assertEqual(self.resolve([value]), expected)

    def test_multiple_results_still_fail(self):
        with self.assertRaisesRegex(ValueError, "Exactly one confirmed pathology"):
            self.resolve(["LUAD", "LUSC"])

    def test_unsupported_results_still_fail(self):
        for value in ("unsupported", "", None):
            with self.subTest(value=value):
                with self.assertRaisesRegex(ValueError, "not supported"):
                    self.resolve([value])

    def test_new_case_runs_t_phase2_n_m_and_saves_result(self):
        # Use the shipped Phase2 feature normalizer and the real backend N-input
        # loader; replace expensive inference/storage and DB writes only.
        root = Path(__file__).resolve().parents[3]
        builder = runpy.run_path(str(root / "ai-services/ct-analysis/packages/final_n_input_deploy_ready/code/build_n_payload.py"))
        events = []
        features = {}
        analysis = Mock(id="analysis-test", case_id="case-test", status=tasks.AiAnalysis.Status.PENDING)
        analysis.case.patient_id = "patient-test"
        analysis.source_image_asset.series_instance_uid = "pet-series"

        def phase2(**body):
            events.append("Phase2")
            self.assertEqual(body["histology"], "unknown")
            features.update({key: 0 for key in builder["CANONICAL_ORDER"]})
            features["histology"] = builder["normalize_histology"](body["histology"])
            features["gender"] = "male"
            features["primary_lobe"] = "RUL"
            return {"status": "READY_FOR_N_MODEL", "n_input_uri": "gs://test/n-input.json"}

        def download():
            events.append("N features")
            return json.dumps({"feature_count": 34, "feature_order": builder["CANONICAL_ORDER"], "features": features}).encode()

        with ExitStack() as stack:
            def replace(name, **kwargs):
                return stack.enter_context(patch.object(tasks, name, **kwargs))

            analyses = stack.enter_context(patch.object(tasks.AiAnalysis, "objects"))
            analyses.select_related.return_value.filter.return_value.first.return_value = analysis
            analyses.select_for_update.return_value.get.return_value = analysis
            results = stack.enter_context(patch.object(tasks.AiResult, "objects"))
            results.filter.return_value.exists.return_value = False
            results.create.side_effect = lambda **kwargs: (events.append("save"), Mock())[1]
            tnm_results = stack.enter_context(patch.object(tasks.TnmAiResult, "objects"))
            clinical = stack.enter_context(patch.object(tasks.ClinicalResult, "objects"))
            clinical.select_related.return_value.filter.return_value = []
            stack.enter_context(patch.object(tasks.transaction, "atomic", return_value=nullcontext()))
            replace("_single_confirmed_ct", side_effect=lambda _: (events.append("CT"), ("gs://test/ct", "gs://test/phase1"))[1])
            replace("_patient_phase2_inputs", return_value=(60.0, "male"))
            t = replace("request_tnm_t_analysis", side_effect=lambda **_: (events.append("T"), {"tumor_mask_uri": "gs://test/mask"})[1])
            phase = replace("request_ct_phase2_analysis", side_effect=phase2)
            storage = stack.enter_context(patch("apps.radiology.services.tnm_n_inference.storage.Client"))
            storage.return_value.bucket.return_value.blob.return_value.download_as_bytes.side_effect = download
            n = replace("request_tnm_n_analysis", side_effect=lambda **_: (events.append("N"), {"nplus_probability": 0.1})[1])
            export = replace("export_pet_series_for_analysis", side_effect=lambda _: (events.append("PET export"), "gs://test/pet")[1])
            m = replace("request_tnm_m_analysis", side_effect=lambda **_: (events.append("M"), {"m_candidate": "M0"})[1])
            cleanup = replace("cleanup_pet_dicom_gcs_prefix")
            failed = replace("_mark_failed")

            self.assertEqual(tasks.run_tnm_analysis.run(analysis.id), "succeeded")
            self.assertEqual(events, ["CT", "T", "Phase2", "N features", "N", "PET export", "M", "save"])
            self.assertEqual(phase.call_args.kwargs["histology"], "unknown")
            self.assertEqual(n.call_args.kwargs["features"]["histology"], "unknown")
            self.assertEqual(n.call_args.kwargs["patient_id"], "patient-test")
            for call in (t, phase, n, export, m, results.create, tnm_results.create):
                call.assert_called_once()
            self.assertEqual(analysis.status, tasks.AiAnalysis.Status.SUCCEEDED)
            self.assertEqual(results.create.call_args.kwargs["result_payload"]["m"]["m_candidate"], "M0")
            cleanup.assert_called_once_with("gs://test/pet")
            failed.assert_not_called()
