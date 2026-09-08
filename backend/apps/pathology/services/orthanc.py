import base64
import json
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings


class OrthancError(RuntimeError):
    pass


@dataclass(frozen=True)
class OrthancBinaryResponse:
    content: bytes
    content_type: str


def _request(path, *, accept="application/json"):
    token = base64.b64encode(
        f"{settings.ORTHANC_USERNAME}:{settings.ORTHANC_PASSWORD}".encode("utf-8"),
    ).decode("ascii")
    request = Request(
        f"{settings.ORTHANC_BASE_URL}{path}",
        headers={"Accept": accept, "Authorization": f"Basic {token}"},
    )
    try:
        with urlopen(request, timeout=settings.ORTHANC_TIMEOUT_SECONDS) as response:
            return OrthancBinaryResponse(
                content=response.read(),
                content_type=response.headers.get_content_type(),
            )
    except HTTPError as exc:
        if exc.code == 404:
            raise OrthancError("Orthanc에서 해당 WSI를 찾을 수 없습니다.") from exc
        raise OrthancError(f"Orthanc 요청이 실패했습니다. (HTTP {exc.code})") from exc
    except (URLError, TimeoutError) as exc:
        raise OrthancError("Orthanc에 연결할 수 없습니다.") from exc


def get_wsi_pyramid(series_id):
    response = _request(f"/wsi/pyramids/{series_id}")
    try:
        payload = json.loads(response.content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise OrthancError("Orthanc pyramid 응답이 올바른 JSON이 아닙니다.") from exc
    required = {"Resolutions", "Sizes", "TileHeight", "TileWidth", "TotalHeight", "TotalWidth"}
    if not isinstance(payload, dict) or not required.issubset(payload):
        raise OrthancError("Orthanc pyramid 응답에 필수 정보가 없습니다.")
    return payload


def get_wsi_tile(series_id, level, x, y):
    return _request(
        f"/wsi/tiles/{series_id}/{level}/{x}/{y}",
        accept="image/jpeg,image/png",
    )
