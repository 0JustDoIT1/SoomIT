from pathlib import Path
from uuid import uuid4

from django.conf import settings
from google.cloud import storage


class PathologyStorageError(RuntimeError):
    pass


def download_pathology_wsi_preview(wsi_uri):
    if not wsi_uri.startswith("gs://"):
        raise PathologyStorageError("Pathology WSI must be stored in GCS.")
    bucket_name, separator, object_name = wsi_uri[5:].partition("/")
    if not bucket_name or not separator or not object_name:
        raise PathologyStorageError("Invalid pathology WSI storage URI.")
    try:
        blob = storage.Client().bucket(bucket_name).blob(f"{object_name}.preview.jpg")
        if not blob.exists():
            raise PathologyStorageError("WSI preview is not available yet.")
        return blob.download_as_bytes(), "image/jpeg"
    except PathologyStorageError:
        raise
    except Exception as exc:
        raise PathologyStorageError("Failed to download pathology WSI preview.") from exc


def upload_pathology_wsi(*, hospital_id, case_id, order_id, uploaded_file):
    bucket_name = settings.PATHOLOGY_GCS_BUCKET
    if not bucket_name:
        raise PathologyStorageError(
            "PATHOLOGY_GCS_BUCKET is not configured."
        )

    extension = Path(uploaded_file.name).suffix.lower()
    if extension != ".svs":
        raise PathologyStorageError(
            "Pathology H&E WSI must be an SVS file."
        )

    object_name = (
        f"pathology/{case_id}/"
        f"{uuid4().hex}{extension}"
    )

    try:
        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(object_name)

        uploaded_file.seek(0)
        blob.upload_from_file(
            uploaded_file,
            content_type=uploaded_file.content_type
            or "application/octet-stream",
        )
    except Exception as exc:
        raise PathologyStorageError(
            "Failed to upload pathology H&E WSI to GCS."
        ) from exc

    return f"gs://{bucket_name}/{object_name}"
