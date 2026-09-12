import json
import os
from decimal import Decimal, InvalidOperation
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


KAKAO_ADDRESS_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KAKAO_LOCAL_TIMEOUT_SECONDS = 5
COORDINATE_PRECISION = Decimal("0.000001")


class KakaoGeocodingError(Exception):
    """Base error raised when an address cannot be geocoded safely."""


class KakaoGeocodingConfigurationError(KakaoGeocodingError):
    pass


class KakaoAddressNotFoundError(KakaoGeocodingError):
    pass


class KakaoGeocodingServiceError(KakaoGeocodingError):
    pass


def geocode_road_address(address):
    api_key = os.environ.get("KAKAO_REST_API_KEY", "").strip()
    if not api_key:
        raise KakaoGeocodingConfigurationError("Kakao Local API 설정을 확인해주세요.")

    request = Request(
        f"{KAKAO_ADDRESS_SEARCH_URL}?{urlencode({'query': address})}",
        headers={"Authorization": f"KakaoAK {api_key}"},
    )

    try:
        with urlopen(request, timeout=KAKAO_LOCAL_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise KakaoGeocodingServiceError(
            "주소 좌표를 확인하지 못했습니다. 잠시 후 다시 시도해주세요."
        ) from exc

    if not isinstance(payload, dict):
        raise KakaoGeocodingServiceError("주소 좌표 응답이 올바르지 않습니다.")

    documents = payload.get("documents")
    if not isinstance(documents, list) or not documents:
        raise KakaoAddressNotFoundError("선택한 도로명 주소의 좌표를 찾을 수 없습니다.")

    document = documents[0]
    try:
        longitude = Decimal(str(document["x"])).quantize(COORDINATE_PRECISION)
        latitude = Decimal(str(document["y"])).quantize(COORDINATE_PRECISION)
    except (KeyError, InvalidOperation, TypeError, ValueError) as exc:
        raise KakaoGeocodingServiceError("주소 좌표 응답이 올바르지 않습니다.") from exc

    if not longitude.is_finite() or not latitude.is_finite():
        raise KakaoGeocodingServiceError("주소 좌표 응답이 올바르지 않습니다.")
    if not Decimal("-180") <= longitude <= Decimal("180"):
        raise KakaoGeocodingServiceError("주소 경도 값이 올바르지 않습니다.")
    if not Decimal("-90") <= latitude <= Decimal("90"):
        raise KakaoGeocodingServiceError("주소 위도 값이 올바르지 않습니다.")

    return latitude, longitude
