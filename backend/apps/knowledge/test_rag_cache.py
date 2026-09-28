from types import SimpleNamespace
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from apps.knowledge.services.rag import answer_with_rag


@override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}, MEDGEMMA_SERVICE_URL="http://test")
class RagCacheTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.chunk = SimpleNamespace(content="Evidence A", chunk_index=1, distance=0.1,
                                     document=SimpleNamespace(title="PDQ", source_uri="https://example.org"))

    @patch("apps.knowledge.services.rag.request_chat_completion", return_value="Answer [1]")
    @patch("apps.knowledge.services.rag.search_knowledge")
    def test_reuses_generation_but_rechecks_evidence(self, search, generate):
        search.return_value = [self.chunk]
        first = answer_with_rag("Question")
        self.assertEqual(answer_with_rag("Question"), first)
        self.assertEqual(search.call_count, 2)
        generate.assert_called_once()
        self.chunk.content = "Updated evidence"
        answer_with_rag("Question")
        self.assertEqual(generate.call_count, 2)
        answer_with_rag("Different question")
        self.assertEqual(generate.call_count, 3)

    @patch("apps.knowledge.services.rag.request_chat_completion")
    @patch("apps.knowledge.services.rag.search_knowledge", return_value=[])
    def test_no_evidence_skips_generation(self, search, generate):
        self.assertEqual(answer_with_rag("Question")["sources"], [])
        generate.assert_not_called()

    @patch("apps.knowledge.services.rag.request_chat_completion", side_effect=[RuntimeError("offline"), "Recovered"])
    @patch("apps.knowledge.services.rag.search_knowledge")
    def test_failures_are_not_cached(self, search, generate):
        search.return_value = [self.chunk]
        with self.assertRaises(RuntimeError):
            answer_with_rag("Question")
        self.assertEqual(answer_with_rag("Question")["answer"], "Recovered")
