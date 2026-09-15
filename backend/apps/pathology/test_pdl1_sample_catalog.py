import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.test import SimpleTestCase

from apps.pathology.services.pdl1_sample_catalog import (
    PDL1SampleCatalogError,
    get_pdl1_test_sample,
    list_pdl1_test_samples,
)


class PDL1SampleCatalogTestCase(SimpleTestCase):
    def test_public_catalog_hides_gcs_uris_and_annotation_data(self):
        with TemporaryDirectory() as directory:
            path = f"{directory}/samples.json"
            with open(path, "w", encoding="utf-8") as catalog_file:
                json.dump(
                    {"samples": [{
                        "sample_id": "demo", "display_name": "Demo", "wsi_gcs_uri": "gs://bucket/demo.svs",
                        "annotation_gcs_uri": "gs://bucket/demo.annotations", "roi_layer": "Tumor",
                        "main_index": "main", "pdl1_image_id": "image",
                    }]},
                    catalog_file,
                )
            with patch("apps.pathology.services.pdl1_sample_catalog.CATALOG_PATH", Path(path)):
                self.assertEqual(
                    list_pdl1_test_samples(),
                    ({"sample_id": "demo", "display_name": "Demo", "roi_layer": "Tumor"},),
                )
                sample = get_pdl1_test_sample("demo")
                self.assertEqual(sample.annotation_gcs_uri, "gs://bucket/demo.annotations")

    def test_invalid_catalog_entry_is_rejected(self):
        with TemporaryDirectory() as directory:
            path = f"{directory}/samples.json"
            with open(path, "w", encoding="utf-8") as catalog_file:
                json.dump({"samples": [{"sample_id": "incomplete"}]}, catalog_file)
            with patch("apps.pathology.services.pdl1_sample_catalog.CATALOG_PATH", Path(path)):
                with self.assertRaises(PDL1SampleCatalogError):
                    list_pdl1_test_samples()
