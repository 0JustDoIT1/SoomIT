from django.urls import path

from .views import (
    CasePathologyAiAnalysisListAPIView,
    CasePathologySpecimenListAPIView,
    CaseSpecimenAdequacyAiAnalysisListAPIView,
    PathologyWorkItemDetailAPIView,
    PathologyWorkItemListAPIView,
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
        "specimens/<uuid:specimen_id>/wsis/",
        SpecimenWholeSlideImageListAPIView.as_view(),
        name="specimen-wsi-list",
    ),
]
