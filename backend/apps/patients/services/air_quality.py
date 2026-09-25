import datetime
import os
import re
from urllib.parse import unquote

import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from .air_quality_rules import (
    ALERT_ADVISORY,
    ALERT_WARNING,
    build_air_quality_guidance,
)


AIR_QUALITY_ENDPOINT = (
    "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/"
    "getCtprvnRltmMesureDnsty"
)
AIR_ALERT_ENDPOINT = (
    "https://apis.data.go.kr/B552584/UlfptcaAlarmInqireSvc/"
    "getUlfptcaAlarmInfo"
)
KAKAO_COORD_TO_REGION_ENDPOINT = (
    "https://dapi.kakao.com/v2/local/geo/coord2regioncode.json"
)

SIDO_NAMES = {
    "서울특별시": "서울",
    "부산광역시": "부산",
    "대구광역시": "대구",
    "인천광역시": "인천",
    "광주광역시": "광주",
    "대전광역시": "대전",
    "울산광역시": "울산",
    "세종특별자치시": "세종",
    "경기도": "경기",
    "강원특별자치도": "강원",
    "강원도": "강원",
    "충청북도": "충북",
    "충청남도": "충남",
    "전북특별자치도": "전북",
    "전라북도": "전북",
    "전라남도": "전남",
    "경상북도": "경북",
    "경상남도": "경남",
    "제주특별자치도": "제주",
}


class AirQualityServiceError(Exception):
    pass


def get_current_air_quality(*, latitude, longitude):
    service_key = settings.PUBLIC_DATA_SERVICE_KEY.strip()
    if not service_key:
        raise ImproperlyConfigured("PUBLIC_DATA_SERVICE_KEY is not configured.")

    region = _resolve_region(latitude=latitude, longitude=longitude)
    sido_name = SIDO_NAMES.get(region["province"], region["province"])
    items = _fetch_measurements(service_key=service_key, sido_name=sido_name)
    station = _select_station(items=items, region=region)
    if station is None:
        raise AirQualityServiceError("현재 지역의 미세먼지 측정값이 없습니다.")

    pm10 = _as_number(station.get("pm10Value"))
    pm25 = _as_number(station.get("pm25Value"))
    if pm10 is None and pm25 is None:
        raise AirQualityServiceError("현재 지역의 미세먼지 측정값이 없습니다.")

    alert_type = _fetch_active_alert(
        service_key=service_key,
        sido_name=sido_name,
        district_name=region["district"],
    )
    result = build_air_quality_guidance(
        pm10=pm10,
        pm25=pm25,
        alert_type=alert_type,
    )
    result.update(
        {
            "station_name": station.get("stationName"),
            "data_time": station.get("dataTime"),
            "region": f'{region["province"]} {region["district"]}',
        }
    )
    return result


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
        documents = response.json().get("documents", [])
    except (requests.RequestException, ValueError, AttributeError) as exc:
        raise AirQualityServiceError("현재 위치의 행정구역을 확인하지 못했습니다.") from exc

    if not documents:
        raise AirQualityServiceError("현재 위치의 행정구역을 찾지 못했습니다.")
    item = next(
        (document for document in documents if document.get("region_type") == "H"),
        documents[0],
    )
    return {
        "province": str(item.get("region_1depth_name", "")).strip(),
        "district": str(item.get("region_2depth_name", "")).strip(),
        "neighborhood": str(item.get("region_3depth_name", "")).strip(),
    }


def _fetch_measurements(*, service_key, sido_name):
    try:
        response = requests.get(
            AIR_QUALITY_ENDPOINT,
            params={
                "serviceKey": unquote(service_key),
                "returnType": "json",
                "numOfRows": 200,
                "pageNo": 1,
                "sidoName": sido_name,
                "ver": "1.3",
            },
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
        items = payload["response"]["body"]["items"]
    except (requests.RequestException, ValueError, KeyError, TypeError) as exc:
        raise AirQualityServiceError("에어코리아 측정정보를 불러오지 못했습니다.") from exc

    return items if isinstance(items, list) else []


def _select_station(*, items, region):
    usable = [
        item
        for item in items
        if _as_number(item.get("pm10Value")) is not None
        or _as_number(item.get("pm25Value")) is not None
    ]
    if not usable:
        return None

    targets = [region["district"], region["neighborhood"]]

    def score(item):
        station = _normalize_place_name(item.get("stationName"))
        scores = []
        for target in targets:
            normalized_target = _normalize_place_name(target)
            if not normalized_target:
                continue
            if station == normalized_target:
                scores.append(3)
            elif station in normalized_target or normalized_target in station:
                scores.append(2)
            else:
                scores.append(0)
        return max(scores, default=0)

    return max(usable, key=score)


def _fetch_active_alert(*, service_key, sido_name, district_name):
    alerts = []
    for item_code in ("PM10", "PM25"):
        try:
            response = requests.get(
                AIR_ALERT_ENDPOINT,
                params={
                    "serviceKey": unquote(service_key),
                    "returnType": "json",
                    "numOfRows": 100,
                    "pageNo": 1,
                    "year": datetime.date.today().year,
                    "itemCode": item_code,
                },
                timeout=10,
            )
            response.raise_for_status()
            items = response.json()["response"]["body"]["items"]
        except (requests.RequestException, ValueError, KeyError, TypeError):
            continue

        for item in items if isinstance(items, list) else []:
            if item.get("clearDate") or item.get("clearTime"):
                continue
            area = " ".join(
                str(item.get(key, ""))
                for key in ("districtName", "moveName")
            )
            if not _same_area(area, sido_name, district_name):
                continue
            issue_type = str(item.get("issueGbn", ""))
            if "경보" in issue_type:
                alerts.append(ALERT_WARNING)
            elif "주의보" in issue_type:
                alerts.append(ALERT_ADVISORY)

    if ALERT_WARNING in alerts:
        return ALERT_WARNING
    if ALERT_ADVISORY in alerts:
        return ALERT_ADVISORY
    return None


def _same_area(area, sido_name, district_name):
    normalized_area = _normalize_place_name(area)
    return (
        _normalize_place_name(sido_name) in normalized_area
        or _normalize_place_name(district_name) in normalized_area
    )


def _normalize_place_name(value):
    text = re.sub(r"[\s\d]", "", str(value or ""))
    return re.sub(r"(특별자치도|특별자치시|특별시|광역시|도|시|군|구|읍|면|동)$", "", text)


def _as_number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number < 0:
        return None
    return int(number) if number.is_integer() else number
