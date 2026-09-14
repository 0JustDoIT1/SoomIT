from __future__ import annotations

import datetime as dt
import math
from collections import defaultdict
from pathlib import Path

import pydicom
import SimpleITK as sitk


def _dicom_datetime(dataset: pydicom.Dataset, date_key: str, time_key: str, datetime_key: str) -> dt.datetime | None:
    raw = str(getattr(dataset, datetime_key, "") or "")
    if raw:
        return dt.datetime.strptime(raw.split(".")[0][:14], "%Y%m%d%H%M%S")
    date = str(getattr(dataset, date_key, "") or "")
    time = str(getattr(dataset, time_key, "") or "").split(".")[0]
    if date and time:
        return dt.datetime.strptime(date[:8] + time[:6].ljust(6, "0"), "%Y%m%d%H%M%S")
    return None


def _float(value: object, label: str) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Missing or invalid PET DICOM {label}") from exc
    if not math.isfinite(result) or result <= 0:
        raise ValueError(f"Missing or invalid PET DICOM {label}")
    return result


def discover_pet_series(root: Path, series_uid: str | None = None) -> tuple[list[Path], pydicom.Dataset]:
    groups: dict[str, list[tuple[Path, pydicom.Dataset]]] = defaultdict(list)
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        try:
            dataset = pydicom.dcmread(str(path), stop_before_pixels=True, force=True)
        except Exception:
            continue
        modality = str(getattr(dataset, "Modality", "")).upper()
        uid = str(getattr(dataset, "SeriesInstanceUID", ""))
        if modality in {"PT", "PET"} and uid:
            groups[uid].append((path, dataset))
    if series_uid:
        groups = {series_uid: groups.get(series_uid, [])}
    groups = {uid: rows for uid, rows in groups.items() if rows}
    if len(groups) != 1:
        raise ValueError(f"PET DICOM prefix must contain exactly one selected PET series; found {list(groups)}")
    rows = next(iter(groups.values()))

    def position(item: tuple[Path, pydicom.Dataset]) -> tuple[int, float]:
        dataset = item[1]
        try:
            orientation = [float(v) for v in dataset.ImageOrientationPatient]
            location = [float(v) for v in dataset.ImagePositionPatient]
            normal = (
                orientation[1] * orientation[5] - orientation[2] * orientation[4],
                orientation[2] * orientation[3] - orientation[0] * orientation[5],
                orientation[0] * orientation[4] - orientation[1] * orientation[3],
            )
            return 0, sum(a * b for a, b in zip(location, normal))
        except Exception:
            return 1, float(getattr(dataset, "InstanceNumber", 0) or 0)

    rows.sort(key=position)
    return [path for path, _ in rows], rows[0][1]


def suvbw_factor(
    dataset: pydicom.Dataset,
    patient_weight_kg: float | None = None,
    injected_dose_bq: float | None = None,
) -> tuple[float, dict[str, float | str]]:
    units = str(getattr(dataset, "Units", "")).upper()
    if units not in {"BQML", "BQ/ML"}:
        raise ValueError(f"PET pixel units must be BQML before SUVbw conversion, got {units or 'missing'}")
    sequence = getattr(dataset, "RadiopharmaceuticalInformationSequence", None)
    item = sequence[0] if sequence else None
    weight = _float(patient_weight_kg or getattr(dataset, "PatientWeight", None), "PatientWeight")
    dose = _float(injected_dose_bq or getattr(item, "RadionuclideTotalDose", None), "RadionuclideTotalDose")
    half_life = _float(getattr(item, "RadionuclideHalfLife", None), "RadionuclideHalfLife")
    scan = _dicom_datetime(dataset, "AcquisitionDate", "AcquisitionTime", "AcquisitionDateTime")
    if scan is None:
        scan = _dicom_datetime(dataset, "SeriesDate", "SeriesTime", "SeriesDateTime")
    injection = _dicom_datetime(item, "RadiopharmaceuticalStartDate", "RadiopharmaceuticalStartTime", "RadiopharmaceuticalStartDateTime") if item else None
    if injection is None and item is not None and scan is not None:
        start_time = str(getattr(item, "RadiopharmaceuticalStartTime", "") or "").split(".")[0]
        if start_time:
            parsed_time = dt.datetime.strptime(start_time[:6].ljust(6, "0"), "%H%M%S").time()
            injection = dt.datetime.combine(scan.date(), parsed_time)
    if scan is None or injection is None:
        raise ValueError("PET DICOM scan/injection time is required for SUVbw decay correction")
    if injection > scan:
        injection -= dt.timedelta(days=1)
    elapsed = (scan - injection).total_seconds()
    if elapsed < 0 or elapsed > 24 * 3600:
        raise ValueError(f"Implausible PET injection-to-scan interval: {elapsed} seconds")
    decayed_dose = dose * math.pow(2.0, -elapsed / half_life)
    factor = weight * 1000.0 / decayed_dose
    return factor, {
        "patient_weight_kg": weight,
        "injected_dose_bq": dose,
        "decayed_dose_at_scan_bq": decayed_dose,
        "half_life_seconds": half_life,
        "elapsed_seconds": elapsed,
        "suvbw_scale_per_bqml": factor,
        "scan_datetime": scan.isoformat(),
        "injection_datetime": injection.isoformat(),
    }


def convert_pet_dicom_to_ct_grid(
    dicom_root: Path,
    ct_nifti: Path,
    destination: Path,
    series_uid: str | None = None,
    patient_weight_kg: float | None = None,
    injected_dose_bq: float | None = None,
) -> dict[str, object]:
    files, dataset = discover_pet_series(dicom_root, series_uid)
    factor, metadata = suvbw_factor(dataset, patient_weight_kg, injected_dose_bq)
    reader = sitk.ImageSeriesReader()
    reader.SetFileNames([str(path) for path in files])
    reader.MetaDataDictionaryArrayUpdateOn()
    reader.LoadPrivateTagsOn()
    pet = sitk.Cast(reader.Execute(), sitk.sitkFloat32) * factor
    ct = sitk.ReadImage(str(ct_nifti), sitk.sitkFloat32)
    restored = sitk.Resample(pet, ct, sitk.Transform(), sitk.sitkLinear, 0.0, sitk.sitkFloat32)
    destination.parent.mkdir(parents=True, exist_ok=True)
    sitk.WriteImage(restored, str(destination), True)
    return {
        "source": "PET_DICOM",
        "series_instance_uid": str(dataset.SeriesInstanceUID),
        "dicom_file_count": len(files),
        **metadata,
    }
