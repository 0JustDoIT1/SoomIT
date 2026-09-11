from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.knowledge.services.embedding_client import EmbeddingServiceError
from apps.knowledge.services.medgemma_client import MedgemmaServiceError
from apps.knowledge.services.rag import answer_with_rag

from .serializers import AskKnowledgeRequestSerializer, AskKnowledgeResponseSerializer


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
