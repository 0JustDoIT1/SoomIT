from django.urls import path

from .views import (
    StaffLoginAPIView,
    StaffProfileAPIView,
    StaffTokenRefreshAPIView,
)


app_name = "accounts"

urlpatterns = [
    path("staff/login/", StaffLoginAPIView.as_view(), name="staff-login"),
    path("staff/profile/", StaffProfileAPIView.as_view(), name="staff-profile"),
    path(
        "staff/token/refresh/",
        StaffTokenRefreshAPIView.as_view(),
        name="staff-token-refresh",
    ),
]
