from django.urls import path

from .hospital_admin_views import (
    HospitalAdminDepartmentListAPIView,
    HospitalAdminMonitoringAPIView,
    HospitalAdminStaffDestroyAPIView,
    HospitalAdminStaffListCreateAPIView,
)


app_name = "hospital-admin"

urlpatterns = [
    path("departments/", HospitalAdminDepartmentListAPIView.as_view(), name="department-list"),
    path("staff/", HospitalAdminStaffListCreateAPIView.as_view(), name="staff-list-create"),
    path("staff/<uuid:staff_id>/", HospitalAdminStaffDestroyAPIView.as_view(), name="staff-destroy"),
    path("monitoring/", HospitalAdminMonitoringAPIView.as_view(), name="monitoring"),
]
