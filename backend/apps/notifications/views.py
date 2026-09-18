from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import NotificationLog
from .models import UserNotificationSetting
from .serializers import StaffNotificationSerializer, StaffNotificationSettingSerializer


class StaffNotificationAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return NotificationLog.objects.filter(
            recipient_user=self.request.user,
            channel=NotificationLog.Channel.IN_APP,
        ).select_related("case").order_by("-created_at")


class MyNotificationListAPIView(StaffNotificationAPIView):
    def get(self, request):
        try:
            limit = min(max(int(request.query_params.get("limit", 30)), 1), 100)
        except ValueError:
            return Response({"detail": "limit must be an integer."}, status=400)
        queryset = self.get_queryset()
        return Response({
            "unread_count": queryset.filter(read_at__isnull=True).count(),
            "results": StaffNotificationSerializer(queryset[:limit], many=True).data,
        })


class StaffNotificationReadAPIView(StaffNotificationAPIView):
    def patch(self, request, notification_id):
        notification = self.get_queryset().filter(id=notification_id).first()
        if notification is None:
            return Response({"detail": "알림을 찾을 수 없습니다."}, status=404)
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=["read_at"])
        return Response(StaffNotificationSerializer(notification).data)


class MyNotificationSettingAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        notification_type = request.query_params.get("notification_type", "EXAMINATION_ORDER")
        if notification_type not in {"EXAMINATION_ORDER", "CASE_CHAT"}:
            return Response({"detail": "지원하지 않는 알림 유형입니다."}, status=400)
        setting = UserNotificationSetting.objects.filter(
            user=request.user,
            notification_type=notification_type,
        ).first()
        return Response({
            "notification_type": notification_type,
            "enabled": setting.enabled if setting else True,
        })

    def patch(self, request):
        serializer = StaffNotificationSettingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        setting, _ = UserNotificationSetting.objects.update_or_create(
            user=request.user,
            notification_type=serializer.validated_data["notification_type"],
            defaults={"enabled": serializer.validated_data["enabled"]},
        )
        return Response({
            "notification_type": setting.notification_type,
            "enabled": setting.enabled,
        })
