import re

from django.conf import settings


_PATH_COMPONENT = re.compile(r"^[A-Za-z0-9_-]+$")


def _validate_component(value, name):
    value = str(value)
    if not _PATH_COMPONENT.fullmatch(value):
        raise ValueError(f"Invalid CT analysis {name}.")
    return value


def build_ct_analysis_output_uri(*, hospital_id, case_id, order_id, analysis_id):
    """Return the immutable GCS root for one CT analysis execution."""
    components = [
        _validate_component(hospital_id, "hospital_id"),
        _validate_component(case_id, "case_id"),
        _validate_component(order_id, "order_id"),
        _validate_component(analysis_id, "analysis_id"),
    ]
    prefix = settings.CT_ANALYSIS_OUTPUT_GCS_PREFIX.rstrip("/")
    if not prefix.startswith("gs://"):
        raise ValueError("CT_ANALYSIS_OUTPUT_GCS_PREFIX must be a gs:// URI.")
    return f"{prefix}/{'/'.join(components)}"
