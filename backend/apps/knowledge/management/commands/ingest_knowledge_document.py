from django.core.management.base import BaseCommand, CommandError

from apps.knowledge.models import KnowledgeDocument
from apps.knowledge.services.embedding_client import EmbeddingServiceError
from apps.knowledge.services.ingestion import ingest_document


class Command(BaseCommand):
    help = (
        "평문 텍스트 파일을 청크로 나눠 embedding 서비스로 벡터화한 뒤 "
        "knowledge_documents/knowledge_chunks에 저장한다. PDF 등은 미리 텍스트로 추출해 둬야 한다."
    )

    def add_arguments(self, parser):
        parser.add_argument("text_file", help="UTF-8 평문 텍스트 파일 경로")
        parser.add_argument("--title", required=True, help="문서 제목")
        parser.add_argument(
            "--source-type", required=True, choices=[choice.value for choice in KnowledgeDocument.SourceType],
        )
        parser.add_argument("--source-uri", default=None, help="원본 경로나 URL (선택)")

    def handle(self, *args, **options):
        try:
            with open(options["text_file"], encoding="utf-8") as f:
                text = f.read()
        except OSError as exc:
            raise CommandError(f"파일을 읽을 수 없습니다: {exc}") from exc

        try:
            document = ingest_document(
                title=options["title"], source_type=options["source_type"],
                text=text, source_uri=options["source_uri"],
            )
        except EmbeddingServiceError as exc:
            raise CommandError(f"임베딩 실패: {exc}") from exc

        chunk_count = document.chunks.count()
        self.stdout.write(self.style.SUCCESS(f"문서 '{document.title}' 저장 완료 (청크 {chunk_count}개, id={document.id})"))
