from django.shortcuts import get_object_or_404
from django.db import transaction
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.cases.models import LungCancerCase

from .models import CaseChatMessage
from .pagination import CaseChatMessageCursorPagination
from .permissions import IsRealtimeService, can_access_case_chat
from .serializers import CaseChatMessageCreateSerializer, CaseChatMessageSerializer


class ClientMessageIdConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "client_message_id가 다른 메시지에 이미 사용됐습니다."
    default_code = "client_message_id_conflict"


class CaseChatMessageListAPIView(ListAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    serializer_class = CaseChatMessageSerializer
    pagination_class = CaseChatMessageCursorPagination

    def get_case(self):
        if not hasattr(self, "_case"):
            self._case = get_object_or_404(
                LungCancerCase.objects.select_related(
                    "patient",
                    "primary_doctor",
                ),
                id=self.kwargs["case_id"],
            )
        return self._case

    def get_queryset(self):
        case = self.get_case()
        user = self.request.user
        if not can_access_case_chat(user, case):
            raise PermissionDenied("이 Case의 채팅 메시지에 접근할 권한이 없습니다.")
        return CaseChatMessage.objects.filter(case=case).select_related(
            "sender__department_role__department"
        )


class InternalCaseChatMessageCreateAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsRealtimeService]

    def post(self, request, case_id):
        serializer = CaseChatMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        case = get_object_or_404(
            LungCancerCase.objects.select_related("patient", "primary_doctor"),
            id=case_id,
        )
        if not can_access_case_chat(request.user, case):
            raise PermissionDenied("이 Case의 채팅 메시지를 작성할 권한이 없습니다.")

        with transaction.atomic():
            message, created = CaseChatMessage.objects.get_or_create(
                case=case,
                sender=request.user,
                client_message_id=serializer.validated_data["client_message_id"],
                defaults={"body": serializer.validated_data["body"]},
            )
            if not created and message.body != serializer.validated_data["body"]:
                raise ClientMessageIdConflict()

        message = CaseChatMessage.objects.select_related(
            "sender__department_role__department"
        ).get(id=message.id)
        return Response(
            {"message": CaseChatMessageSerializer(message).data, "created": created},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class InternalCaseChatAccessAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsRealtimeService]

    def get(self, request, case_id):
        case = get_object_or_404(
            LungCancerCase.objects.select_related("patient", "primary_doctor"),
            id=case_id,
        )
        if not can_access_case_chat(request.user, case):
            raise PermissionDenied("이 Case의 채팅방에 접근할 권한이 없습니다.")
        return Response({"allowed": True, "case_id": case.id})
