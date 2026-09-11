from django.core.management.base import BaseCommand, CommandError

from apps.knowledge.services.embedding_client import EmbeddingServiceError
from apps.knowledge.services.search import DEFAULT_TOP_K, search_knowledge


class Command(BaseCommand):
    help = "질문 텍스트를 임베딩해 pgvector에서 가장 가까운 청크를 찾아 콘솔에 출력한다."

    def add_arguments(self, parser):
        parser.add_argument("query", help="검색할 질문 텍스트")
        parser.add_argument("--top-k", type=int, default=DEFAULT_TOP_K)

    def handle(self, *args, **options):
        try:
            results = search_knowledge(options["query"], top_k=options["top_k"])
        except EmbeddingServiceError as exc:
            raise CommandError(f"검색 실패: {exc}") from exc

        if not results:
            self.stdout.write(self.style.WARNING("결과 없음 (revision이 일치하는 청크가 없을 수 있음)"))
            return

        for rank, chunk in enumerate(results, start=1):
            self.stdout.write(
                f"\n[{rank}] distance={chunk.distance:.4f} document={chunk.document.title!r} "
                f"chunk_index={chunk.chunk_index}\n{chunk.content}\n"
            )
