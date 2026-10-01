from django.urls import path

from .views import MyNotificationListAPIView, MyNotificationSettingAPIView, StaffNotificationReadAllAPIView, StaffNotificationReadAPIView


urlpatterns = [
    path("me/", MyNotificationListAPIView.as_view(), name="staff-notification-list"),
    path("me/read-all/", StaffNotificationReadAllAPIView.as_view(), name="staff-notification-read-all"),
    path("me/<uuid:notification_id>/read/", StaffNotificationReadAPIView.as_view(), name="staff-notification-read"),
    path("me/settings/", MyNotificationSettingAPIView.as_view(), name="staff-notification-settings"),
]
