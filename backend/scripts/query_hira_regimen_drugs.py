"""Read-only lookup of the seven regimen ingredients from the HIRA API."""

from __future__ import annotations

import argparse
import os
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# Importing Django settings reuses config/settings.py's existing dotenv loading.
from django.conf import settings  # noqa: E402


ENDPOINT = (
    "https://apis.data.go.kr/B551182/"
    "msupCmpnMeftInfoService/getMajorCmpnNmCdList"
)
INGREDIENTS = (
    "Osimertinib",
    "Pemetrexed",
    "Carboplatin",
    "Pembrolizumab",
    "Dabrafenib",
    "Trametinib",
    "Capmatinib",
)
RESPONSE_FIELDS = (
    "divNm",
    "fomnTpNm",
    "gnlNm",
    "gnlNmCd",
    "injcPthNm",
    "iqtyTxt",
    "meftDivNo",
    "unit",
)
PAGE_SIZE = 100
TIMEOUT_SECONDS = 20


class HiraApiError(RuntimeError):
    """A safe error that never contains the service key or request URL."""


def _required_text(parent: ET.Element, path: str) -> str:
    value = parent.findtext(path)
    return value.strip() if value else ""


def _parse_page(payload: bytes) -> tuple[list[dict[str, str]], int]:
    try:
        root = ET.fromstring(payload)
    except ET.ParseError as exc:
        raise HiraApiError("HIRA 응답 XML을 해석하지 못했습니다.") from exc

    result_code = _required_text(root, ".//header/resultCode")
    result_message = _required_text(root, ".//header/resultMsg")
    if result_code != "00":
        safe_message = result_message or "메시지 없음"
        raise HiraApiError(
            f"HIRA API 오류: resultCode={result_code or '없음'}, "
            f"resultMsg={safe_message}"
        )

    items = [
        {field: _required_text(item, field) for field in RESPONSE_FIELDS}
        for item in root.findall(".//body/items/item")
    ]
    total_text = _required_text(root, ".//body/totalCount")
    try:
        total_count = int(total_text or "0")
    except ValueError as exc:
        raise HiraApiError("HIRA totalCount가 정수가 아닙니다.") from exc
    return items, total_count


def _fetch(
    service_key: str,
    search_parameter: str,
    search_value: str,
) -> list[dict[str, str]]:
    results: list[dict[str, str]] = []
    page_number = 1

    while True:
        query = urlencode(
            {
                "ServiceKey": service_key,
                "numOfRows": PAGE_SIZE,
                "pageNo": page_number,
                search_parameter: search_value,
            }
        )
        request = Request(f"{ENDPOINT}?{query}", method="GET")
        try:
            with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                if response.status != 200:
                    raise HiraApiError(f"HIRA HTTP 오류: status={response.status}")
                page_items, total_count = _parse_page(response.read())
        except HTTPError as exc:
            raise HiraApiError(f"HIRA HTTP 오류: status={exc.code}") from exc
        except (TimeoutError, URLError) as exc:
            raise HiraApiError("HIRA API 연결 또는 응답 시간 초과 오류입니다.") from exc

        results.extend(page_items)
        if not page_items or len(results) >= total_count:
            break
        page_number += 1

    return results


def fetch_ingredient(service_key: str, ingredient: str) -> list[dict[str, str]]:
    return _fetch(service_key, "gnlNm", ingredient)


def fetch_ingredient_code(service_key: str, ingredient_code: str) -> list[dict[str, str]]:
    return _fetch(service_key, "gnlNmCd", ingredient_code)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--ingredient-code",
        action="append",
        default=[],
        help="HIRA 일반명코드(gnlNmCd). 여러 번 지정할 수 있습니다.",
    )
    args = parser.parse_args()

    # Accessing settings triggers the project's existing backend/.env loader.
    _ = settings.INSTALLED_APPS
    service_key = os.environ.get("HIRA_SERVICE_KEY", "").strip()
    if not service_key:
        print("HIRA_SERVICE_KEY가 설정되지 않아 API를 호출하지 않았습니다.")
        return 2

    queries = (
        [(code, fetch_ingredient_code) for code in args.ingredient_code]
        if args.ingredient_code
        else [(ingredient, fetch_ingredient) for ingredient in INGREDIENTS]
    )
    for query, fetcher in queries:
        try:
            results = fetcher(service_key, query)
        except HiraApiError as exc:
            print(f"{query}: 조회 실패 - {exc}")
            continue

        if not results:
            print(f"{query}: 결과 없음")
            continue

        print(f"{query}: totalCount={len(results)}, rows={len(results)}")
        for item in results:
            print(item)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
