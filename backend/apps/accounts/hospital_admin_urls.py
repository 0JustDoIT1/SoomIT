from django.urls import path

from .hospital_admin_views import (
    HospitalAdminDepartmentListAPIView,
    HospitalAdminStaffListCreateAPIView,
)


app_name = "hospital-admin"

urlpatterns = [
    path("departments/", HospitalAdminDepartmentListAPIView.as_view(), name="department-list"),
    path("staff/", HospitalAdminStaffListCreateAPIView.as_view(), name="staff-list-create"),
]
