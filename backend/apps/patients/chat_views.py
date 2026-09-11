from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .chat_serializers import PatientChatRequestSerializer, PatientChatResponseSerializer
from .services.genkit_client import (
    GenkitServiceError,
    GenkitServiceNotConfigured,
    request_patient_chat,
)


class PatientChatAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["환자 챗봇"],
        request=PatientChatRequestSerializer,
        responses={200: PatientChatResponseSerializer},
    )
    def post(self, request):
        serializer = PatientChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            result = request_patient_chat(
                message=serializer.validated_data["message"],
                history=serializer.validated_data["history"],
            )
        except GenkitServiceNotConfigured as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except GenkitServiceError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(PatientChatResponseSerializer(result).data)
