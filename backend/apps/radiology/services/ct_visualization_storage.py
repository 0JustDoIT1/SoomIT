from urllib.parse import urlparse

from google.api_core.exceptions import Forbidden, NotFound, Unauthorized
from google.auth.exceptions import GoogleAuthError
from google.cloud import storage


class CtVisualizationStorageError(RuntimeError):
    pass


def parse_ct_visualization_uri(uri):
    if not isinstance(uri, str):
        raise CtVisualizationStorageError("Invalid CT visualization URI.")
    parsed = urlparse(uri)
    object_path = parsed.path.lstrip("/")
    if (
        parsed.scheme != "gs"
        or not parsed.netloc
        or parsed.params
        or parsed.query
        or parsed.fragment
        or not object_path.startswith("ct-analysis/")
        or "/phase1/visualization/" not in object_path
        or not object_path.lower().endswith(".glb")
        or any(part in {"", ".", ".."} for part in object_path.split("/"))
    ):
        raise CtVisualizationStorageError("Invalid CT visualization object path.")
    return parsed.netloc, object_path


def download_ct_visualization(uri):
    bucket_name, object_path = parse_ct_visualization_uri(uri)
    try:
        return storage.Client().bucket(bucket_name).blob(object_path).download_as_bytes()
    except NotFound as exc:
        raise CtVisualizationStorageError("CT visualization object was not found.") from exc
    except (Forbidden, Unauthorized) as exc:
        raise CtVisualizationStorageError("Access to the CT visualization object was denied.") from exc
    except GoogleAuthError as exc:
        raise CtVisualizationStorageError("GCS credentials are unavailable.") from exc
    except CtVisualizationStorageError:
        raise
    except Exception as exc:
        raise CtVisualizationStorageError("CT visualization object could not be downloaded.") from exc
