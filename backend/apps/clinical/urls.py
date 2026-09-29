from django.urls import path

from .views import DoctorDrugOptionListAPIView, PatientClinicalResultListAPIView


urlpatterns = [
    path("drug-options/", DoctorDrugOptionListAPIView.as_view(), name="doctor-drug-options"),
    # Flutter 환자 앱 - 검사 결과 목록
    path(
        "results/",
        PatientClinicalResultListAPIView.as_view(),
        name="patient-clinical-result-list",
    ),
]
