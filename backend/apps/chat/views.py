from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Q
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.cases.models import LungCancerCase
from apps.notifications.services import create_in_app_staff_notifications

from .models import CaseChatMessage, CaseChatMessageReadReceipt
from .pagination import CaseChatMessageCursorPagination
from .permissions import IsRealtimeService, can_access_case_chat
from .serializers import CaseChatMessageCreateSerializer, CaseChatMessageSerializer


class ClientMessageIdConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "client_message_id가 다른 메시지에 이미 사용됐습니다."
    default_code = "client_message_id_conflict"


def visible_case_chat_messages(case, user):
    return CaseChatMessage.objects.filter(case=case).filter(
        Q(is_private=False) | Q(sender=user) | Q(recipients=user)
    ).select_related("sender__department_role__department").prefetch_related(
        "recipients",
        "read_receipts__reader",
    ).distinct()


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
        return visible_case_chat_messages(case, user)


class CaseChatMessageReadAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, case_id):
        message_ids = request.data.get("message_ids")
        if not isinstance(message_ids, list) or not message_ids or len(message_ids) > 50:
            return Response({"detail": "message_ids는 1~50개의 메시지 ID 목록이어야 합니다."}, status=400)
        case = get_object_or_404(LungCancerCase.objects.select_related("patient", "primary_doctor"), id=case_id)
        if not can_access_case_chat(request.user, case):
            raise PermissionDenied("이 Case의 채팅 메시지에 접근할 권한이 없습니다.")
        messages = list(visible_case_chat_messages(case, request.user).filter(id__in=message_ids).exclude(sender=request.user))
        existing_message_ids = set(
            CaseChatMessageReadReceipt.objects.filter(
                message__in=messages,
                reader=request.user,
            ).values_list("message_id", flat=True)
        )
        receipts = [
            CaseChatMessageReadReceipt(message=message, reader=request.user)
            for message in messages
            if message.id not in existing_message_ids
        ]
        CaseChatMessageReadReceipt.objects.bulk_create(receipts, ignore_conflicts=True)
        created_receipts = CaseChatMessageReadReceipt.objects.filter(
            message__in=[receipt.message for receipt in receipts],
            reader=request.user,
        ).select_related("message", "reader")
        return Response({
            "marked_count": len(receipts),
            "read_messages": [
                {
                    "message_id": str(receipt.message_id),
                    "sender_id": str(receipt.message.sender_id),
                    "reader": {
                        "id": str(receipt.reader_id),
                        "name": receipt.reader.name,
                        "read_at": receipt.created_at,
                    },
                }
                for receipt in created_receipts
            ],
        })


class CaseChatUnreadCountAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, case_id):
        case = get_object_or_404(LungCancerCase.objects.select_related("patient", "primary_doctor"), id=case_id)
        if not can_access_case_chat(request.user, case):
            raise PermissionDenied("이 Case의 채팅 메시지에 접근할 권한이 없습니다.")
        unread_count = visible_case_chat_messages(case, request.user).exclude(
            sender=request.user,
        ).exclude(
            read_receipts__reader=request.user,
        ).count()
        return Response({"unread_count": unread_count})


class CaseChatRecipientListAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, case_id):
        case = get_object_or_404(
            LungCancerCase.objects.select_related(
                "patient__hospital",
                "primary_doctor__department_role__department",
            ),
            id=case_id,
        )

        if not can_access_case_chat(request.user, case):
            raise PermissionDenied("이 Case의 채팅 수신자를 조회할 권한이 없습니다.")

        purpose = (request.query_params.get("purpose") or "chat").strip().lower()

        # 협진 요청용 목록:
        # 같은 병원의 ACTIVE 호흡기내과 DOCTOR만 반환한다.
        # Case 채팅 접근 권한과는 별개로 '협진 대상 후보'를 조회하는 목적이므로
        # can_access_case_chat(candidate, case) 필터를 적용하지 않는다.
        if purpose == "consultation":
            requester_department = getattr(
                getattr(request.user, "department_role", None),
                "department",
                None,
            )

            # 현재 호흡기내과 화면에서 호출하는 API이므로
            # 우선 로그인 사용자의 부서 코드를 사용하고,
            # 값이 없거나 다른 부서라면 프로젝트 표준 코드인 PULMONOLOGY로 제한한다.
            target_department_code = (
                requester_department.code
                if requester_department is not None
                and requester_department.code
                in {"PULMONOLOGY", "RESPIRATORY"}
                else "PULMONOLOGY"
            )

            candidates = (
                User.objects.filter(
                    account_status=User.AccountStatus.ACTIVE,
                    department_role__department__hospital=case.patient.hospital,
                    department_role__department__code=target_department_code,
                    department_role__role="DOCTOR",
                )
                .select_related("department_role__department")
                .exclude(id=request.user.id)
                .order_by("name")
            )

            return Response(
                [
                    {
                        "id": str(user.id),
                        "name": user.name,
                        "department": user.department_role.department.code,
                        "role": user.department_role.role,
                    }
                    for user in candidates
                ]
            )

        # 일반/개인 Case 채팅 수신자 목록:
        # 기존과 동일하게 이 Case 채팅에 실제 접근 가능한 의료진만 노출한다.
        candidates = (
            User.objects.filter(
                account_status=User.AccountStatus.ACTIVE,
                department_role__department__hospital=case.patient.hospital,
            )
            .select_related("department_role__department")
            .exclude(id=request.user.id)
            .order_by("name")
        )

        return Response(
            [
                {
                    "id": str(user.id),
                    "name": user.name,
                    "department": user.department_role.department.code,
                    "role": user.department_role.role,
                }
                for user in candidates
                if can_access_case_chat(user, case)
            ]
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

        recipient_ids = serializer.validated_data.get("recipient_ids", [])
        recipients = list(User.objects.filter(id__in=recipient_ids).select_related("department_role__department"))
        if len(recipients) != len(set(recipient_ids)) or any(not can_access_case_chat(recipient, case) for recipient in recipients):
            return Response({"detail": "수신자는 이 Case 채팅에 접근 가능한 의료진만 지정할 수 있습니다."}, status=400)

        with transaction.atomic():
            message, created = CaseChatMessage.objects.get_or_create(
                case=case,
                sender=request.user,
                client_message_id=serializer.validated_data["client_message_id"],
                defaults={"body": serializer.validated_data["body"], "is_private": serializer.validated_data["is_private"]},
            )
            if not created:
                existing_recipient_ids = set(message.recipients.values_list("id", flat=True))
                requested_recipient_ids = {recipient.id for recipient in recipients}
                if (
                    message.body != serializer.validated_data["body"]
                    or message.is_private != serializer.validated_data["is_private"]
                    or existing_recipient_ids != requested_recipient_ids
                ):
                    raise ClientMessageIdConflict()
            if created and recipients:
                message.recipients.set(recipients)
            if created and message.is_private:
                AuditLog.objects.create(
                    user=request.user,
                    case=case,
                    action_type=AuditLog.ActionType.CREATE,
                    target_table="case_chat_messages",
                    target_id=message.id,
                    metadata={
                        "event": "PRIVATE_CASE_CHAT_MESSAGE_CREATED",
                        "visibility": "PRIVATE",
                        "recipient_count": len(recipients),
                    },
                )
                transaction.on_commit(lambda: create_in_app_staff_notifications(
                    recipients=recipients,
                    case=case,
                    notification_type="CASE_CHAT",
                    title="개인 Case 메시지",
                    message=f"{request.user.name}님이 개인 메시지를 보냈습니다.",
                    payload={"chat_message_id": str(message.id), "is_private": True},
                ))

        message = CaseChatMessage.objects.select_related(
            "sender__department_role__department"
        ).prefetch_related("recipients").get(id=message.id)
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
        return Response({"allowed": True, "case_id": case.id, "user_id": str(request.user.id)})
