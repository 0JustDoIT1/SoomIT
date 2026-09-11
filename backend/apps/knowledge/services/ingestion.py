from django.conf import settings
from django.db import transaction

from apps.knowledge.models import KnowledgeChunk, KnowledgeDocument

from .chunking import chunk_text, split_in_half
from .embedding_client import EmbeddingServiceError, InputTooLong, request_embeddings


def _embed_passages(texts):
    """texts를 순서를 지켜 (텍스트, 벡터, 토큰수, revision) 튜플 목록으로 임베딩한다.

    한 배치 안에 512토큰을 넘는 텍스트가 섞여 있으면 서비스가 배치 전체를 422로
    거부하므로, 그 경우 배치를 반으로 나눠 재시도해 범인을 좁혀가다가 결국
    문장 경계에서 그 텍스트 자체를 분할한다.
    """
    if not texts:
        return []
    try:
        result = request_embeddings(texts, "passage")
    except InputTooLong:
        if len(texts) > 1:
            mid = len(texts) // 2
            return _embed_passages(texts[:mid]) + _embed_passages(texts[mid:])
        halves = split_in_half(texts[0])
        if halves is None:
            raise EmbeddingServiceError("문장 경계로 더 이상 나눌 수 없는 텍스트가 512토큰을 초과합니다.")
        return _embed_passages([halves[0]]) + _embed_passages([halves[1]])
    return list(zip(texts, result["embeddings"], result["token_counts"], [result["revision"]] * len(texts)))


@transaction.atomic
def ingest_document(title, source_type, text, source_uri=None, uploaded_by_user=None):
    """문서 원문을 청크로 나눠 임베딩하고 knowledge_documents/knowledge_chunks에 저장한다."""
    document = KnowledgeDocument.objects.create(
        title=title, source_type=source_type, source_uri=source_uri, uploaded_by_user=uploaded_by_user,
    )
    chunks = chunk_text(text)
    batch_size = settings.EMBEDDING_SERVICE_BATCH_SIZE
    chunk_index = 0
    for batch_start in range(0, len(chunks), batch_size):
        batch = chunks[batch_start:batch_start + batch_size]
        for content, embedding, token_count, revision in _embed_passages(batch):
            KnowledgeChunk.objects.create(
                document=document, chunk_index=chunk_index, content=content,
                token_count=token_count, embedding=embedding, model_revision=revision,
            )
            chunk_index += 1
    return document
