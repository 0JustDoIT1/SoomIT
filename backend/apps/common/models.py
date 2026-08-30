import uuid
from django.db import models


class UUIDModel(models.Model):
    """UUID PK만 갖는 추상 베이스. PK 자체가 다른 테이블의 FK인 1:1 상세테이블에서 사용."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class TimestampedUUIDModel(UUIDModel):
    """id(UUID PK) + created_at + updated_at 를 갖는 표준 테이블용 베이스."""
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class CreatedOnlyUUIDModel(UUIDModel):
    """id(UUID PK) + created_at 만 갖는 테이블용 베이스 (수정 이력 없는 로그성 테이블)."""
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True
