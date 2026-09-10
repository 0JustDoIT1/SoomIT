from django.urls import path

from .system_admin_views import (
    SystemAdminHospitalAdminCreateAPIView,
    SystemAdminHospitalCreateAPIView,
    SystemAdminHospitalDetailAPIView,
)


app_name = "system-admin"

urlpatterns = [
    path("hospitals/", SystemAdminHospitalCreateAPIView.as_view(), name="hospital-create"),
    path(
        "hospitals/<uuid:hospital_id>/",
        SystemAdminHospitalDetailAPIView.as_view(),
        name="hospital-detail",
    ),
    path(
        "hospital-admins/",
        SystemAdminHospitalAdminCreateAPIView.as_view(),
        name="hospital-admin-create",
    ),
]
