from pathlib import Path
import sys

import pytest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from storage_io import parse_gcs_uri


def test_parse_gcs_uri():
    assert parse_gcs_uri("gs://bucket/a/b") == ("bucket", "a/b")


@pytest.mark.parametrize("value", ["", "http://bucket/a", "gs://bucket", "gs:///a"])
def test_parse_gcs_uri_rejects_invalid_values(value):
    with pytest.raises(ValueError):
        parse_gcs_uri(value)
