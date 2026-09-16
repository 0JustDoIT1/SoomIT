from __future__ import annotations

import tempfile
from pathlib import Path

import pydicom
import requests
from django.conf import settings
from google.cloud import storage

from apps.cases.models import CaseImageAsset


class PetDicomExportError(RuntimeError):
    pass


def _gcs_parts(uri):
    if not uri.startswith("gs://"):
        raise PetDicomExportError("PET GCS prefix must be a gs:// URI.")
    bucket, separator, prefix = uri[5:].partition("/")
    if not bucket or not separator or not prefix:
        raise PetDicomExportError("PET GCS prefix must include a bucket and prefix.")
    return bucket, prefix.rstrip("/")


def build_pet_dicom_gcs_prefix(*, hospital_id, case_id, order_id, analysis_id):
    base = settings.TNM_OUTPUT_GCS_PREFIX.rstrip("/")
    if not base.startswith("gs://"):
        raise PetDicomExportError("TNM_OUTPUT_GCS_PREFIX must be a gs:// URI.")
    return f"{base}/pet-dicom/{hospital_id}/{case_id}/{order_id}/{analysis_id}"


def _download_series(series_id, destination):
    session = requests.Session()
    session.auth = (settings.ORTHANC_USERNAME, settings.ORTHANC_PASSWORD)
    try:
        response = session.get(f"{settings.ORTHANC_BASE_URL}/series/{series_id}", timeout=settings.ORTHANC_TIMEOUT_SECONDS)
        response.raise_for_status()
        instances = response.json().get("Instances")
        if not isinstance(instances, list) or not instances:
            raise PetDicomExportError("Orthanc PET Series has no instances.")
        files = []
        for index, instance_id in enumerate(instances):
            item = session.get(f"{settings.ORTHANC_BASE_URL}/instances/{instance_id}/file", timeout=settings.ORTHANC_TIMEOUT_SECONDS)
            item.raise_for_status()
            path = destination / f"{index:06d}.dcm"
            path.write_bytes(item.content)
            files.append(path)
        return files
    except (requests.RequestException, ValueError) as exc:
        raise PetDicomExportError("Failed to download PET Series from Orthanc.") from exc
    finally:
        session.close()


def cleanup_pet_dicom_gcs_prefix(prefix):
    bucket_name, object_prefix = _gcs_parts(prefix)
    client = storage.Client()
    blobs = list(client.list_blobs(bucket_name, prefix=object_prefix.rstrip("/") + "/"))
    if blobs:
        client.bucket(bucket_name).delete_blobs(blobs)


def _upload_prefix(files, prefix, expected_series_uid):
    bucket_name, object_prefix = _gcs_parts(prefix)
    bucket = storage.Client().bucket(bucket_name)
    try:
        for path in files:
            dataset = pydicom.dcmread(path, stop_before_pixels=True)
            if getattr(dataset, "Modality", None) != "PT" or getattr(dataset, "SeriesInstanceUID", None) != expected_series_uid:
                raise PetDicomExportError("Downloaded Orthanc instance is not the requested PET Series.")
            bucket.blob(f"{object_prefix}/{path.name}").upload_from_filename(path)
    except Exception:
        cleanup_pet_dicom_gcs_prefix(prefix)
        raise


def export_pet_series_for_analysis(analysis):
    asset = analysis.source_image_asset
    if (
        asset is None
        or asset.image_type != CaseImageAsset.ImageType.PET
        or asset.storage_type != CaseImageAsset.StorageType.ORTHANC
        or asset.status != CaseImageAsset.Status.READY
        or not asset.orthanc_series_id
        or not asset.series_instance_uid
    ):
        raise PetDicomExportError("A READY Orthanc PET asset with SeriesInstanceUID is required.")
    order = analysis.examination_order
    if order is None or order.order_type != order.OrderType.PET_CT_TNM:
        raise PetDicomExportError("PET DICOM export requires a PET_CT_TNM order.")
    prefix = build_pet_dicom_gcs_prefix(
        hospital_id=analysis.case.patient.hospital_id,
        case_id=analysis.case_id,
        order_id=order.id,
        analysis_id=analysis.id,
    )
    with tempfile.TemporaryDirectory(prefix="pet-dicom-export-") as temporary:
        files = _download_series(asset.orthanc_series_id, Path(temporary))
        _upload_prefix(files, prefix, asset.series_instance_uid)
    return prefix.rstrip("/") + "/"
