from pgvector.django import CosineDistance

from apps.knowledge.models import KnowledgeChunk

from .embedding_client import request_embeddings

DEFAULT_TOP_K = 5


def search_knowledge(query, top_k=DEFAULT_TOP_K, document_ids=None):
    """질문 텍스트를 임베딩해 pgvector에서 코사인 거리 기준으로 가장 가까운 청크를 찾는다.

    embedding 서비스 모델이 바뀌면 이전에 저장된 벡터와 좌표계가 달라지므로,
    질의 시점의 revision과 같은 청크만 검색 대상으로 삼는다.
    """
    result = request_embeddings([query], "query")
    vector = result["embeddings"][0]
    revision = result["revision"]

    filters = {"model_revision": revision}
    if document_ids is not None:
        filters["document_id__in"] = document_ids
    return list(
        KnowledgeChunk.objects.filter(**filters)
        .annotate(distance=CosineDistance("embedding", vector))
        .order_by("distance")
        .select_related("document")[:top_k]
    )
