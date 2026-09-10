from django.urls import path

from .views import (
    StaffLoginAPIView,
    StaffProfileAPIView,
    StaffTokenRefreshAPIView,
)
from .system_admin_views import SystemAdminLoginAPIView
from .hospital_admin_views import HospitalAdminLoginAPIView


app_name = "accounts"

urlpatterns = [
    path(
        "hospital-admin/login/",
        HospitalAdminLoginAPIView.as_view(),
        name="hospital-admin-login",
    ),
    path(
        "system-admin/login/",
        SystemAdminLoginAPIView.as_view(),
        name="system-admin-login",
    ),
    path("staff/login/", StaffLoginAPIView.as_view(), name="staff-login"),
    path("staff/profile/", StaffProfileAPIView.as_view(), name="staff-profile"),
    path(
        "staff/token/refresh/",
        StaffTokenRefreshAPIView.as_view(),
        name="staff-token-refresh",
    ),
]
