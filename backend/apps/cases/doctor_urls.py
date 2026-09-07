from django.urls import path

from apps.ai_results.views import DoctorAiAnalysisListAPIView
from apps.clinical.views import (
    DoctorClinicalResultListAPIView,
    DoctorTreatmentDecisionAPIView,
    DoctorTreatmentDecisionConfirmAPIView,
)

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
    path(
        "<uuid:case_id>/ai-results/",
        DoctorAiAnalysisListAPIView.as_view(),
        name="doctor-ai-result-list",
    ),
    path(
        "<uuid:case_id>/treatment-decision/",
        DoctorTreatmentDecisionAPIView.as_view(),
        name="doctor-treatment-decision",
    ),
    path(
        "<uuid:case_id>/treatment-decision/confirm/",
        DoctorTreatmentDecisionConfirmAPIView.as_view(),
        name="doctor-treatment-decision-confirm",
    ),
]