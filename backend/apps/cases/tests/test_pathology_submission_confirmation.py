from datetime import date

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.cases.models import ExaminationOrder, LungCancerCase, WorkflowStage
from apps.clinical.models import ClinicalResult, GeneFinding, GeneResult, PathologyResult
from apps.pathology.models import PathologyWorkItem
from apps.patients.models import Patient


class DoctorPathologySubmissionConfirmationTests(TestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(name="Workflow Hospital", code="WF-HOSP")
        pulmonology = Department.objects.create(
            hospital=self.hospital,
            code="PULMONOLOGY",
            name="Pulmonology",
        )
        pulmonology_role = DepartmentRole.objects.create(
            department=pulmonology,
            role=DepartmentRole.Role.DOCTOR,
            display_name="Pulmonologist",
        )
        self.doctor = User.objects.create_user(
            login_id="pathology-review-doctor",
            password="test",
            name="Review Doctor",
            department_role=pulmonology_role,
            account_status=User.AccountStatus.ACTIVE,
        )
        patient = Patient.objects.create(
            hospital=self.hospital,
            patient_code="PATH-REVIEW-001",
            name="Patient",
            birth_date=date(1970, 1, 1),
            sex=Patient.Sex.FEMALE,
            phone_number="010-0000-0000",
            phone_number_hash="path-review-patient",
        )
        self.case = LungCancerCase.objects.create(
            patient=patient,
            case_code="PATH-REVIEW-CASE",
            primary_doctor=self.doctor,
            current_stage=WorkflowStage.PATHOLOGY_GENE,
        )
        self.order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PATHOLOGY_GENE,
            requesting_doctor=self.doctor,
            purpose="Pathology review",
        )
        self.result = ClinicalResult.objects.create(
            case=self.case,
            examination_order=self.order,
            workflow_stage=WorkflowStage.PATHOLOGY_GENE,
            result_status=ClinicalResult.ResultStatus.DRAFT,
        )
        PathologyResult.objects.create(
            clinical_result=self.result,
            malignancy_status=PathologyResult.MalignancyStatus.MALIGNANT,
            histologic_type="NSCLC",
            subtype="LUAD",
        )
        self.client = self._client_for(self.doctor, pulmonology, pulmonology_role)

    @staticmethod
    def _client_for(user, department, role):
        token = RefreshToken.for_user(user)
        token["hospital_id"] = str(department.hospital_id)
        token["department_id"] = str(department.id)
        token["department_code"] = department.code
        token["role"] = role.role
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        return client

    def _submit(self):
        return PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=self.order,
            task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
            status=PathologyWorkItem.Status.PENDING,
        )

    def _confirm_url(self):
        return reverse(
            "doctor-submitted-pathology-result-confirm",
            kwargs={"case_id": self.case.id, "result_id": self.result.id},
        )

    def _add_gene_findings(self):
        gene_result = GeneResult.objects.create(
            clinical_result=self.result,
            interpretation="Pathology-delivered molecular findings",
        )
        GeneFinding.objects.create(
            gene_result=gene_result,
            gene_symbol="EGFR",
            assessment=GeneFinding.Assessment.LIKELY_POSITIVE,
        )
        GeneFinding.objects.create(
            gene_result=gene_result,
            gene_symbol="BRAF",
            assessment=GeneFinding.Assessment.LIKELY_NEGATIVE,
        )
        return gene_result

    def test_unsubmitted_draft_is_hidden_and_cannot_be_confirmed(self):
        list_response = self.client.get(
            reverse("doctor-clinical-result-list", kwargs={"case_id": self.case.id})
        )
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.data, [])

        response = self.client.post(self._confirm_url(), format="json")
        self.assertEqual(response.status_code, 400)
        self.result.refresh_from_db()
        self.assertEqual(self.result.result_status, ClinicalResult.ResultStatus.DRAFT)

    def test_submitted_draft_is_visible_and_pulmonology_can_confirm_it(self):
        review = self._submit()

        list_response = self.client.get(
            reverse("doctor-clinical-result-list", kwargs={"case_id": self.case.id})
        )
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.data[0]["result_status"], "DRAFT")

        response = self.client.post(self._confirm_url(), format="json")
        self.assertEqual(response.status_code, 200)
        self.result.refresh_from_db()
        review.refresh_from_db()
        self.assertEqual(self.result.result_status, ClinicalResult.ResultStatus.CONFIRMED)
        self.assertEqual(self.result.confirmed_by_user, self.doctor)
        self.assertEqual(review.status, PathologyWorkItem.Status.COMPLETED)

    def test_duplicate_confirmation_is_rejected_without_new_result(self):
        self._submit()
        self.assertEqual(self.client.post(self._confirm_url(), format="json").status_code, 200)
        self.assertEqual(self.client.post(self._confirm_url(), format="json").status_code, 409)
        self.assertEqual(
            ClinicalResult.objects.filter(case=self.case, workflow_stage=WorkflowStage.PATHOLOGY_GENE).count(),
            1,
        )

    def test_pulmonology_can_save_gene_review_as_draft_with_canonical_alteration(self):
        gene_result = self._add_gene_findings()
        self._submit()

        response = self.client.patch(
            self._confirm_url(),
            {
                "gene_findings": [
                    {
                        "gene_symbol": "EGFR",
                        "assessment": "LIKELY_POSITIVE",
                        "alteration_code": "Exon 19 deletion",
                    },
                    {
                        "gene_symbol": "BRAF",
                        "assessment": "LIKELY_NEGATIVE",
                        "alteration_code": None,
                    },
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.result.refresh_from_db()
        egfr = gene_result.gene_findings.get(gene_symbol="EGFR")
        self.assertEqual(self.result.result_status, ClinicalResult.ResultStatus.DRAFT)
        self.assertEqual(egfr.alteration_code, "EGFR_EX19_DEL")
        response_findings = {
            finding["gene_symbol"]: finding
            for finding in response.data["result_detail"]["gene"]["findings"]
        }
        self.assertEqual(response_findings["EGFR"]["alteration_code"], "EGFR_EX19_DEL")

    def test_pulmonology_can_confirm_gene_review_and_it_becomes_read_only(self):
        gene_result = self._add_gene_findings()
        self._submit()

        response = self.client.post(
            self._confirm_url(),
            {
                "gene_findings": [
                    {
                        "gene_symbol": "EGFR",
                        "assessment": "LIKELY_POSITIVE",
                        "alteration_code": "L858R",
                    },
                    {
                        "gene_symbol": "BRAF",
                        "assessment": "LIKELY_NEGATIVE",
                        "alteration_code": None,
                    },
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.result.refresh_from_db()
        self.assertEqual(self.result.result_status, ClinicalResult.ResultStatus.CONFIRMED)
        self.assertEqual(
            gene_result.gene_findings.get(gene_symbol="EGFR").alteration_code,
            "EGFR_L858R",
        )
        self.assertEqual(
            self.client.patch(
                self._confirm_url(),
                {"gene_findings": []},
                format="json",
            ).status_code,
            409,
        )

    def test_gene_review_rejects_alteration_for_negative_assessment_without_mutation(self):
        gene_result = self._add_gene_findings()
        self._submit()

        response = self.client.patch(
            self._confirm_url(),
            {
                "gene_findings": [
                    {
                        "gene_symbol": "EGFR",
                        "assessment": "LIKELY_NEGATIVE",
                        "alteration_code": "L858R",
                    },
                    {
                        "gene_symbol": "BRAF",
                        "assessment": "LIKELY_NEGATIVE",
                        "alteration_code": None,
                    },
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        egfr = gene_result.gene_findings.get(gene_symbol="EGFR")
        self.assertEqual(egfr.assessment, GeneFinding.Assessment.LIKELY_POSITIVE)
        self.assertIsNone(egfr.alteration_code)

    def test_non_pulmonology_doctor_cannot_confirm(self):
        self._submit()
        other_department = Department.objects.create(
            hospital=self.hospital,
            code="CARDIOLOGY",
            name="Cardiology",
        )
        other_role = DepartmentRole.objects.create(
            department=other_department,
            role=DepartmentRole.Role.DOCTOR,
            display_name="Cardiologist",
        )
        other_doctor = User.objects.create_user(
            login_id="other-review-doctor",
            password="test",
            name="Other Doctor",
            department_role=other_role,
            account_status=User.AccountStatus.ACTIVE,
        )
        other_client = self._client_for(other_doctor, other_department, other_role)

        response = other_client.post(self._confirm_url(), format="json")
        self.assertEqual(response.status_code, 403)
        self.result.refresh_from_db()
        self.assertEqual(self.result.result_status, ClinicalResult.ResultStatus.DRAFT)

    def test_result_from_a_future_stage_cannot_be_confirmed(self):
        self._submit()
        self.case.current_stage = WorkflowStage.PDL1
        self.case.save(update_fields=["current_stage", "updated_at"])

        response = self.client.post(self._confirm_url(), format="json")
        self.assertEqual(response.status_code, 400)
        self.result.refresh_from_db()
        self.assertEqual(self.result.result_status, ClinicalResult.ResultStatus.DRAFT)

    def test_submitted_pdl1_draft_confirms_and_advances_to_treatment(self):
        order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PDL1,
            requesting_doctor=self.doctor,
            purpose="PD-L1 review",
        )
        result = ClinicalResult.objects.create(
            case=self.case,
            examination_order=order,
            workflow_stage=WorkflowStage.PDL1,
            result_status=ClinicalResult.ResultStatus.DRAFT,
        )
        review = PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=order,
            task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
            status=PathologyWorkItem.Status.PENDING,
        )
        self.case.current_stage = WorkflowStage.PDL1
        self.case.save(update_fields=["current_stage", "updated_at"])

        confirm = self.client.post(
            reverse(
                "doctor-submitted-pathology-result-confirm",
                kwargs={"case_id": self.case.id, "result_id": result.id},
            ),
            format="json",
        )
        self.assertEqual(confirm.status_code, 200)
        result.refresh_from_db()
        review.refresh_from_db()
        self.assertEqual(result.result_status, ClinicalResult.ResultStatus.CONFIRMED)
        self.assertEqual(review.status, PathologyWorkItem.Status.COMPLETED)

        advance = self.client.post(
            reverse("doctor-case-workflow-decision", kwargs={"case_id": self.case.id}),
            {
                "action": "PROCEED_NEXT_STAGE",
                "source_clinical_result_id": str(result.id),
                "target_stage": WorkflowStage.TREATMENT,
            },
            format="json",
        )
        self.assertEqual(advance.status_code, 200)
        self.case.refresh_from_db()
        self.assertEqual(self.case.current_stage, WorkflowStage.TREATMENT)
