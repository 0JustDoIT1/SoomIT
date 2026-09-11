from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import User
from apps.knowledge.models import KnowledgeChunk, KnowledgeDocument
from apps.knowledge.services.chunking import chunk_text, split_in_half
from apps.knowledge.services.embedding_client import EmbeddingServiceError, InputTooLong
from apps.knowledge.services.ingestion import _embed_passages, ingest_document
from apps.knowledge.services.medgemma_client import MedgemmaServiceError
from apps.knowledge.services.rag import answer_with_rag


def fake_embed_response(texts, revision="test-rev"):
    return {
        "model": "intfloat/multilingual-e5-base", "revision": revision, "dimensions": 768,
        "embeddings": [[0.1] * 768 for _ in texts], "token_counts": [len(t) for t in texts],
    }


class ChunkingTests(TestCase):
    def test_chunk_text_packs_sentences_up_to_target(self):
        text = "첫 문장입니다. 두 번째 문장입니다. 세 번째 문장입니다."
        chunks = chunk_text(text, target_chars=15)
        self.assertEqual(chunks, ["첫 문장입니다.", "두 번째 문장입니다.", "세 번째 문장입니다."])

    def test_chunk_text_strips_pdf_bullet_marker_runs(self):
        # PDF에서 글머리표 목록을 추출하면 항목 텍스트 없이 '•'만 남는 구간이 생긴다.
        text = "Amivantamab. •\n•\n•\n•\n\n6. ALK inhibitors. Alectinib."
        chunks = chunk_text(text, target_chars=200)
        self.assertEqual(chunks, ["Amivantamab. 6. ALK inhibitors. Alectinib."])

    def test_split_in_half_prefers_sentence_boundary(self):
        left, right = split_in_half("문장 하나. 문장 둘. 문장 셋. 문장 넷.")
        self.assertEqual(left, "문장 하나. 문장 둘.")
        self.assertEqual(right, "문장 셋. 문장 넷.")

    def test_split_in_half_gives_up_below_min_chars(self):
        self.assertIsNone(split_in_half("short"))


class IngestDocumentTests(TestCase):
    @patch("apps.knowledge.services.ingestion.request_embeddings")
    def test_ingest_document_stores_chunks_in_order(self, mock_request):
        mock_request.side_effect = lambda texts, input_type: fake_embed_response(texts)

        document = ingest_document(
            title="테스트 문서", source_type=KnowledgeDocument.SourceType.TEXT,
            text="첫 문장입니다. 두 번째 문장입니다.",
        )

        # 기본 target_chars(800)보다 훨씬 짧은 문서라 문장 두 개가 한 청크로 묶인다.
        chunks = list(KnowledgeChunk.objects.filter(document=document).order_by("chunk_index"))
        self.assertEqual([c.content for c in chunks], ["첫 문장입니다. 두 번째 문장입니다."])
        self.assertTrue(all(c.model_revision == "test-rev" for c in chunks))
        self.assertEqual(mock_request.call_args.args[-1], "passage")

    @patch("apps.knowledge.services.ingestion.request_embeddings")
    def test_batch_with_oversized_member_bisects_until_isolated(self, mock_request):
        # 배치(3개)를 통째로 넣으면 422, 절반씩 재시도하다 결국 1개씩 성공하도록 흉내낸다.
        def side_effect(texts, input_type):
            if len(texts) > 1:
                raise InputTooLong("too long")
            return fake_embed_response(texts)

        mock_request.side_effect = side_effect

        results = _embed_passages(["a", "b", "c"])

        self.assertEqual([content for content, _, _, _ in results], ["a", "b", "c"])

    @patch("apps.knowledge.services.ingestion.request_embeddings")
    def test_unsplittable_oversized_text_raises(self, mock_request):
        mock_request.side_effect = InputTooLong("too long")

        with self.assertRaises(EmbeddingServiceError):
            ingest_document(
                title="분할 불가", source_type=KnowledgeDocument.SourceType.TEXT, text="short",
            )

        self.assertEqual(KnowledgeDocument.objects.filter(title="분할 불가").count(), 0)  # atomic 롤백 확인


class RagTests(TestCase):
    @patch("apps.knowledge.services.ingestion.request_embeddings")
    def setUp(self, mock_request):
        mock_request.side_effect = lambda texts, input_type: fake_embed_response(texts)
        self.document = ingest_document(
            title="테스트 문서", source_type=KnowledgeDocument.SourceType.TEXT,
            text="EGFR 변이 관련 치료 지침입니다.",
        )

    @patch("apps.knowledge.services.rag.request_chat_completion")
    @patch("apps.knowledge.services.search.request_embeddings")
    def test_answer_with_rag_injects_retrieved_chunks_as_context(self, mock_embed, mock_chat):
        mock_embed.return_value = fake_embed_response(["질문"])
        mock_chat.return_value = "이 문서에 따르면 답은 이렇습니다."

        result = answer_with_rag("EGFR 변이 치료는 어떻게 하나요?", top_k=3)

        self.assertEqual(result["answer"], "이 문서에 따르면 답은 이렇습니다.")
        self.assertEqual(len(result["sources"]), 1)
        self.assertEqual(result["sources"][0]["document"], "테스트 문서")

        messages = mock_chat.call_args.args[0]
        self.assertEqual(messages[0]["role"], "system")
        self.assertIn("EGFR 변이 관련 치료 지침입니다.", messages[0]["content"])
        self.assertEqual(messages[-1], {"role": "user", "content": "EGFR 변이 치료는 어떻게 하나요?"})

    @patch("apps.knowledge.services.rag.request_chat_completion")
    def test_answer_with_rag_propagates_medgemma_errors(self, mock_chat):
        mock_chat.side_effect = MedgemmaServiceError("연결 실패")

        with self.assertRaises(MedgemmaServiceError):
            with patch("apps.knowledge.services.search.request_embeddings") as mock_embed:
                mock_embed.return_value = fake_embed_response(["질문"])
                answer_with_rag("질문")


class AskKnowledgeAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(login_id="tester", password="test-pass-1234")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.user)}")
        self.url = reverse("knowledge:ask")

    def test_requires_authentication(self):
        self.client.credentials()

        response = self.client.post(self.url, {"question": "질문"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_rejects_blank_question(self):
        response = self.client.post(self.url, {"question": ""}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("apps.knowledge.views.answer_with_rag")
    def test_returns_answer_and_sources(self, mock_answer):
        mock_answer.return_value = {
            "answer": "답변입니다.",
            "sources": [{"document": "테스트 문서", "chunk_index": 0, "distance": 0.12}],
        }

        response = self.client.post(self.url, {"question": "EGFR 치료는?"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["answer"], "답변입니다.")
        self.assertEqual(response.data["sources"][0]["document"], "테스트 문서")
        mock_answer.assert_called_once_with("EGFR 치료는?", top_k=5)

    @patch("apps.knowledge.views.answer_with_rag")
    def test_medgemma_failure_returns_502(self, mock_answer):
        mock_answer.side_effect = MedgemmaServiceError("연결 실패")

        response = self.client.post(self.url, {"question": "질문"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
