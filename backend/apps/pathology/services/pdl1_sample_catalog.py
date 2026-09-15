"""Read-only catalog for the PD-L1 demonstration samples.

Populate ``data/pdl1_test_samples.json`` with real sample values during
deployment.  The catalog is deliberately empty in source control until the
canonical GCS URIs and HALO annotations are supplied.
"""

import json
from dataclasses import dataclass
from pathlib import Path


CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "pdl1_test_samples.json"
SUPPORTED_ROI_LAYERS = frozenset({"Tumor", "Tumor-JS"})
REQUIRED_FIELDS = frozenset(
    {
        "sample_id",
        "display_name",
        "wsi_gcs_uri",
        "annotation_gcs_uri",
        "roi_layer",
        "main_index",
        "pdl1_image_id",
    }
)


class PDL1SampleCatalogError(RuntimeError):
    pass


@dataclass(frozen=True)
class PDL1TestSample:
    sample_id: str
    display_name: str
    wsi_gcs_uri: str
    annotation_gcs_uri: str
    roi_layer: str
    main_index: str
    pdl1_image_id: str

    def public_data(self):
        return {
            "sample_id": self.sample_id,
            "display_name": self.display_name,
            "roi_layer": self.roi_layer,
        }


def _required_text(row, field):
    value = row.get(field)
    if not isinstance(value, str) or not value.strip():
        raise PDL1SampleCatalogError(f"PD-L1 sample {field} must be a non-empty string.")
    return value.strip()


def _validate_gcs_uri(value, field):
    if not value.startswith("gs://") or value == "gs://":
        raise PDL1SampleCatalogError(f"PD-L1 sample {field} must be a gs:// URI.")
    return value


def load_pdl1_test_samples():
    try:
        with CATALOG_PATH.open(encoding="utf-8") as catalog_file:
            document = json.load(catalog_file)
    except (OSError, json.JSONDecodeError) as exc:
        raise PDL1SampleCatalogError("PD-L1 sample catalog could not be loaded.") from exc

    rows = document.get("samples") if isinstance(document, dict) else None
    if not isinstance(rows, list):
        raise PDL1SampleCatalogError("PD-L1 sample catalog must contain a samples list.")

    samples = []
    seen_sample_ids = set()
    for row in rows:
        if not isinstance(row, dict) or set(row) != REQUIRED_FIELDS:
            raise PDL1SampleCatalogError("PD-L1 sample catalog has an invalid entry.")
        values = {field: _required_text(row, field) for field in REQUIRED_FIELDS}
        if values["sample_id"] in seen_sample_ids:
            raise PDL1SampleCatalogError("PD-L1 sample IDs must be unique.")
        if values["roi_layer"] not in SUPPORTED_ROI_LAYERS:
            raise PDL1SampleCatalogError("PD-L1 sample ROI layer is unsupported.")
        values["wsi_gcs_uri"] = _validate_gcs_uri(values["wsi_gcs_uri"], "wsi_gcs_uri")
        values["annotation_gcs_uri"] = _validate_gcs_uri(
            values["annotation_gcs_uri"], "annotation_gcs_uri"
        )
        samples.append(PDL1TestSample(**values))
        seen_sample_ids.add(values["sample_id"])
    return tuple(samples)


def list_pdl1_test_samples():
    return tuple(sample.public_data() for sample in load_pdl1_test_samples())


def get_pdl1_test_sample(sample_id):
    if not isinstance(sample_id, str) or not sample_id.strip():
        return None
    return next(
        (sample for sample in load_pdl1_test_samples() if sample.sample_id == sample_id),
        None,
    )
