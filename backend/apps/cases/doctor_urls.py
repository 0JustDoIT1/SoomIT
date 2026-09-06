from django.urls import path

from .views import DoctorLungCancerCaseListAPIView


urlpatterns = [
    path(
        "",
        DoctorLungCancerCaseListAPIView.as_view(),
        name="doctor-case-list",
    ),
]