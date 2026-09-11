from django.urls import path

from .views import (
    RadiologyAnalysisDetailAPIView,
    RadiologyAnalysisResultAPIView,
    RadiologyOrderAnalysisCreateAPIView,
    RadiologyOrderImageCreateAPIView,
    RadiologyWorklistAPIView,
)


app_name = "radiology"

urlpatterns = [
    path("worklist/", RadiologyWorklistAPIView.as_view(), name="worklist"),
    path(
        "orders/<uuid:order_id>/images/",
        RadiologyOrderImageCreateAPIView.as_view(),
        name="order-image-create",
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
]
