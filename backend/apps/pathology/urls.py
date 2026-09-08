from django.urls import path

from .views import (
    CasePathologyAiAnalysisListAPIView,
    CasePathologyDiagnosisListAPIView,
    CasePathologySpecimenListAPIView,
    CasePathologyReportListAPIView,
    CaseSpecimenAdequacyAiAnalysisListAPIView,
    PathologyWorkItemDetailAPIView,
    PathologyWorkItemListAPIView,
    PathologyDiagnosisConfirmAPIView,
    PathologyDiagnosisDetailAPIView,
    SpecimenWholeSlideImageListAPIView,
)

app_name = "pathology"

urlpatterns = [
    path(
        "work-items/",
        PathologyWorkItemListAPIView.as_view(),
        name="work-item-list",
    ),
    path(
        "work-items/<uuid:id>/",
        PathologyWorkItemDetailAPIView.as_view(),
        name="work-item-detail",
    ),
    path(
        "cases/<uuid:case_id>/specimens/",
        CasePathologySpecimenListAPIView.as_view(),
        name="case-specimen-list",
    ),
    path(
        "cases/<uuid:case_id>/ai-results/",
        CasePathologyAiAnalysisListAPIView.as_view(),
        name="case-ai-result-list",
    ),
    path(
        "cases/<uuid:case_id>/adequacy-results/",
        CaseSpecimenAdequacyAiAnalysisListAPIView.as_view(),
        name="case-adequacy-result-list",
    ),
    path(
        "cases/<uuid:case_id>/diagnoses/",
        CasePathologyDiagnosisListAPIView.as_view(),
        name="case-diagnosis-list",
    ),
    path(
        "cases/<uuid:case_id>/reports/",
        CasePathologyReportListAPIView.as_view(),
        name="case-report-list",
    ),
    path(
        "diagnoses/<uuid:diagnosis_id>/",
        PathologyDiagnosisDetailAPIView.as_view(),
        name="diagnosis-detail",
    ),
    path(
        "diagnoses/<uuid:diagnosis_id>/confirm/",
        PathologyDiagnosisConfirmAPIView.as_view(),
        name="diagnosis-confirm",
    ),
    path(
        "specimens/<uuid:specimen_id>/wsis/",
        SpecimenWholeSlideImageListAPIView.as_view(),
        name="specimen-wsi-list",
    ),
]
