from unittest.mock import patch
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Hospital
from apps.cases.models import LungCancerCase, WorkflowStage
from apps.clinical.models import (
    ClinicalResult,
    XrayResult,
    CtResult,
    Nodule,
    NoduleObservation,
    TnmResult,
    PathologyResult,
    GeneResult,
    PDL1Result,
)
from apps.patients.models import Patient, PatientAccount
from apps.patients.patient_tokens import issue_patient_tokens


class PatientClinicalResultAPITests(APITestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(
            name="환자 검사 결과 테스트 병원",
            code="PATIENT-RESULT-TEST",
        )
        self.patient = self._create_patient(
            code="RESULT001",
            phone_hash="result-patient-1",
        )
        self.other_patient = self._create_patient(
            code="RESULT002",
            phone_hash="result-patient-2",
        )
        self.account = PatientAccount.objects.create(
            patient=self.patient,
            phone_number="01010000001",
            phone_number_hash="result-account-1",
            phone_verified_at=timezone.now(),
            link_status=PatientAccount.LinkStatus.LINKED,
        )
        self.access_token = issue_patient_tokens(
            self.account
        )["access"]

    def _create_patient(self, *, code, phone_hash):
        return Patient.objects.create(
            hospital=self.hospital,
            patient_code=code,
            name=f"검사 결과 환자 {code}",
            birth_date="1980-01-01",
            sex=Patient.Sex.UNKNOWN,
            phone_number="01000000000",
            phone_number_hash=phone_hash,
        )

    def _create_case(self, *, patient, code):
        return LungCancerCase.objects.create(
            patient=patient,
            case_code=code,
            current_stage=WorkflowStage.XRAY,
        )

    def test_authentication_is_required(self):
        response = self.client.get(
            "/api/clinical/results/",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_returns_only_confirmed_results_for_logged_in_patient(self):
        own_case = self._create_case(
            patient=self.patient,
            code="RESULT-CASE-OWN",
        )
        other_case = self._create_case(
            patient=self.other_patient,
            code="RESULT-CASE-OTHER",
        )

        own_confirmed = ClinicalResult.objects.create(
            case=own_case,
            workflow_stage=WorkflowStage.XRAY,
            result_status=(
                ClinicalResult.ResultStatus.CONFIRMED
            ),
            confirmed_at=timezone.now(),
        )
        XrayResult.objects.create(
            clinical_result=own_confirmed,
            assessment=XrayResult.Assessment.NEGATIVE,
            finding_summary="특이 소견이 없습니다.",
            recommended_action=(
                XrayResult.RecommendedAction.NO_FURTHER_ACTION
            ),
        )

        ClinicalResult.objects.create(
            case=own_case,
            workflow_stage=WorkflowStage.CT,
            result_status=ClinicalResult.ResultStatus.DRAFT,
        )
        ClinicalResult.objects.create(
            case=other_case,
            workflow_stage=WorkflowStage.XRAY,
            result_status=(
                ClinicalResult.ResultStatus.CONFIRMED
            ),
            confirmed_at=timezone.now(),
        )

        self.client.credentials(
            HTTP_AUTHORIZATION=(
                f"Bearer {self.access_token}"
            ),
        )

        response = self.client.get(
            "/api/clinical/results/",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(len(response.data), 1)

        item = response.data[0]

        self.assertEqual(
            item["id"],
            str(own_confirmed.id),
        )
        self.assertEqual(
            item["workflow_stage"],
            WorkflowStage.XRAY,
        )
        self.assertEqual(
            item["result_status"],
            ClinicalResult.ResultStatus.CONFIRMED,
        )
        self.assertEqual(
            item["exam_name"],
            "흉부 X-ray 검사",
        )
        self.assertEqual(
            item["result_summary"],
            "음성",
        )
        self.assertIn("result_date", item)
        self.assertNotIn("exam_type", item)

    def test_returns_patient_safe_summaries_for_all_result_types(self):
        case = self._create_case(
            patient=self.patient,
            code="RESULT-CASE-ALL-TYPES",
        )

        ct = ClinicalResult.objects.create(
            case=case,
            workflow_stage=WorkflowStage.CT,
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
            confirmed_at=timezone.now(),
        )
        ct_detail = CtResult.objects.create(
            clinical_result=ct,
            overall_assessment=CtResult.OverallAssessment.NODULE_DETECTED,
            overall_malignancy_risk=87.50,
            finding_summary="추가 확인이 필요한 결절 소견이 있습니다.",
        )
        nodule = Nodule.objects.create(case=case, nodule_no=1)
        NoduleObservation.objects.create(
            nodule=nodule,
            ct_result=ct_detail,
            lobe=NoduleObservation.Lobe.RUL,
            max_diameter_mm=12.4,
            volume_mm3=486.2,
            surface_area_mm2=331.7,
            sphericity=0.8421,
            spiculation=NoduleObservation.PresenceFlag.PRESENT,
            lobulation=NoduleObservation.PresenceFlag.ABSENT,
            malignancy_risk=87.5,
        )

        pet = ClinicalResult.objects.create(
            case=case,
            workflow_stage=WorkflowStage.PET_CT_TNM,
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
            confirmed_at=timezone.now(),
        )
        TnmResult.objects.create(
            clinical_result=pet,
            t_category="T1",
            n_category="N0",
            m_category="M0",
            stage_group="IA",
        )

        pathology = ClinicalResult.objects.create(
            case=case,
            workflow_stage=WorkflowStage.PATHOLOGY_GENE,
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
            confirmed_at=timezone.now(),
        )
        PathologyResult.objects.create(
            clinical_result=pathology,
            malignancy_status=PathologyResult.MalignancyStatus.MALIGNANT,
            histologic_type="Adenocarcinoma",
            subtype="LUAD",
            diagnosis_summary="조직검사 결과가 확인되었습니다.",
        )
        GeneResult.objects.create(
            clinical_result=pathology,
            interpretation="유전자 검사 결과가 확인되었습니다.",
            additional_test_recommended=False,
        )

        pdl1 = ClinicalResult.objects.create(
            case=case,
            workflow_stage=WorkflowStage.PDL1,
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
            confirmed_at=timezone.now(),
        )
        PDL1Result.objects.create(
            clinical_result=pdl1,
            tps_percent=35,
            interpretation="PD-L1 검사 결과가 확인되었습니다.",
        )

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {self.access_token}",
        )

        response = self.client.get(
            "/api/clinical/results/",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        by_stage = {
            item["workflow_stage"]: item
            for item in response.data
        }

        self.assertEqual(
            by_stage[WorkflowStage.CT]["exam_name"],
            "흉부 CT 검사",
        )
        self.assertEqual(
            by_stage[WorkflowStage.PET_CT_TNM]["exam_name"],
            "PET-CT 및 TNM 병기 평가",
        )
        self.assertEqual(
            by_stage[WorkflowStage.PATHOLOGY_GENE]["exam_name"],
            "조직·유전자 검사",
        )
        self.assertEqual(
            by_stage[WorkflowStage.PDL1]["exam_name"],
            "PD-L1 검사",
        )

        ct_sections = by_stage[WorkflowStage.CT]["result_sections"]
        self.assertEqual(
            [section["type"] for section in ct_sections],
            [
                "CT_ASSESSMENT",
                "CT_MALIGNANCY_RISK",
                "CT_NODULE_COUNT",
                "CT_NODULE_1_LOCATION",
                "CT_NODULE_1_SIZE",
                "CT_NODULE_1_VOLUME",
                "CT_NODULE_1_SURFACE_AREA",
                "CT_NODULE_1_SPHERICITY",
                "CT_NODULE_1_SPICULATION",
                "CT_NODULE_1_LOBULATION",
                "CT_NODULE_1_MALIGNANCY_RISK",
                "CT_NODULE_1_TRACKING_STATUS",
            ],
        )

        pathology_sections = (
            by_stage[WorkflowStage.PATHOLOGY_GENE]["result_sections"]
        )
        self.assertEqual(
            [section["type"] for section in pathology_sections],
            ["PATHOLOGY_MALIGNANCY", "PATHOLOGY_HISTOLOGY", "PATHOLOGY_SUBTYPE"],
        )

        pdl1_sections = (
            by_stage[WorkflowStage.PDL1]["result_sections"]
        )
        self.assertEqual(
            [section["type"] for section in pdl1_sections],
            ["PDL1_TPS"],
        )

        # 환자용 API에는 내부 위험도와 PD-L1 TPS 원수치를
        # 별도 필드로 직접 노출하지 않는다.
        for item in response.data:
            self.assertNotIn(
                "overall_malignancy_risk",
                item,
            )
            self.assertNotIn(
                "tps_percent",
                item,
            )

    def test_confirmed_result_triggers_patient_push_once(self):
        case = self._create_case(
            patient=self.patient,
            code="RESULT-NOTIFY",
        )
        result = ClinicalResult.objects.create(
            case=case,
            workflow_stage=WorkflowStage.CT,
            result_status=ClinicalResult.ResultStatus.DRAFT,
        )

        with patch(
            "apps.notifications.signals.send_patient_push"
        ) as mocked_push:
            with self.captureOnCommitCallbacks(execute=True):
                result.result_status = (
                    ClinicalResult.ResultStatus.CONFIRMED
                )
                result.confirmed_at = timezone.now()
                result.save()

            mocked_push.assert_called_once()

            with self.captureOnCommitCallbacks(execute=True):
                result.save()

            mocked_push.assert_called_once()

    def test_unlinked_patient_account_is_forbidden(self):
        account = PatientAccount.objects.create(
            phone_number="01010000003",
            phone_number_hash="result-unlinked-account",
            link_status=PatientAccount.LinkStatus.UNLINKED,
        )
        access_token = issue_patient_tokens(account)["access"]

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {access_token}",
        )

        response = self.client.get(
            "/api/clinical/results/",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
        )
