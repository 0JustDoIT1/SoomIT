import unittest
from unittest.mock import AsyncMock

import httpx
from fastapi.testclient import TestClient

from server import create_app


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.process = type("Process", (), {
            "returncode": None, "terminate": lambda s: None, "wait": AsyncMock(),
        })()
        self.status = 200
        self.received = []

        def handler(request):
            if request.url.path == "/health":
                return httpx.Response(200)
            self.received.append(request)
            return httpx.Response(self.status, json={"choices": [{"message": {"content": "answer"}}]})

        app = create_app(
            AsyncMock(return_value=self.process),
            lambda: httpx.AsyncClient(base_url="http://engine", transport=httpx.MockTransport(handler)),
        )
        self.client = TestClient(app)
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)

    def test_forwarding(self):
        result = self.client.post("/v1/chat/completions", json={"messages": [{"role": "user", "content": "question"}]})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["choices"][0]["message"]["content"], "answer")
        self.assertEqual(self.received[0].url.path, "/v1/chat/completions")

    def test_invalid_input_never_calls_engine(self):
        for body in [{"messages": []}, {"messages": [{"role": "user", "content": "x"}], "stream": True},
                     {"messages": [{"role": "user", "content": "x"}], "max_tokens": 99999}]:
            self.assertEqual(self.client.post("/v1/chat/completions", json=body).status_code, 422)
        self.assertFalse(self.received)

    def test_engine_failure_is_sanitized(self):
        self.status = 500
        self.assertEqual(self.client.post("/v1/chat/completions", json={"messages": [{"role": "user", "content": "x"}]}).status_code, 502)


if __name__ == "__main__":
    unittest.main()
