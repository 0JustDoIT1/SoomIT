from django.urls import path

from .views import (
    CasePathologySpecimenListAPIView,
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
        "specimens/<uuid:specimen_id>/wsis/",
        SpecimenWholeSlideImageListAPIView.as_view(),
        name="specimen-wsi-list",
    ),
]
