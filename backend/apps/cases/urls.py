from django.urls import path

from .views import (
    LungCancerCaseDetailAPIView,
    LungCancerCaseListAPIView,
)


urlpatterns = [
    path("", LungCancerCaseListAPIView.as_view(), name="case-list"),
    path(
        "<uuid:id>/",
        LungCancerCaseDetailAPIView.as_view(),
        name="case-detail",
    ),
]