from django.urls import path

from .views import MyNotificationListAPIView, MyNotificationSettingAPIView, StaffNotificationReadAPIView


urlpatterns = [
    path("me/", MyNotificationListAPIView.as_view(), name="staff-notification-list"),
    path("me/<uuid:notification_id>/read/", StaffNotificationReadAPIView.as_view(), name="staff-notification-read"),
    path("me/settings/", MyNotificationSettingAPIView.as_view(), name="staff-notification-settings"),
]
