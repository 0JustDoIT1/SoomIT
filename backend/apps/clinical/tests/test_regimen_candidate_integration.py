from datetime import date
from types import SimpleNamespace

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.ai_results.models import AiAnalysis, AiResult, ModelVersion, PDL1AiResult
from apps.cases.models import LungCancerCase, WorkflowStage
from apps.clinical.models import (
    ClinicalResult,
    GeneFinding,
    GeneResult,
    PathologyResult,
    PDL1Result,
    Regimen,
    TnmResult,
    TreatmentDecision,
    TreatmentRule,
)
from apps.clinical.views import DoctorRegimenCandidateListAPIView
from apps.patients.models import Patient


class RegimenCandidateIntegrationTests(TestCase):
    def setUp(self):
        hospital = Hospital.objects.create(name="Candidate test hospital", code="CANDIDATE-TEST")
        department = Department.objects.create(
            hospital=hospital,
            code="PULMONOLOGY",
            name="Pulmonology",
        )
        role = DepartmentRole.objects.create(
            department=department,
            role=DepartmentRole.Role.DOCTOR,
            display_name="Pulmonologist",
        )
        self.doctor = User.objects.create_user(
            login_id="candidate-doctor",
            password="test-password",
            name="Candidate Doctor",
            department_role=role,
            account_status=User.AccountStatus.ACTIVE,
        )
        patient = Patient.objects.create(
            hospital=hospital,
            patient_code="CANDIDATE-P001",
            name="Candidate Patient",
            birth_date=date(1970, 1, 1),
            sex=Patient.Sex.FEMALE,
            phone_number="010-0000-1111",
            phone_number_hash="candidate-phone-hash",
        )
        self.case = LungCancerCase.objects.create(
            patient=patient,
            case_code="CANDIDATE-CASE-001",
            primary_doctor=self.doctor,
            current_stage=WorkflowStage.TREATMENT,
        )
        self.clinical_result = ClinicalResult.objects.create(
            case=self.case,
            workflow_stage=WorkflowStage.PATHOLOGY_GENE,
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
            confirmed_by_user=self.doctor,
            confirmed_at=timezone.now(),
        )
        PathologyResult.objects.create(
            clinical_result=self.clinical_result,
            malignancy_status=PathologyResult.MalignancyStatus.MALIGNANT,
            histologic_type="LUAD",
        )
        self.gene_result = GeneResult.objects.create(clinical_result=self.clinical_result)

        self.tnm_clinical_result = ClinicalResult.objects.create(
            case=self.case,
            workflow_stage=WorkflowStage.PET_CT_TNM,
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
            confirmed_by_user=self.doctor,
            confirmed_at=timezone.now(),
        )
        TnmResult.objects.create(
            clinical_result=self.tnm_clinical_result,
            t_category="T2",
            n_category="N1",
            m_category="M1",
            stage_group="IV",
        )
        self.pdl1_clinical_result = ClinicalResult.objects.create(
            case=self.case,
            workflow_stage=WorkflowStage.PDL1,
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
            confirmed_by_user=self.doctor,
            confirmed_at=timezone.now(),
        )
        PDL1Result.objects.create(
            clinical_result=self.pdl1_clinical_result,
            tps_percent=60,
        )
        self.treatment_clinical_result = ClinicalResult.objects.create(
            case=self.case,
            workflow_stage=WorkflowStage.TREATMENT,
            result_status=ClinicalResult.ResultStatus.DRAFT,
        )
        self.treatment_decision = TreatmentDecision.objects.create(
            clinical_result=self.treatment_clinical_result,
            ai_recommendation_action=TreatmentDecision.AiRecommendationAction.NOT_USED,
            treatment_type=TreatmentDecision.TreatmentType.OBSERVATION,
            treatment_plan="Candidate test plan",
        )

        rule_specs = [
            ("TR01", 1, "R1", "Osimertinib", "EGFR", ["EGFR_EX19_DEL", "EGFR_L858R"]),
            ("TR01", 2, "R2", "Osimertinib combination", "EGFR", ["EGFR_EX19_DEL", "EGFR_L858R"]),
            ("TR04", 1, "R5", "Dabrafenib + Trametinib", "BRAF", ["BRAF_V600E"]),
            ("TR05", 1, "R6", "Capmatinib", "MET", ["MET_EXON14_SKIPPING"]),
        ]
        for rule_code, priority, regimen_code, regimen_name, gene, codes in rule_specs:
            regimen = Regimen.objects.create(
                regimen_code=regimen_code,
                regimen_name=regimen_name,
                cancer_type="NSCLC",
            )
            TreatmentRule.objects.create(
                rule_code=rule_code,
                cancer_type="NSCLC",
                biomarker_condition={"alterations": {gene: codes}},
                regimen=regimen,
                priority=priority,
            )

        r3 = Regimen.objects.create(
            regimen_code="R3",
            regimen_name="Pembrolizumab",
            cancer_type="NSCLC",
        )
        TreatmentRule.objects.create(
            rule_code="TR02",
            cancer_type="NSCLC",
            stage_condition={"stage": ["IV"]},
            pdl1_condition={"min": 50},
            regimen=r3,
            priority=1,
        )
        r4 = Regimen.objects.create(
            regimen_code="R4",
            regimen_name="Pembrolizumab + Pemetrexed + Carboplatin",
            cancer_type="NSCLC",
        )
        TreatmentRule.objects.create(
            rule_code="TR03",
            cancer_type="NSCLC",
            histology="non-squamous",
            regimen=r4,
            priority=1,
        )

    def candidate_codes(self):
        view = DoctorRegimenCandidateListAPIView()
        view.request = SimpleNamespace(user=self.doctor)
        view.kwargs = {"case_id": self.case.id}
        return [rule.regimen.regimen_code for rule in view.get_queryset()]

    def candidates_for(self, gene, alteration_code):
        self.gene_result.gene_findings.all().delete()
        GeneFinding.objects.create(
            gene_result=self.gene_result,
            gene_symbol=gene,
            assessment=GeneFinding.Assessment.LIKELY_POSITIVE,
            alteration_code=alteration_code,
        )
        return self.candidate_codes()

    def test_egfr_ex19_and_l858r_generate_both_osimertinib_candidates(self):
        self.assertEqual(self.candidates_for("EGFR", "EGFR_EX19_DEL"), ["R1", "R2"])
        self.assertEqual(self.candidates_for("EGFR", "EGFR_L858R"), ["R1", "R2"])

    def test_positive_without_alteration_generates_no_candidate(self):
        self.assertEqual(self.candidates_for("EGFR", None), [])

    def test_pathology_delivered_draft_does_not_generate_candidate(self):
        self.clinical_result.result_status = ClinicalResult.ResultStatus.DRAFT
        self.clinical_result.confirmed_by_user = None
        self.clinical_result.confirmed_at = None
        self.clinical_result.save(
            update_fields=["result_status", "confirmed_by_user", "confirmed_at", "updated_at"]
        )
        self.assertEqual(self.candidates_for("EGFR", "EGFR_EX19_DEL"), [])

    def test_braf_v600e_generates_braf_candidate(self):
        self.assertEqual(self.candidates_for("BRAF", "BRAF_V600E"), ["R5"])

    def test_met_exon14_skipping_generates_met_candidate(self):
        self.assertEqual(self.candidates_for("MET", "MET_EXON14_SKIPPING"), ["R6"])

    def test_tr02_uses_confirmed_clinical_pdl1_boundaries(self):
        self.gene_result.gene_findings.all().delete()
        pdl1 = self.pdl1_clinical_result.pdl1_detail

        for tps, expected in [
            (49, False),
            (50, True),
            (60, True),
        ]:
            with self.subTest(tps=tps):
                pdl1.tps_percent = tps
                pdl1.save(update_fields=["tps_percent"])
                codes = self.candidate_codes()
                self.assertEqual("R3" in codes, expected)

    def test_draft_or_ai_only_pdl1_never_generates_r3(self):
        self.gene_result.gene_findings.all().delete()
        self.pdl1_clinical_result.result_status = ClinicalResult.ResultStatus.DRAFT
        self.pdl1_clinical_result.confirmed_by_user = None
        self.pdl1_clinical_result.confirmed_at = None
        self.pdl1_clinical_result.save(
            update_fields=["result_status", "confirmed_by_user", "confirmed_at", "updated_at"]
        )

        self.assertNotIn("R3", self.candidate_codes())

        self.pdl1_clinical_result.delete()
        model_version = ModelVersion.objects.create(
            model_name="candidate-pdl1", version="1", analysis_type="PDL1_ANALYSIS",
        )
        analysis = AiAnalysis.objects.create(
            case=self.case,
            analysis_type="PDL1_ANALYSIS",
            model_version=model_version,
            status=AiAnalysis.Status.SUCCEEDED,
        )
        ai_result = AiResult.objects.create(
            ai_analysis=analysis,
            schema_version="1",
            result_payload={"predicted_tps_range": "GE_50"},
        )
        PDL1AiResult.objects.create(
            ai_result=ai_result,
            predicted_class=2,
            predicted_tps_range="GE_50",
            confidence="0.99",
            probabilities=[0.0, 0.01, 0.99],
        )

        self.assertNotIn("R3", self.candidate_codes())

    def test_non_squamous_generates_r4_but_squamous_does_not(self):
        self.gene_result.gene_findings.all().delete()
        self.assertIn("R4", self.candidate_codes())

        pathology = self.clinical_result.pathology_detail
        pathology.histologic_type = "LUSC"
        pathology.save(update_fields=["histologic_type"])

        self.assertNotIn("R4", self.candidate_codes())
