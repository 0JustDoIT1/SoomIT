import json
from decimal import Decimal
from unittest.mock import patch

from django.test import SimpleTestCase

from apps.accounts.services.kakao_local import (
    KakaoAddressNotFoundError,
    KakaoGeocodingConfigurationError,
    KakaoGeocodingServiceError,
    geocode_road_address,
)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class KakaoLocalServiceTestCase(SimpleTestCase):
    @patch.dict("os.environ", {"KAKAO_REST_API_KEY": "test-key"})
    @patch("apps.accounts.services.kakao_local.urlopen")
    def test_returns_decimal_coordinates(self, urlopen):
        urlopen.return_value = FakeResponse(
            {"documents": [{"x": "126.977945123", "y": "37.566295456"}]}
        )

        latitude, longitude = geocode_road_address("서울특별시 중구 세종대로 110")

        self.assertEqual(latitude, Decimal("37.566295"))
        self.assertEqual(longitude, Decimal("126.977945"))
        self.assertEqual(urlopen.call_args.kwargs["timeout"], 5)

    @patch.dict("os.environ", {"KAKAO_REST_API_KEY": "test-key"})
    @patch("apps.accounts.services.kakao_local.urlopen")
    def test_empty_documents_raise_not_found(self, urlopen):
        urlopen.return_value = FakeResponse({"documents": []})
        with self.assertRaises(KakaoAddressNotFoundError):
            geocode_road_address("없는 주소")

    @patch.dict("os.environ", {}, clear=True)
    def test_missing_api_key_raises_configuration_error(self):
        with self.assertRaises(KakaoGeocodingConfigurationError):
            geocode_road_address("서울특별시 중구 세종대로 110")

    @patch.dict("os.environ", {"KAKAO_REST_API_KEY": "test-key"})
    @patch("apps.accounts.services.kakao_local.urlopen", side_effect=TimeoutError)
    def test_timeout_raises_service_error(self, urlopen):
        with self.assertRaises(KakaoGeocodingServiceError):
            geocode_road_address("서울특별시 중구 세종대로 110")
