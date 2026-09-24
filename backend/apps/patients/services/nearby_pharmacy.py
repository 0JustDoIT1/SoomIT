import math
import os
from urllib.parse import unquote
from xml.etree import ElementTree

import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


PHARMACY_LIST_ENDPOINT = (
    "https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/"
    "getParmacyListInfoInqire"
)
KAKAO_COORD_TO_REGION_ENDPOINT = (
    "https://dapi.kakao.com/v2/local/geo/coord2regioncode.json"
)
SEARCH_RADIUS_KM = 5.0


class NearbyPharmacyServiceError(Exception):
    pass


def find_nearby_pharmacies(*, latitude, longitude, limit=50):
    service_key = settings.PUBLIC_DATA_SERVICE_KEY.strip()
    if not service_key:
        raise ImproperlyConfigured("PUBLIC_DATA_SERVICE_KEY is not configured.")

    region_1depth, region_2depth = _resolve_region(
        latitude=latitude,
        longitude=longitude,
    )
    items = _fetch_region_pharmacies(
        service_key=service_key,
        region_1depth=region_1depth,
        region_2depth=region_2depth,
    )

    pharmacies = []
    for index, item in enumerate(items):
        name = _child_text(item, "dutyName")
        pharmacy_latitude = _as_float(_child_text(item, "wgs84Lat"))
        pharmacy_longitude = _as_float(_child_text(item, "wgs84Lon"))
        if not name or pharmacy_latitude is None or pharmacy_longitude is None:
            continue

        distance = _distance_in_km(
            latitude,
            longitude,
            pharmacy_latitude,
            pharmacy_longitude,
        )
        if distance > SEARCH_RADIUS_KM:
            continue

        pharmacies.append(
            {
                "id": _child_text(item, "hpid") or f"pharmacy-{index}",
                "name": name,
                "address": _child_text(item, "dutyAddr") or "주소 정보 없음",
                "phone_number": _child_text(item, "dutyTel1"),
                "latitude": pharmacy_latitude,
                "longitude": pharmacy_longitude,
                "distance_km": distance,
            }
        )

    pharmacies.sort(key=lambda pharmacy: pharmacy["distance_km"])
    return pharmacies[:limit]


def _resolve_region(*, latitude, longitude):
    api_key = os.environ.get("KAKAO_REST_API_KEY", "").strip()
    if not api_key:
        raise ImproperlyConfigured("KAKAO_REST_API_KEY is not configured.")

    try:
        response = requests.get(
            KAKAO_COORD_TO_REGION_ENDPOINT,
            params={"x": longitude, "y": latitude},
            headers={"Authorization": f"KakaoAK {api_key}"},
            timeout=10,
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise NearbyPharmacyServiceError(
            "현재 위치의 행정구역을 확인하지 못했습니다."
        ) from exc

    documents = payload.get("documents") if isinstance(payload, dict) else None
    if not isinstance(documents, list) or not documents:
        raise NearbyPharmacyServiceError(
            "현재 위치에 해당하는 행정구역을 찾지 못했습니다."
        )

    region = next(
        (item for item in documents if item.get("region_type") == "H"),
        documents[0],
    )
    region_1depth = str(region.get("region_1depth_name", "")).strip()
    region_2depth = str(region.get("region_2depth_name", "")).strip()
    if not region_1depth or not region_2depth:
        raise NearbyPharmacyServiceError(
            "현재 위치의 시·군·구 정보를 확인하지 못했습니다."
        )

    return region_1depth, region_2depth


def _fetch_region_pharmacies(*, service_key, region_1depth, region_2depth):
    district_candidates = [region_2depth]
    if " " in region_2depth:
        district_candidates.append(region_2depth.rsplit(" ", 1)[-1])

    for district in district_candidates:
        root = _request_pharmacy_list(
            service_key=service_key,
            region_1depth=region_1depth,
            region_2depth=district,
        )
        items = root.findall(".//item")
        if items:
            return items

    return []


def _request_pharmacy_list(*, service_key, region_1depth, region_2depth):
    try:
        response = requests.get(
            PHARMACY_LIST_ENDPOINT,
            params={
                "serviceKey": unquote(service_key),
                "Q0": region_1depth,
                "Q1": region_2depth,
                "pageNo": 1,
                "numOfRows": 1000,
            },
            timeout=20,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise NearbyPharmacyServiceError(
            "공공데이터 서버에서 약국 정보를 불러오지 못했습니다."
        ) from exc

    try:
        root = ElementTree.fromstring(response.content)
    except ElementTree.ParseError as exc:
        raise NearbyPharmacyServiceError(
            "공공데이터 서버의 응답을 해석하지 못했습니다."
        ) from exc

    result_code = _find_text(root, "resultCode")
    if result_code and result_code != "00":
        result_message = _find_text(root, "resultMsg")
        raise NearbyPharmacyServiceError(
            result_message or f"공공데이터 API 요청이 거부되었습니다. ({result_code})"
        )

    return root


def _find_text(root, tag):
    element = root.find(f".//{tag}")
    return element.text.strip() if element is not None and element.text else None


def _child_text(parent, tag):
    element = parent.find(tag)
    return element.text.strip() if element is not None and element.text else None


def _as_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _distance_in_km(latitude1, longitude1, latitude2, longitude2):
    earth_radius_km = 6371.0
    lat1 = math.radians(latitude1)
    lat2 = math.radians(latitude2)
    delta_latitude = math.radians(latitude2 - latitude1)
    delta_longitude = math.radians(longitude2 - longitude1)
    haversine = (
        math.sin(delta_latitude / 2) ** 2
        + math.cos(lat1)
        * math.cos(lat2)
        * math.sin(delta_longitude / 2) ** 2
    )
    return earth_radius_km * 2 * math.atan2(
        math.sqrt(haversine), math.sqrt(1 - haversine)
    )
