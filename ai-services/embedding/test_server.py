import unittest
from fastapi.testclient import TestClient
from encoder import InputTooLong
from server import create_app


class FakeEncoder:
    revision = "test-revision"

    def encode(self, texts, input_type):
        if texts == ["overlong"]:
            raise InputTooLong("split the text")
        self.last_call = (texts, input_type)
        return [[1.0] + [0.0] * 767 for _ in texts], [10] * len(texts)


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.encoder = FakeEncoder()
        self.client = TestClient(create_app(lambda: self.encoder))
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)

    def test_query_contract_and_provenance(self):
        response = self.client.post("/embed", json={"texts": [" 폐 결절 "], "input_type": "query"})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["embeddings"][0]), 768)
        self.assertEqual(data["revision"], "test-revision")
        self.assertEqual(self.encoder.last_call, (["폐 결절"], "query"))

    def test_reject_invalid_requests(self):
        for payload in [{"texts": [], "input_type": "query"},
                        {"texts": [" "], "input_type": "query"},
                        {"texts": ["x"] * 9, "input_type": "passage"},
                        {"texts": ["x"], "input_type": "other"},
                        {"texts": ["x"], "input_type": "query", "model": "other"}]:
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post("/embed", json=payload).status_code, 422)

    def test_overlong_is_not_silently_truncated(self):
        self.assertEqual(self.client.post("/embed", json={"texts": ["overlong"], "input_type": "passage"}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
