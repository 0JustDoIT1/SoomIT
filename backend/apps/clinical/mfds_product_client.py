import json
import os
from urllib.parse import urlencode, unquote
from urllib.request import urlopen
from urllib.error import HTTPError, URLError


BASE_URL = "https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/"
FIELDS = (
    "ITEM_SEQ", "ITEM_NAME", "ENTP_NAME", "ITEM_INGR_NAME", "MAIN_ITEM_INGR",
    "MAIN_INGR_ENG", "EDI_CODE", "BAR_CODE", "CANCEL_NAME", "CANCEL_DATE",
    "ETC_OTC_CODE", "ITEM_PERMIT_DATE",
)


class MfdsProductError(Exception):
    pass


def search_products(ingredient_name: str, limit: int = 50):
    key = os.getenv("MFDS_SERVICE_KEY", "").strip()
    if not key:
        raise MfdsProductError("MFDS product search is not configured.")
    params = urlencode({
        "serviceKey": unquote(key), "type": "json", "pageNo": 1,
        "numOfRows": min(max(limit, 1), 100), "item_ingr_name": ingredient_name,
    })
    try:
        with urlopen(BASE_URL + "getDrugPrdtPrmsnInq07?" + params, timeout=20) as response:
            payload = json.loads(response.read())
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
        raise MfdsProductError("MFDS product search failed.") from exc
    data = payload.get("response", payload)
    header, body = data.get("header", {}), data.get("body", {})
    if str(header.get("resultCode")) not in {"00", "0"}:
        raise MfdsProductError("MFDS product search returned an error.")
    rows = body.get("items") or []
    if isinstance(rows, dict):
        rows = rows.get("item", [])
    if isinstance(rows, dict):
        rows = [rows]
    products = []
    for row in rows:
        if not isinstance(row, dict) or not row.get("ITEM_SEQ"):
            continue
        item = {field.lower(): row.get(field) for field in FIELDS}
        item["approval_status"] = "WITHDRAWN_OR_CANCELLED" if row.get("CANCEL_NAME") or row.get("CANCEL_DATE") else "APPROVED_OR_ACTIVE"
        products.append(item)
    return products
