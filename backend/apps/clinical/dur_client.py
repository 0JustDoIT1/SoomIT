"""Read-only DUR product queries. No safety decisions or database access."""
from copy import deepcopy
from dataclasses import dataclass, field
import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlencode
from urllib.request import urlopen
import xml.etree.ElementTree as ET

BASE_URL = 'https://apis.data.go.kr/1471000/DURPrdlstInfoService03/'
OPERATIONS = {
    'getUsjntTabooInfoList03': '병용금기',
    'getSpcifyAgrdeTabooInfoList03': '특정연령대금기',
    'getPwnmTabooInfoList03': '임부금기',
    'getCpctyAtentInfoList03': '용량주의',
    'getMdctnPdAtentInfoList03': '투여기간주의',
    'getOdsnAtentInfoList03': '노인주의',
    'getEfcyDplctInfoList03': '효능군중복',
    'getSeobangjeongPartitnAtentInfoList03': '서방정분할주의',
}


@dataclass
class DurResult:
    status: str
    source_operation: str
    item_seq: str
    rows: list = field(default_factory=list)
    total_count: int | None = None
    error_code: str | None = None


def normalize(row, operation):
    """Preserve explicit source semantics, including both sides of a pair."""
    mapping = {
        'dur_type': ('TYPE_NAME',), 'item_seq': ('ITEM_SEQ',),
        'ingr_code': ('INGR_CODE',),
        'ingr_name': ('INGR_KOR_NAME', 'INGR_NAME', 'INGR_ENG_NAME'),
        'mixture_item_seq': ('MIXTURE_ITEM_SEQ',),
        'mixture_ingr_code': ('MIXTURE_INGR_CODE',),
        'mixture_ingr_name': ('MIXTURE_INGR_KOR_NAME', 'MIXTURE_INGR_ENG_NAME'),
        'prohibition_content': ('PROHBT_CONTENT',), 'remark': ('REMARK',),
        'notification_date': ('NOTIFICATION_DATE',), 'change_date': ('CHANGE_DATE',),
    }
    result = {name: next((row[k] for k in keys if row.get(k) not in (None, '')), None)
              for name, keys in mapping.items()}
    result.update(source_operation=operation, raw=deepcopy(row))
    return result


def _parse(payload):
    if payload.lstrip().startswith(b'<'):
        root = ET.fromstring(payload)
        code = root.findtext('./header/resultCode')
        message = root.findtext('./header/resultMsg')
        total = root.findtext('./body/totalCount')
        items = [{node.tag: ''.join(node.itertext()) or None for node in item}
                 for item in root.findall('./body/items/item')]
    else:
        data = json.loads(payload)
        data = data.get('response', data)
        code, message = data['header']['resultCode'], data['header']['resultMsg']
        total = data.get('body', {}).get('totalCount')
        items = data.get('body', {}).get('items') or []
        if isinstance(items, dict):
            items = items.get('item', [])
        if isinstance(items, dict):
            items = [items]
    if str(code) not in ('00', '0') or not isinstance(message, str) or not message.strip():
        raise RuntimeError('API_ERROR')
    if isinstance(total, bool) or not str(total).isdigit():
        raise ValueError()
    if not isinstance(items, list) or any(not isinstance(row, dict) for row in items):
        raise ValueError()
    return int(total), items


class DurClient:
    def __init__(self, *, timeout=20, page_size=100, max_pages=1000):
        self.timeout = timeout
        self.page_size = page_size
        self.max_pages = max_pages

    def query(self, operation, item_seq):
        """Target-side lookup only; empty is not proof of no reverse relation.

        Errors contain fixed codes only. Partial pages are discarded on failure.
        Raw rows live only in the returned object; nothing is persisted.
        """
        def error(code):
            return DurResult('ERROR', operation, item_seq, error_code=code)

        if operation not in OPERATIONS or not isinstance(item_seq, str) or not item_seq.isdigit():
            return error('INVALID_QUERY')
        key = os.environ.get('MFDS_DUR_SERVICE_KEY', '').strip()
        if not key:
            return error('MISSING_KEY')
        secrets = {key, unquote(key), urlencode({'k': unquote(key)}).split('=', 1)[1]}

        def redact(value):
            if isinstance(value, str):
                for secret in secrets:
                    value = value.replace(secret, '[REDACTED]')
            elif isinstance(value, list):
                value = [redact(v) for v in value]
            elif isinstance(value, dict):
                value = {redact(k): redact(v) for k, v in value.items()}
            return value

        rows, expected, seen_pages = [], None, set()
        for page in range(1, self.max_pages + 1):
            query = urlencode(dict(serviceKey=unquote(key), itemSeq=item_seq,
                                   type='json', pageNo=page, numOfRows=self.page_size))
            try:
                with urlopen(BASE_URL + operation + '?' + query, timeout=self.timeout) as response:
                    total, items = _parse(response.read())
            except HTTPError as exc:
                return error(f'HTTP_{exc.code}')
            except (URLError, TimeoutError, OSError):
                return error('CONNECTION_ERROR')
            except RuntimeError:
                return error('API_ERROR')
            except (ValueError, KeyError, TypeError, AttributeError, ET.ParseError):
                return error('MALFORMED_RESPONSE')
            signature = json.dumps(items, sort_keys=True)
            if (expected is not None and total != expected) or signature in seen_pages:
                return error('INCONSISTENT_PAGINATION')
            expected = total
            seen_pages.add(signature)
            if any(str(row.get('ITEM_SEQ', '')) != item_seq for row in items):
                return error('ITEM_MISMATCH')
            rows.extend(normalize(redact(row), operation) for row in items)
            if len(rows) > total or (not items and len(rows) < total):
                return error('INCONSISTENT_PAGINATION')
            if len(rows) == total:
                return DurResult('SUCCESS_WITH_RESULTS' if rows else 'SUCCESS_EMPTY',
                                 operation, item_seq, rows, total)
        return error('PAGINATION_LIMIT')
