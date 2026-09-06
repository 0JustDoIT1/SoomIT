from django.urls import path

from apps.clinical.views import DoctorClinicalResultListAPIView

from .views import (
    DoctorLungCancerCaseDetailAPIView,
    DoctorLungCancerCaseListAPIView,
)


urlpatterns = [
    path(
        "",
        DoctorLungCancerCaseListAPIView.as_view(),
        name="doctor-case-list",
    ),
    path(
        "<uuid:id>/",
        DoctorLungCancerCaseDetailAPIView.as_view(),
        name="doctor-case-detail",
    ),
    path(
        "<uuid:case_id>/clinical-results/",
        DoctorClinicalResultListAPIView.as_view(),
        name="doctor-clinical-result-list",
    ),
]