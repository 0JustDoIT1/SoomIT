from django.urls import path

from .views import (
    RadiologyAnalysisDetailAPIView,
    RadiologyAnalysisResultAPIView,
    RadiologyAnalysisSubmitForReviewAPIView,
    RadiologyCaseWorkflowAPIView,
    RadiologyCaseWorklistAPIView,
    RadiologyOrderAnalysisCreateAPIView,
    RadiologyOrderCtSeriesUploadAPIView,
    RadiologyOrderImageCreateAPIView,
    RadiologyOrderXrayImageContentAPIView,
    RadiologyOrderXrayImageUploadAPIView,
    RadiologyWorklistAPIView,
)


app_name = "radiology"

urlpatterns = [
    path("worklist/", RadiologyWorklistAPIView.as_view(), name="worklist"),
    path("cases/", RadiologyCaseWorklistAPIView.as_view(), name="case-worklist"),
    path(
        "cases/<uuid:case_id>/workflow/",
        RadiologyCaseWorkflowAPIView.as_view(),
        name="case-workflow",
    ),
    path(
        "orders/<uuid:order_id>/images/",
        RadiologyOrderImageCreateAPIView.as_view(),
        name="order-image-create",
    ),
    path(
        "orders/<uuid:order_id>/images/upload/",
        RadiologyOrderXrayImageUploadAPIView.as_view(),
        name="order-xray-image-upload",
    ),
    path(
        "orders/<uuid:order_id>/images/ct-series/upload/",
        RadiologyOrderCtSeriesUploadAPIView.as_view(),
        name="order-ct-series-upload",
    ),
    path(
        "orders/<uuid:order_id>/images/<uuid:asset_id>/content/",
        RadiologyOrderXrayImageContentAPIView.as_view(),
        name="order-xray-image-content",
    ),
    path(
        "orders/<uuid:order_id>/analyses/",
        RadiologyOrderAnalysisCreateAPIView.as_view(),
        name="order-analysis-create",
    ),
    path(
        "analyses/<uuid:analysis_id>/",
        RadiologyAnalysisDetailAPIView.as_view(),
        name="analysis-detail",
    ),
    path(
        "analyses/<uuid:analysis_id>/result/",
        RadiologyAnalysisResultAPIView.as_view(),
        name="analysis-result",
    ),
    path(
        "analyses/<uuid:analysis_id>/submit-for-review/",
        RadiologyAnalysisSubmitForReviewAPIView.as_view(),
        name="analysis-submit-for-review",
    ),
]
