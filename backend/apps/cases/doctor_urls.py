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
    DoctorPrescriptionSafetyCheckAPIView,
    DoctorRegimenCandidateListAPIView,
)

from .views import (
    DoctorCaseImageAssetListAPIView,
    DoctorCaseImageAssetPreviewAPIView,
    DoctorCasePathologySpecimenListAPIView,
    DoctorSpecimenSlideListAPIView,
    DoctorSlideViewerAPIView,
    DoctorSlideThumbnailAPIView,
    DoctorSlideTileAPIView,
    DoctorCaseDicomWebMetadataAPIView,
    DoctorCaseDicomWebInstancesAPIView,
    DoctorCaseDicomWebInstanceAPIView,
    DoctorFollowUpPathologyOrderAPIView,
    DoctorExaminationOrderAPIView,
    DoctorMedicalOpinionAPIView,
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
        "<uuid:case_id>/image-assets/",
        DoctorCaseImageAssetListAPIView.as_view(),
        name="doctor-case-image-asset-list",
    ),
    path(
        "<uuid:case_id>/image-assets/<uuid:asset_id>/preview/",
        DoctorCaseImageAssetPreviewAPIView.as_view(),
        name="doctor-case-image-asset-preview",
    ),
    path("<uuid:case_id>/specimens/", DoctorCasePathologySpecimenListAPIView.as_view(), name="doctor-case-specimen-list"),
    path("specimens/<uuid:specimen_id>/slides/", DoctorSpecimenSlideListAPIView.as_view(), name="doctor-specimen-slide-list"),
    path("slides/<uuid:slide_id>/viewer/", DoctorSlideViewerAPIView.as_view(), name="doctor-slide-viewer"),
    path("slides/<uuid:slide_id>/thumbnail/", DoctorSlideThumbnailAPIView.as_view(), name="doctor-slide-thumbnail"),
    path("slides/<uuid:slide_id>/tiles/<int:level>/<int:x>/<int:y>.jpg", DoctorSlideTileAPIView.as_view(), name="doctor-slide-tile"),
    path("<uuid:case_id>/image-assets/<uuid:asset_id>/dicom-web/metadata/", DoctorCaseDicomWebMetadataAPIView.as_view(), name="doctor-case-dicom-web-metadata"),
    path("<uuid:case_id>/image-assets/<uuid:asset_id>/dicom-web/instances/", DoctorCaseDicomWebInstancesAPIView.as_view(), name="doctor-case-dicom-web-instances"),
    path("<uuid:case_id>/image-assets/<uuid:asset_id>/dicom-web/instances/<str:sop_instance_uid>/", DoctorCaseDicomWebInstanceAPIView.as_view(), name="doctor-case-dicom-web-instance"),
    path(
        "<uuid:case_id>/medical-opinion/",
        DoctorMedicalOpinionAPIView.as_view(),
        name="doctor-medical-opinion",
    ),
    path(
        "<uuid:case_id>/pathology-orders/",
        DoctorFollowUpPathologyOrderAPIView.as_view(),
        name="doctor-follow-up-pathology-order",
    ),
    path(
        "<uuid:case_id>/orders/",
        DoctorExaminationOrderAPIView.as_view(),
        name="doctor-examination-order-list-create",
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
    path(
    "<uuid:case_id>/prescriptions/<uuid:prescription_id>/safety-check/",
    DoctorPrescriptionSafetyCheckAPIView.as_view(),
    name="doctor-prescription-safety-check",
    ),
    path("<uuid:case_id>/regimen-candidates/", DoctorRegimenCandidateListAPIView.as_view(), name="doctor-regimen-candidates"),
]
