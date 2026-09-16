from pathlib import Path

import firebase_admin
from django.conf import settings
from django.utils import timezone
from firebase_admin import credentials, messaging

from .models import (
    NotificationLog,
    PatientDeviceToken,
    PatientNotificationSetting,
)


def _get_firebase_app():
    try:
        return firebase_admin.get_app()
    except ValueError:
        credential_path = Path(
            settings.FIREBASE_CREDENTIALS_PATH
        )

        if not credential_path.is_file():
            raise RuntimeError(
                "Firebase 서비스 계정 파일을 찾을 수 없습니다."
            )

        credential = credentials.Certificate(
            str(credential_path)
        )

        return firebase_admin.initialize_app(credential)


def _normalize_payload(payload):
    if not payload:
        return {}

    return {
        str(key): "" if value is None else str(value)
        for key, value in payload.items()
    }


def send_patient_push(
    *,
    patient_account,
    notification_type,
    title,
    message,
    payload=None,
):
    notification_log = NotificationLog.objects.create(
        recipient_patient_account=patient_account,
        notification_type=notification_type,
        channel=NotificationLog.Channel.PUSH,
        title=title,
        message=message,
        payload=payload or {},
        delivery_status=(
            NotificationLog.DeliveryStatus.PENDING
        ),
    )

    disabled = PatientNotificationSetting.objects.filter(
        patient_account=patient_account,
        notification_type=notification_type,
        enabled=False,
    ).exists()

    if disabled:
        notification_log.delivery_status = (
            NotificationLog.DeliveryStatus.FAILED
        )
        notification_log.error_message = (
            "사용자가 해당 유형의 알림을 비활성화했습니다."
        )
        notification_log.save(
            update_fields=[
                "delivery_status",
                "error_message",
            ]
        )

        return {
            "success_count": 0,
            "failure_count": 0,
            "skipped": True,
        }

    device_tokens = list(
        PatientDeviceToken.objects.filter(
            patient_account=patient_account,
            is_active=True,
        )
    )

    if not device_tokens:
        notification_log.delivery_status = (
            NotificationLog.DeliveryStatus.FAILED
        )
        notification_log.error_message = (
            "활성화된 기기 토큰이 없습니다."
        )
        notification_log.save(
            update_fields=[
                "delivery_status",
                "error_message",
            ]
        )

        return {
            "success_count": 0,
            "failure_count": 0,
            "skipped": False,
        }

    firebase_app = _get_firebase_app()
    normalized_payload = _normalize_payload(payload)

    success_count = 0
    failure_count = 0

    for device_token in device_tokens:
        firebase_message = messaging.Message(
            token=device_token.token,
            notification=messaging.Notification(
                title=title,
                body=message,
            ),
            data=normalized_payload,
            android=messaging.AndroidConfig(
                priority="high",
                notification=messaging.AndroidNotification(
                    channel_id=(
                        "soomit_high_importance_channel"
                    ),
                    sound="default",
                ),
            ),
        )

        try:
            messaging.send(
                firebase_message,
                app=firebase_app,
            )
            success_count += 1
        except (
            messaging.UnregisteredError,
            messaging.SenderIdMismatchError,
        ):
            failure_count += 1
            device_token.is_active = False
            device_token.save(
                update_fields=[
                    "is_active",
                    "updated_at",
                ]
            )
        except Exception:
            failure_count += 1

    if success_count > 0:
        notification_log.delivery_status = (
            NotificationLog.DeliveryStatus.SENT
        )
        notification_log.sent_at = timezone.now()

        if failure_count > 0:
            notification_log.error_message = (
                f"{failure_count}개 기기 발송 실패"
            )
    else:
        notification_log.delivery_status = (
            NotificationLog.DeliveryStatus.FAILED
        )
        notification_log.error_message = (
            f"전체 {failure_count}개 기기 발송 실패"
        )

    notification_log.save(
        update_fields=[
            "delivery_status",
            "sent_at",
            "error_message",
        ]
    )

    return {
        "success_count": success_count,
        "failure_count": failure_count,
        "skipped": False,
    }