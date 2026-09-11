from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.knowledge.services.embedding_client import EmbeddingServiceError
from apps.knowledge.services.medgemma_client import MedgemmaServiceError
from apps.knowledge.services.rag import answer_with_rag
from apps.knowledge.services.search import search_knowledge

from .permissions import IsAIService
from .serializers import (
    AskKnowledgeRequestSerializer,
    AskKnowledgeResponseSerializer,
    SearchKnowledgeRequestSerializer,
    SearchKnowledgeResponseSerializer,
)


class AskKnowledgeAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request_serializer = AskKnowledgeRequestSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        try:
            result = answer_with_rag(
                request_serializer.validated_data["question"],
                top_k=request_serializer.validated_data["top_k"],
            )
        except (EmbeddingServiceError, MedgemmaServiceError) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(AskKnowledgeResponseSerializer(result).data, status=status.HTTP_200_OK)


class AskKnowledgeAIAPIView(APIView):
    """Service-to-service RAG endpoint used by Genkit for medical questions."""

    authentication_classes = []
    permission_classes = [IsAIService]

    def post(self, request):
        request_serializer = AskKnowledgeRequestSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        try:
            result = answer_with_rag(
                request_serializer.validated_data["question"],
                top_k=request_serializer.validated_data["top_k"],
            )
        except (EmbeddingServiceError, MedgemmaServiceError) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(AskKnowledgeResponseSerializer(result).data, status=status.HTTP_200_OK)


class SearchKnowledgeAIAPIView(APIView):
    """Return raw pgvector retrieval results to trusted AI orchestrators."""

    authentication_classes = []
    permission_classes = [IsAIService]

    def post(self, request):
        request_serializer = SearchKnowledgeRequestSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        try:
            chunks = search_knowledge(
                request_serializer.validated_data["query"],
                top_k=request_serializer.validated_data["top_k"],
            )
        except EmbeddingServiceError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        result = {
            "chunks": [
                {
                    "document": chunk.document.title,
                    "chunk_index": chunk.chunk_index,
                    "content": chunk.content,
                    "distance": chunk.distance,
                }
                for chunk in chunks
            ]
        }
        return Response(SearchKnowledgeResponseSerializer(result).data, status=status.HTTP_200_OK)
