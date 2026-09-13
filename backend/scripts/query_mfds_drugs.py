"""Read-only MFDS approval lookup; no Django or database connection."""
import argparse
import json
import os
from pathlib import Path
import sys
from urllib.parse import urlencode, unquote
from urllib.request import urlopen
from urllib.error import HTTPError, URLError
import xml.etree.ElementTree as ET

from dotenv import load_dotenv

BASE = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/'
INGREDIENTS = ['Osimertinib', 'Pemetrexed', 'Carboplatin', 'Pembrolizumab', 'Dabrafenib', 'Trametinib', 'Capmatinib']
FIELDS = ['ITEM_SEQ', 'ITEM_NAME', 'ENTP_NAME', 'ITEM_INGR_NAME', 'MAIN_ITEM_INGR', 'MAIN_INGR_ENG', 'EDI_CODE', 'BAR_CODE', 'CANCEL_NAME', 'CANCEL_DATE', 'ETC_OTC_CODE', 'ITEM_PERMIT_DATE']
DOCS = ['EE_DOC_DATA', 'UD_DOC_DATA', 'NB_DOC_DATA', 'PN_DOC_DATA']


class ApiError(Exception):
    pass


def fetch(key, operation, **params):
    rows = []
    for page in range(1, 1001):
        query = urlencode(dict(serviceKey=unquote(key), type='json', pageNo=page, numOfRows=100, **params))
        try:
            with urlopen(BASE + operation + '?' + query, timeout=20) as response:
                payload = response.read()
        except HTTPError as exc:
            raise ApiError(f'HTTP status={exc.code}') from None
        except (URLError, TimeoutError, OSError):
            raise ApiError('Connection/timeout failure') from None
        try:
            if payload.lstrip().startswith(b'<'):
                root = ET.fromstring(payload)
                code = root.findtext('.//resultCode') or root.findtext('.//returnReasonCode')
                message = root.findtext('.//resultMsg') or root.findtext('.//returnAuthMsg')
                body = {'totalCount': root.findtext('.//totalCount'), 'items': [{c.tag: ''.join(c.itertext()) for c in item} for item in root.findall('.//items/item')]}
                fmt = 'xml'
            else:
                data = json.loads(payload)
                data = data.get('response', data)
                code, message = data['header']['resultCode'], data['header']['resultMsg']
                body = data.get('body', {})
                fmt = 'json'
            if str(code) not in ('00', '0') or not message:
                # Do not echo remote messages: they may contain request credentials.
                raise ApiError('API resultCode/resultMsg rejected (remote text suppressed)')
            total = int(body['totalCount'])
            items = body.get('items') or []
            if isinstance(items, dict):
                items = items.get('item', [])
            if isinstance(items, dict):
                items = [items]
            if total < 0 or not isinstance(items, list) or any(not isinstance(x, dict) for x in items):
                raise ValueError()
        except (ValueError, KeyError, TypeError, AttributeError, ET.ParseError):
            raise ApiError('Malformed JSON/XML response') from None
        rows.extend(items)
        if len(rows) >= total:
            return {'format': fmt, 'totalCount': total, 'items': rows}
        if not items:
            raise ApiError('Incomplete pagination')
    raise ApiError('Pagination limit exceeded')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ingredient', action='append')
    args = parser.parse_args()
    load_dotenv(Path(__file__).resolve().parents[1] / '.env')
    key = os.getenv('MFDS_SERVICE_KEY', '').strip()
    if not key:
        print('MFDS_SERVICE_KEY setting required')
        return 2
    failed = False
    for ingredient in args.ingredient or INGREDIENTS:
        try:
            result = fetch(key, 'getDrugPrdtPrmsnInq07', item_ingr_name=ingredient)
            output = {'query': ingredient, 'format': result['format'], 'totalCount': result['totalCount'], 'items': [{f: row.get(f) for f in FIELDS if f in row} for row in result['items']]}
            # A sample for response inspection only, never a representative mapping.
            seq = next((row.get('ITEM_SEQ') for row in result['items'] if row.get('ITEM_SEQ')), None)
            if seq:
                detail = fetch(key, 'getDrugPrdtPrmsnDtlInq06', item_seq=seq)
                output['detail_sample'] = {'format': detail['format'], 'totalCount': detail['totalCount'], 'items': [{**{f: row.get(f) for f in FIELDS}, 'documents': {f: ('present' if row.get(f) else 'empty') for f in DOCS}} for row in detail['items']]}
            # Defense in depth for any credential echoed in product fields.
            rendered = json.dumps(output, ensure_ascii=False)
            for secret in {key, unquote(key), urlencode({'serviceKey': unquote(key)}).split('=', 1)[1]}:
                rendered = rendered.replace(secret, '[REDACTED]')
            print(rendered, flush=True)
        except ApiError as exc:
            failed = True
            print(json.dumps({'query': ingredient, 'error': str(exc)}), flush=True)
    return int(failed)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
