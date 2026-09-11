from django.core.management.base import BaseCommand, CommandError

from apps.knowledge.services.embedding_client import EmbeddingServiceError
from apps.knowledge.services.medgemma_client import MedgemmaServiceError
from apps.knowledge.services.rag import answer_with_rag
from apps.knowledge.services.search import DEFAULT_TOP_K


class Command(BaseCommand):
    help = "질문을 pgvector로 검색한 뒤 medgemma에 컨텍스트로 넣어 답변을 받아 콘솔에 출력한다."

    def add_arguments(self, parser):
        parser.add_argument("question", help="질문 텍스트")
        parser.add_argument("--top-k", type=int, default=DEFAULT_TOP_K)

    def handle(self, *args, **options):
        try:
            result = answer_with_rag(options["question"], top_k=options["top_k"])
        except (EmbeddingServiceError, MedgemmaServiceError) as exc:
            raise CommandError(f"실패: {exc}") from exc

        self.stdout.write(self.style.SUCCESS("답변:\n") + result["answer"])
        self.stdout.write("\n참고한 청크:")
        for source in result["sources"]:
            self.stdout.write(f"  - {source['document']} #{source['chunk_index']} (distance={source['distance']:.4f})")
