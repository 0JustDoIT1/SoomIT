import base64
import json
import math
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.cache import cache


class OrthancError(RuntimeError):
    def __init__(self, message, *, upstream_status=None, reason="upstream_error"):
        super().__init__(message)
        self.upstream_status = upstream_status
        self.reason = reason


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
            raise OrthancError(
                "Orthanc에서 해당 WSI를 찾을 수 없습니다.",
                upstream_status=404,
                reason="not_found",
            ) from exc
        raise OrthancError(
            f"Orthanc 요청이 실패했습니다. (HTTP {exc.code})",
            upstream_status=exc.code,
        ) from exc
    except (URLError, TimeoutError) as exc:
        raise OrthancError(
            "Orthanc에 연결할 수 없습니다.",
            reason="connection_error",
        ) from exc


def get_wsi_pyramid(series_id):
    cache_key = f"orthanc:wsi-pyramid:{series_id}"
    cached = cache.get(cache_key)
    if isinstance(cached, dict):
        return cached

    response = _request(f"/wsi/pyramids/{series_id}")
    try:
        payload = json.loads(response.content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise OrthancError("Orthanc pyramid 응답이 올바른 JSON이 아닙니다.") from exc
    required = {"Resolutions", "Sizes", "TotalHeight", "TotalWidth"}
    if not isinstance(payload, dict) or not required.issubset(payload):
        raise OrthancError("Orthanc pyramid 응답에 필수 정보가 없습니다.")
    if "TileWidth" not in payload or "TileHeight" not in payload:
        tile_sizes = payload.get("TilesSizes")
        if (
            not isinstance(tile_sizes, list)
            or not tile_sizes
            or not isinstance(tile_sizes[0], (list, tuple))
            or len(tile_sizes[0]) != 2
        ):
            raise OrthancError("Orthanc pyramid 응답에 tile 크기 정보가 없습니다.")
        payload["TileWidth"], payload["TileHeight"] = tile_sizes[0]
    cache.set(cache_key, payload, timeout=60)
    return payload


def get_wsi_tile_grid(pyramid, level):
    sizes = pyramid.get("Sizes")
    if not isinstance(sizes, list) or level < 0 or level >= len(sizes):
        raise OrthancError(
            "요청한 WSI pyramid level이 존재하지 않습니다.",
            upstream_status=404,
            reason="invalid_tile",
        )
    size = sizes[level]
    if not isinstance(size, (list, tuple)) or len(size) != 2:
        raise OrthancError("Orthanc pyramid level 크기 정보가 올바르지 않습니다.")

    tile_width = pyramid.get("TileWidth")
    tile_height = pyramid.get("TileHeight")
    tile_sizes = pyramid.get("TilesSizes")
    if (
        isinstance(tile_sizes, list)
        and level < len(tile_sizes)
        and isinstance(tile_sizes[level], (list, tuple))
        and len(tile_sizes[level]) == 2
    ):
        tile_width, tile_height = tile_sizes[level]
    if not all(
        isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0
        for value in (size[0], size[1], tile_width, tile_height)
    ):
        raise OrthancError("Orthanc pyramid tile 범위 정보가 올바르지 않습니다.")
    return {
        "columns": math.ceil(size[0] / tile_width),
        "rows": math.ceil(size[1] / tile_height),
    }


def get_wsi_tile(series_id, level, x, y):
    return _request(
        f"/wsi/tiles/{series_id}/{level}/{x}/{y}",
        accept="image/jpeg,image/png",
    )
