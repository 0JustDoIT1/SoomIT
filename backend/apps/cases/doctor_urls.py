from django.urls import path

from apps.ai_results.views import DoctorAiAnalysisListAPIView
from apps.clinical.views import (
    DoctorClinicalResultListAPIView,
    DoctorPrescriptionAPIView,
    DoctorPrescriptionFinalizeAPIView,
    DoctorPrescriptionItemUpdateAPIView,
    DoctorSafetyWarningAcknowledgeAPIView,
    DoctorTreatmentDecisionAPIView,
    DoctorTreatmentDecisionConfirmAPIView,
)

from .views import (
    DoctorLungCancerCaseDetailAPIView,
    DoctorLungCancerCaseListAPIView,
)

from apps.patients.views import (
    DoctorCurrentMedicationListCreateAPIView,
    DoctorLabResultListCreateAPIView,
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
    path(
        "<uuid:case_id>/prescriptions/",
        DoctorPrescriptionAPIView.as_view(),
        name="doctor-prescription-list-create",
    ),
    path(
        "<uuid:case_id>/prescriptions/<uuid:prescription_id>/finalize/",
        DoctorPrescriptionFinalizeAPIView.as_view(),
        name="doctor-prescription-finalize",
    ),
    path(
        "<uuid:case_id>/prescriptions/<uuid:prescription_id>/warnings/acknowledge/",
        DoctorSafetyWarningAcknowledgeAPIView.as_view(),
        name="doctor-prescription-warning-acknowledge",
    ),
    path(
        "<uuid:case_id>/prescriptions/<uuid:prescription_id>/items/<uuid:item_id>/",
        DoctorPrescriptionItemUpdateAPIView.as_view(),
        name="doctor-prescription-item-update",
    ),
    path(
    "<uuid:case_id>/current-medications/",
    DoctorCurrentMedicationListCreateAPIView.as_view(),
    name="doctor-current-medication-list-create",
    ),
    path(
        "<uuid:case_id>/lab-results/",
        DoctorLabResultListCreateAPIView.as_view(),
        name="doctor-lab-result-list-create",
    ),
]