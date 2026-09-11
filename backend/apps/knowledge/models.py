from django.db import models
from pgvector.django import VectorField

from apps.accounts.models import User
from apps.common.models import TimestampedUUIDModel

# embedding 서비스(ai-services/embedding, intfloat/multilingual-e5-base)의 출력 차원.
# 모델을 바꾸면 이 값과 기존에 저장된 벡터가 전부 어긋나므로 함께 재임베딩해야 한다.
EMBEDDING_DIMENSIONS = 768


# ── knowledge_documents ──────────────────────────────────────────
class KnowledgeDocument(TimestampedUUIDModel):
    class SourceType(models.TextChoices):
        PDF = "PDF", "PDF"
        TEXT = "TEXT", "텍스트"
        URL = "URL", "URL"

    title = models.CharField(max_length=255)
    source_type = models.CharField(max_length=10, choices=SourceType.choices)
    source_uri = models.CharField(max_length=500, null=True, blank=True)
    uploaded_by_user = models.ForeignKey(
        User, on_delete=models.PROTECT, null=True, blank=True, related_name="uploaded_knowledge_documents"
    )

    class Meta:
        db_table = "knowledge_documents"


# ── knowledge_chunks ──────────────────────────────────────────────
class KnowledgeChunk(TimestampedUUIDModel):
    document = models.ForeignKey(KnowledgeDocument, on_delete=models.CASCADE, related_name="chunks")
    chunk_index = models.PositiveIntegerField()
    content = models.TextField()
    token_count = models.PositiveIntegerField()
    embedding = VectorField(dimensions=EMBEDDING_DIMENSIONS)
    # embedding 서비스 /health 가 보고하는 모델 revision. 모델이 바뀌면 이 값이 다른
    # 청크가 섞이므로, 검색 시점에 질의 벡터와 같은 revision인지 확인하는 데 쓴다.
    model_revision = models.CharField(max_length=64)

    class Meta:
        db_table = "knowledge_chunks"
        constraints = [
            models.UniqueConstraint(fields=["document", "chunk_index"], name="uq_knowledge_chunk_document_index"),
        ]
