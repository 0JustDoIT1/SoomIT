from urllib.parse import urlparse

from google.api_core.exceptions import Forbidden, NotFound, Unauthorized
from google.auth.exceptions import GoogleAuthError
from google.cloud import storage


_ALLOWED_OBJECT_NAMES = {"labelmap.bin", "labelmap_metadata.json", "geometry.json"}


class CtCornerstoneStorageError(RuntimeError):
    pass


def parse_ct_cornerstone_uri(uri):
    if not isinstance(uri, str):
        raise CtCornerstoneStorageError("Invalid CT Cornerstone segmentation URI.")
    parsed = urlparse(uri)
    object_path = parsed.path.lstrip("/")
    if (
        parsed.scheme != "gs"
        or not parsed.netloc
        or parsed.params
        or parsed.query
        or parsed.fragment
        or not object_path.startswith("ct-analysis/")
        or "/phase1/cornerstone/" not in object_path
        or object_path.rsplit("/", 1)[-1] not in _ALLOWED_OBJECT_NAMES
        or any(part in {"", ".", ".."} for part in object_path.split("/"))
    ):
        raise CtCornerstoneStorageError("Invalid CT Cornerstone segmentation object path.")
    return parsed.netloc, object_path


def download_ct_cornerstone_object(uri):
    bucket_name, object_path = parse_ct_cornerstone_uri(uri)
    try:
        return storage.Client().bucket(bucket_name).blob(object_path).download_as_bytes()
    except NotFound as exc:
        raise CtCornerstoneStorageError("CT Cornerstone segmentation object was not found.") from exc
    except (Forbidden, Unauthorized) as exc:
        raise CtCornerstoneStorageError("Access to the CT Cornerstone segmentation object was denied.") from exc
    except GoogleAuthError as exc:
        raise CtCornerstoneStorageError("GCS credentials are unavailable.") from exc
    except CtCornerstoneStorageError:
        raise
    except Exception as exc:
        raise CtCornerstoneStorageError("CT Cornerstone segmentation object could not be downloaded.") from exc
