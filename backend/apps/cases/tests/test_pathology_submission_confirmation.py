from datetime import date

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.cases.models import ExaminationOrder, LungCancerCase, WorkflowStage
from apps.clinical.models import ClinicalResult, GeneFinding, GeneResult, PathologyResult, PDL1Result
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

    def test_gene_payload_without_gene_detail_returns_400_and_preserves_draft(self):
        response = self.client.post(reverse("doctor-submitted-pathology-result-confirm", kwargs={"case_id": self.case.id, "result_id": self.result.id}), {"gene_findings": []}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("gene_findings", response.data)
        self.result.refresh_from_db()
        self.assertEqual(self.result.result_status, ClinicalResult.ResultStatus.DRAFT)

    def _add_gene_findings(self, *, positive_gene="EGFR"):
        gene_result = GeneResult.objects.create(
            clinical_result=self.result,
            interpretation="Pathology-delivered molecular findings",
        )
        for gene_symbol in ("EGFR", "BRAF", "MET"):
            GeneFinding.objects.create(
                gene_result=gene_result,
                gene_symbol=gene_symbol,
                assessment=(
                    GeneFinding.Assessment.LIKELY_POSITIVE
                    if gene_symbol == positive_gene
                    else GeneFinding.Assessment.LIKELY_NEGATIVE
                ),
            )
        return gene_result

    @staticmethod
    def _review_payload(*, positive_gene="EGFR", alteration_code=None, assessment=None):
        return {
            "gene_findings": [
                {
                    "gene_symbol": gene_symbol,
                    "assessment": (
                        assessment
                        if gene_symbol == positive_gene and assessment is not None
                        else "LIKELY_POSITIVE"
                        if gene_symbol == positive_gene
                        else "LIKELY_NEGATIVE"
                    ),
                    "alteration_code": alteration_code if gene_symbol == positive_gene else None,
                }
                for gene_symbol in ("EGFR", "BRAF", "MET")
            ],
        }

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

    def test_failed_confirmation_does_not_persist_reviewed_gene_findings(self):
        gene = self._add_gene_findings()
        # Both a missing submission and a past-stage draft must remain unchanged.
        for current_stage in (WorkflowStage.PATHOLOGY_GENE, WorkflowStage.TREATMENT):
            with self.subTest(current_stage=current_stage):
                self.case.current_stage = current_stage
                self.case.save(update_fields=["current_stage"])
                response = self.client.post(
                    self._confirm_url(),
                    self._review_payload(alteration_code="EGFR_EX19_DEL"),
                    format="json",
                )
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIsNone(gene.gene_findings.get(gene_symbol="EGFR").alteration_code)
                self.result.refresh_from_db()
                self.assertEqual(self.result.result_status, "DRAFT")

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
                    {
                        "gene_symbol": "MET",
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
                    {
                        "gene_symbol": "MET",
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
                    {
                        "gene_symbol": "MET",
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

    def test_positive_actionable_gene_without_alteration_cannot_be_confirmed(self):
        self._add_gene_findings()
        review = self._submit()

        response = self.client.post(self._confirm_url(), format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("EGFR", str(response.data))
        self.result.refresh_from_db()
        review.refresh_from_db()
        self.assertEqual(self.result.result_status, ClinicalResult.ResultStatus.DRAFT)
        self.assertEqual(review.status, PathologyWorkItem.Status.PENDING)

    def _assert_actionable_alteration_confirms(self, gene_symbol, alteration_code):
        gene_result = self._add_gene_findings(positive_gene=gene_symbol)
        self._submit()

        response = self.client.post(
            self._confirm_url(),
            self._review_payload(
                positive_gene=gene_symbol,
                alteration_code=alteration_code,
            ),
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.result.refresh_from_db()
        finding = gene_result.gene_findings.get(gene_symbol=gene_symbol)
        self.assertEqual(self.result.result_status, ClinicalResult.ResultStatus.CONFIRMED)
        self.assertEqual(finding.alteration_code, alteration_code)

    def test_egfr_exon19_positive_with_canonical_alteration_confirms(self):
        self._assert_actionable_alteration_confirms("EGFR", "EGFR_EX19_DEL")

    def test_braf_positive_with_canonical_alteration_confirms(self):
        self._assert_actionable_alteration_confirms("BRAF", "BRAF_V600E")

    def test_met_positive_with_canonical_alteration_confirms(self):
        self._assert_actionable_alteration_confirms("MET", "MET_EXON14_SKIPPING")

    def test_unknown_actionable_alteration_is_rejected_but_indeterminate_confirms(self):
        gene_result = self._add_gene_findings()
        self._submit()

        rejected = self.client.post(
            self._confirm_url(),
            self._review_payload(alteration_code="OTHER_UNKNOWN"),
            format="json",
        )
        self.assertEqual(rejected.status_code, 400)
        self.result.refresh_from_db()
        self.assertEqual(self.result.result_status, ClinicalResult.ResultStatus.DRAFT)

        confirmed = self.client.post(
            self._confirm_url(),
            self._review_payload(assessment="INDETERMINATE"),
            format="json",
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        finding = gene_result.gene_findings.get(gene_symbol="EGFR")
        self.assertEqual(finding.assessment, GeneFinding.Assessment.INDETERMINATE)
        self.assertIsNone(finding.alteration_code)

    def test_workflow_advance_cannot_auto_confirm_incomplete_actionable_gene(self):
        self._add_gene_findings()
        self._submit()

        response = self.client.post(
            reverse("doctor-case-workflow-decision", kwargs={"case_id": self.case.id}),
            {
                "action": "PROCEED_NEXT_STAGE",
                "source_clinical_result_id": str(self.result.id),
                "target_stage": WorkflowStage.PDL1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.result.refresh_from_db()
        self.case.refresh_from_db()
        self.assertEqual(self.result.result_status, ClinicalResult.ResultStatus.DRAFT)
        self.assertEqual(self.case.current_stage, WorkflowStage.PATHOLOGY_GENE)

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
        detail = PDL1Result.objects.create(
            clinical_result=result,
            interpretation="AI predicted TPS range: <1%",
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
            {"tps_percent": "12.50", "indeterminate_reason": ""},
            format="json",
        )
        self.assertEqual(confirm.status_code, 200)
        result.refresh_from_db()
        detail.refresh_from_db()
        review.refresh_from_db()
        self.assertEqual(result.result_status, ClinicalResult.ResultStatus.CONFIRMED)
        self.assertEqual(str(detail.tps_percent), "12.50")
        self.assertIsNone(detail.indeterminate_reason)
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

    def test_submitted_pdl1_requires_tps_or_an_indeterminate_reason(self):
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
        detail = PDL1Result.objects.create(
            clinical_result=result,
            interpretation="AI predicted TPS range: 1-49%",
        )
        review = PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=order,
            task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
            status=PathologyWorkItem.Status.PENDING,
        )
        self.case.current_stage = WorkflowStage.PDL1
        self.case.save(update_fields=["current_stage", "updated_at"])
        url = reverse(
            "doctor-submitted-pathology-result-confirm",
            kwargs={"case_id": self.case.id, "result_id": result.id},
        )

        missing = self.client.post(url, {}, format="json")
        self.assertEqual(missing.status_code, 400)
        result.refresh_from_db()
        review.refresh_from_db()
        self.assertEqual(result.result_status, ClinicalResult.ResultStatus.DRAFT)
        self.assertEqual(review.status, PathologyWorkItem.Status.PENDING)

        confirmed = self.client.post(
            url,
            {"tps_percent": None, "indeterminate_reason": "검체 종양세포가 부족하여 판정할 수 없음"},
            format="json",
        )
        self.assertEqual(confirmed.status_code, 200)
        result.refresh_from_db()
        detail.refresh_from_db()
        self.assertEqual(result.result_status, ClinicalResult.ResultStatus.CONFIRMED)
        self.assertIsNone(detail.tps_percent)
        self.assertEqual(detail.indeterminate_reason, "검체 종양세포가 부족하여 판정할 수 없음")
