from dataclasses import dataclass
from io import BytesIO

import pydicom
from django.conf import settings

LOCALIZER_KEYWORDS = ("localizer", "scout", "topogram")


class CtSeriesValidationError(ValueError):
    def __init__(self, errors):
        self.errors = list(errors)
        super().__init__("; ".join(self.errors))


@dataclass(frozen=True)
class CtSliceHeader:
    dicom_bytes: bytes
    modality: str | None
    study_instance_uid: str | None
    series_instance_uid: str | None
    series_description: str | None
    sop_instance_uid: str | None


def parse_ct_headers(uploaded_files):
    """Reads DICOM header tags from each uploaded file. Raises CtSeriesValidationError
    (with one message per unreadable file) rather than silently dropping bad files,
    since every file the client sent is expected to already be a filtered DICOM folder.
    """
    headers = []
    errors = []
    for uploaded_file in uploaded_files:
        dicom_bytes = uploaded_file.read()
        try:
            dataset = pydicom.dcmread(BytesIO(dicom_bytes), stop_before_pixels=True)
        except Exception:
            errors.append(f"'{uploaded_file.name}'은(는) 올바른 DICOM 파일이 아닙니다.")
            continue
        headers.append(
            CtSliceHeader(
                dicom_bytes=dicom_bytes,
                modality=getattr(dataset, "Modality", None),
                study_instance_uid=getattr(dataset, "StudyInstanceUID", None),
                series_instance_uid=getattr(dataset, "SeriesInstanceUID", None),
                series_description=getattr(dataset, "SeriesDescription", None),
                sop_instance_uid=getattr(dataset, "SOPInstanceUID", None),
            ),
        )
    if errors:
        raise CtSeriesValidationError(errors)
    return headers


def _is_likely_localizer(series_description):
    description = (series_description or "").lower()
    return any(keyword in description for keyword in LOCALIZER_KEYWORDS)


def validate_ct_series(headers: list[CtSliceHeader], *, expected_series_instance_uid: str):
    """Repeats the frontend's pre-upload checks as the final authority before storing
    a CT Series. Raises CtSeriesValidationError with every violation found.
    """
    errors = []

    if not headers:
        raise CtSeriesValidationError(["업로드된 DICOM 파일이 없습니다."])

    if not all(header.modality == "CT" for header in headers):
        errors.append("Modality가 CT가 아닌 파일이 포함되어 있습니다.")

    study_uids = {header.study_instance_uid for header in headers}
    if len(study_uids) > 1 or None in study_uids:
        errors.append("StudyInstanceUID가 서로 다르거나 누락된 파일이 있습니다.")

    series_uids = {header.series_instance_uid for header in headers}
    if len(series_uids) > 1 or None in series_uids:
        errors.append("SeriesInstanceUID가 서로 다르거나 누락된 파일이 있습니다.")
    elif series_uids != {expected_series_instance_uid}:
        errors.append("선택되지 않은 Series의 파일이 포함되어 있습니다.")

    sop_uids = [header.sop_instance_uid for header in headers]
    unique_sop_uids = set(sop_uids)
    if len(unique_sop_uids) != len(sop_uids) or None in unique_sop_uids:
        errors.append("SOPInstanceUID가 중복되거나 누락된 파일이 있습니다.")

    if len(headers) < settings.CT_SERIES_MIN_SLICE_COUNT:
        errors.append(
            f"slice 수가 너무 적습니다. 최소 {settings.CT_SERIES_MIN_SLICE_COUNT}장 이상 필요합니다. "
            f"(현재 {len(headers)}장)",
        )

    if _is_likely_localizer(headers[0].series_description):
        errors.append("Localizer/Scout Series는 분석 대상으로 사용할 수 없습니다.")

    if errors:
        raise CtSeriesValidationError(errors)
