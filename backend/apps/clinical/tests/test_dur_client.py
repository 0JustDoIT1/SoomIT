import json
import os
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError

from apps.clinical.dur_client import DurClient, OPERATIONS, normalize


def page(rows, total=None, code='00'):
    return json.dumps({'header': {'resultCode': code, 'resultMsg': 'OK'},
                       'body': {'totalCount': len(rows) if total is None else total,
                                'items': rows}}).encode()


class DurClientTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'MFDS_DUR_SERVICE_KEY': 'fake%2Bsecret'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.op = 'getUsjntTabooInfoList03'

    def query(self, *payloads):
        responses = []
        for payload in payloads:
            r = MagicMock()
            r.__enter__.return_value.read.return_value = payload
            responses.append(r)
        with patch('apps.clinical.dur_client.urlopen', side_effect=responses) as call:
            result = DurClient(page_size=1).query(self.op, '123')
            return result, call

    def test_results_pair_and_raw(self):
        row = {'ITEM_SEQ': '123', 'INGR_CODE': 'D1', 'MIXTURE_ITEM_SEQ': '456',
               'MIXTURE_INGR_CODE': 'D2', 'REMARK': 'exception', 'EXTRA': 'kept'}
        result, _ = self.query(page([row]))
        self.assertEqual(result.status, 'SUCCESS_WITH_RESULTS')
        self.assertEqual(result.rows[0]['mixture_ingr_code'], 'D2')
        self.assertEqual(result.rows[0]['mixture_item_seq'], '456')
        self.assertEqual(result.rows[0]['raw'], row)
        self.assertIsNone(result.rows[0]['notification_date'])

    def test_empty(self):
        result, _ = self.query(page([]))
        self.assertEqual((result.status, result.total_count), ('SUCCESS_EMPTY', 0))

    def test_http_and_timeout(self):
        for exc in [HTTPError('secret-url', 403, 'secret', {}, None), URLError('secret'), TimeoutError()]:
            with self.subTest(exc=type(exc)), patch('apps.clinical.dur_client.urlopen', side_effect=exc):
                result = DurClient().query(self.op, '123')
                self.assertEqual(result.status, 'ERROR')
                self.assertNotIn('secret', repr(result))

    def test_api_error(self):
        result, _ = self.query(page([], code='30'))
        self.assertEqual(result.error_code, 'API_ERROR')

    def test_malformed(self):
        for data in [b'{bad', b'<broken', b'{}', page([], total='bad')]:
            with self.subTest(data=data):
                result, _ = self.query(data)
                self.assertEqual(result.error_code, 'MALFORMED_RESPONSE')

    def test_xml(self):
        result, _ = self.query(b'<response><header><resultCode>00</resultCode><resultMsg>OK</resultMsg></header><body><totalCount>1</totalCount><items><item><ITEM_SEQ>123</ITEM_SEQ><REMARK /></item></items></body></response>')
        self.assertEqual(result.status, 'SUCCESS_WITH_RESULTS')
        self.assertIsNone(result.rows[0]['remark'])

    def test_pagination(self):
        result, call = self.query(page([{'ITEM_SEQ': '123', 'INGR_CODE': 'A'}], 2),
                                  page([{'ITEM_SEQ': '123', 'INGR_CODE': 'B'}], 2))
        self.assertEqual(len(result.rows), 2)
        self.assertIn('pageNo=2', call.call_args.args[0])
        self.assertIn('serviceKey=fake%2Bsecret', call.call_args.args[0])

    def test_partial_failure_and_repeated_page(self):
        for second in [b'bad', page([{'ITEM_SEQ': '123'}], 2), page([], 2)]:
            result, _ = self.query(page([{'ITEM_SEQ': '123'}], 2), second)
            self.assertEqual(result.status, 'ERROR')
            self.assertEqual(result.rows, [])

    def test_all_types_and_missing_type(self):
        for op, name in OPERATIONS.items():
            self.assertEqual(normalize({'TYPE_NAME': name}, op)['dur_type'], name)
            self.assertEqual(normalize({}, op)['source_operation'], op)
            self.assertIsNone(normalize({}, op)['dur_type'])

    def test_secret_redaction(self):
        result, _ = self.query(page([{'ITEM_SEQ': '123', 'REMARK': 'fake+secret fake%2Bsecret'}]))
        self.assertNotIn('fake', repr(result))

    def test_mismatch(self):
        result, _ = self.query(page([{'ITEM_SEQ': '999'}]))
        self.assertEqual(result.error_code, 'ITEM_MISMATCH')

    def test_missing_key_and_invalid_operation(self):
        with patch.dict(os.environ, {'MFDS_DUR_SERVICE_KEY': ''}), patch('apps.clinical.dur_client.urlopen') as call:
            self.assertEqual(DurClient().query(self.op, '123').error_code, 'MISSING_KEY')
            self.assertEqual(DurClient().query('invalid', '123').error_code, 'INVALID_QUERY')
            call.assert_not_called()
