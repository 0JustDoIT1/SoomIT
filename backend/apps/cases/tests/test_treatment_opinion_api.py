import json
import uuid
from types import SimpleNamespace as NS
from unittest.mock import ANY, MagicMock, patch

from django.test import SimpleTestCase
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.cases.views import DoctorTreatmentOpinionAPIView
from apps.clinical.views import DoctorTreatmentEvidenceAPIView
from apps.knowledge.services.embedding_client import EmbeddingServiceError
from apps.knowledge.services.medgemma_client import MedgemmaServiceError

CURRENT_OPINION = json.dumps({
    "xray_summary": "X-ray 의심 소견",
    "ct_summary": "CT 결절 확인",
    "staging_summary": "IVA 병기",
    "pathology_biomarker_summary": "선암, EGFR 양성",
    "treatment_summary": "선택 치료계획",
    "safety_follow_up": "안전성 확인 및 추적",
}, ensure_ascii=False)


class DoctorTreatmentOpinionAPITests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = NS(is_authenticated=True)
        self.case_id = uuid.uuid4()
        self.regimen_id = uuid.uuid4()

    def request(self, data):
        request = self.factory.post("/treatment-opinion/", data, format="json")
        force_authenticate(request, user=self.user)
        return request

    def get_request(self):
        request = self.factory.get("/treatment-opinion/")
        force_authenticate(request, user=self.user)
        return request

    def saved_opinion(self, opinion=CURRENT_OPINION):
        return NS(
            id=uuid.uuid4(),
            case_id=self.case_id,
            status="AVAILABLE",
            opinion=opinion,
            sources=[],
            safety_status="safety_not_run",
            review_required=True,
            selected_regimen_id=self.regimen_id,
            treatment_type="TARGETED_THERAPY",
            treatment_plan="DRAFT 치료계획",
            created_at=None,
            updated_at=None,
        )

    @staticmethod
    def available_evidence():
        return {
            "status": "AVAILABLE",
            "clinical_context": {"stage": "IV"},
            "regimen": {"id": "regimen", "code": "R1", "name": "Regimen"},
            "treatment_rule": {"rule_code": "TR01", "match_reasons": []},
            "evidence": {"answer": "evidence", "sources": []},
        }

    @patch("apps.cases.views.request_chat_completion", return_value=CURRENT_OPINION)
    @patch("apps.cases.views.TreatmentAIOpinion.objects")
    @patch("apps.cases.views.TreatmentDecision.objects")
    @patch("apps.cases.views.Prescription.objects")
    @patch("apps.cases.views.LungCancerCase.objects")
    @patch("apps.cases.views.DoctorTreatmentEvidenceAPIView")
    def test_uses_selected_draft_regimen_without_confirming_treatment(
        self, evidence_view, case_objects, prescription_objects, decision_objects, opinion_objects, chat,
    ):
        evidence_view.return_value.build_response.return_value = Response(self.available_evidence())
        case_objects.filter.return_value.first.return_value = NS(id=self.case_id)
        opinion_objects.filter.return_value.first.return_value = None
        decision_objects.filter.return_value.exists.return_value = False
        opinion_objects.update_or_create.return_value = (self.saved_opinion(), True)
        prescription_objects.filter.return_value.prefetch_related.return_value.order_by.return_value.first.return_value = None

        response = DoctorTreatmentOpinionAPIView.as_view()(
            self.request({
                "selected_regimen": str(self.regimen_id),
                "treatment_type": "TARGETED_THERAPY",
                "treatment_plan": "DRAFT 치료계획",
            }),
            case_id=self.case_id,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["opinion"], CURRENT_OPINION)
        evidence_view.return_value.build_response.assert_called_once()
        self.assertEqual(
            evidence_view.return_value.build_response.call_args.kwargs["selected_regimen_id"],
            self.regimen_id,
        )
        self.assertFalse(evidence_view.return_value.build_response.call_args.kwargs["generate_summary"])
        prompt = json.loads(chat.call_args.args[0][1]["content"])
        self.assertEqual(prompt["confirmed_clinical_journey"], [])
        self.assertEqual(prompt["draft_treatment"], {
            "treatment_type": "TARGETED_THERAPY",
            "treatment_plan": "DRAFT 치료계획",
        })
        opinion_objects.update_or_create.assert_called_once_with(
            case=case_objects.filter.return_value.first.return_value,
            defaults=ANY,
        )

    @patch("apps.cases.views.DoctorClinicalResultSerializer")
    def test_confirmed_clinical_journey_is_sorted_in_workflow_order(self, serializer):
        manager = MagicMock()
        queryset = manager.filter.return_value.select_related.return_value.prefetch_related.return_value.order_by.return_value
        serializer.return_value.data = [
            {"workflow_stage": "PDL1", "result_detail": {"pdl1": {"tps_percent": 10}}},
            {"workflow_stage": "XRAY", "result_detail": {"xray": {"assessment": "SUSPICIOUS"}}},
            {"workflow_stage": "CT", "result_detail": {"ct": {"overall_assessment": "NODULE_DETECTED"}}},
        ]

        journey = DoctorTreatmentOpinionAPIView._confirmed_clinical_journey(
            NS(clinical_results=manager),
        )

        manager.filter.assert_called_once_with(result_status="CONFIRMED")
        serializer.assert_called_once_with(queryset, many=True)
        self.assertEqual([item["workflow_stage"] for item in journey], ["XRAY", "CT", "PDL1"])

    def test_prompt_removes_duplicate_excerpts_but_preserves_clinical_and_safety_data(self):
        evidence = self.available_evidence()
        excerpt = "NCI treatment evidence " * 100
        evidence["evidence"] = {"context": excerpt, "sources": [
            {"document": "NCI", "source_uri": "https://example.test/nci", "excerpt": excerpt, "distance": 0.1},
        ]}
        journey = [{"id": "result-id", "result_status": "CONFIRMED", "exam_name": "CT",
                    "workflow_stage": "CT", "result_date": "2026-09-30",
                    "result_detail": {"ct": {"finding_summary": "확정 소견", "overall_malignancy_risk": 0}}}]
        safety = {"safety_status": "block_present", "results": [{"message": "차단 사유"}]}
        result = DoctorTreatmentOpinionAPIView._opinion_prompt_context(journey, evidence, {}, {}, safety)
        self.assertEqual(result["confirmed_clinical_journey"][0]["result_detail"], journey[0]["result_detail"])
        self.assertEqual(result["confirmed_clinical_journey"][0]["result_date"], "2026-09-30")
        self.assertEqual(result["safety"], safety)
        self.assertEqual(result["evidence"]["context"], excerpt)
        self.assertNotIn("excerpt", result["evidence"]["sources"][0])
        self.assertIn("excerpt", evidence["evidence"]["sources"][0])
        self.assertLess(len(json.dumps(result["evidence"])), len(json.dumps(evidence["evidence"])) * 0.6)
        del evidence["evidence"]["context"]
        result = DoctorTreatmentOpinionAPIView._opinion_prompt_context(journey, evidence, {}, {}, safety)
        self.assertEqual(result["evidence"]["sources"][0]["excerpt"], excerpt)

    def test_confirmed_data_fallback_keeps_each_diagnostic_stage(self):
        journey = [
            {"workflow_stage": "XRAY", "result_detail": {"xray": {
                "assessment_label": "의심", "finding_summary": "우상엽 결절 의심",
                "recommended_action": "CHEST_CT",
            }}},
            {"workflow_stage": "CT", "result_detail": {"ct": {
                "overall_assessment_label": "결절발견", "finding_summary": "우상엽 결절",
                "overall_malignancy_risk": None, "nodule_observations": [{
                    "nodule_no": 1, "lobe_label": "우상엽", "max_diameter_mm": 28.79, "malignancy_risk": 93.11,
                }],
            }}},
            {"workflow_stage": "PET_CT_TNM", "result_detail": {"tnm": {
                "t_category": "T2", "n_category": "N1", "m_category": "M1a", "stage_group": "IVA",
            }}},
            {"workflow_stage": "PATHOLOGY_GENE", "result_detail": {
                "pathology": {"malignancy_status_label": "악성", "histologic_type": "LUAD", "subtype": "LUAD"},
                "gene": {"findings": [
                    {"gene_symbol": "EGFR", "alteration_code": "EGFR_EX19_DEL", "assessment": "LIKELY_POSITIVE", "assessment_label": "양성가능성"},
                    {"gene_symbol": "TP53", "alteration_code": None, "assessment": "LIKELY_POSITIVE", "assessment_label": "양성가능성"},
                    {"gene_symbol": "BRAF", "assessment": "LIKELY_NEGATIVE", "assessment_label": "음성가능성"},
                ]},
            }},
            {"workflow_stage": "PDL1", "result_detail": {"pdl1": {"tps_percent": 10}}},
        ]

        opinion = json.loads(DoctorTreatmentOpinionAPIView._confirmed_data_fallback(
            journey,
            {"regimen": {"code": "R1", "name": "Osimertinib"}},
            {"treatment_type": "TARGETED_THERAPY", "treatment_plan": "표적치료 예정"},
            {"safety_status": "safety_not_run", "results": []},
        ))

        self.assertIn("우상엽 결절 의심", opinion["xray_summary"])
        self.assertIn("악성 위험도 93.11%", opinion["ct_summary"])
        self.assertIn("T2 N1 M1a", opinion["staging_summary"])
        self.assertIn("Stage IVA", opinion["staging_summary"])
        self.assertIn("EGFR", opinion["pathology_biomarker_summary"])
        self.assertIn("exon 19 결실", opinion["pathology_biomarker_summary"])
        self.assertIn("TP53 변이", opinion["pathology_biomarker_summary"])
        self.assertNotIn("EGFR_EX19_DEL", opinion["pathology_biomarker_summary"])
        self.assertIn("폐선암", opinion["pathology_biomarker_summary"])
        self.assertNotIn("BRAF", opinion["pathology_biomarker_summary"])
        self.assertIn("PD-L1 TPS는 10%", opinion["pathology_biomarker_summary"])
        self.assertIn("오시머티닙", opinion["treatment_summary"])
        self.assertNotIn("TARGETED_THERAPY", opinion["treatment_summary"])
        self.assertIn("표적치료", opinion["treatment_summary"])
        self.assertNotIn("CHEST_CT", opinion["xray_summary"])
        self.assertIn("흉부 CT 추가 검사", opinion["xray_summary"])

    @patch("apps.cases.views.request_chat_completion")
    @patch("apps.cases.views.LungCancerCase.objects")
    @patch("apps.cases.views.DoctorTreatmentEvidenceAPIView")
    def test_missing_regimen_is_a_controlled_client_error(self, evidence_view, case_objects, chat):
        evidence_view.return_value.build_response.return_value = Response({
            "status": "NO_SELECTED_REGIMEN",
            "case_id": str(self.case_id),
        })

        response = DoctorTreatmentOpinionAPIView.as_view()(
            self.request({}), case_id=self.case_id,
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["status"], "NO_SELECTED_REGIMEN")
        case_objects.filter.assert_not_called()
        chat.assert_not_called()

    @patch("apps.cases.views.request_chat_completion", side_effect=MedgemmaServiceError("unavailable"))
    @patch("apps.cases.views.TreatmentAIOpinion.objects")
    @patch("apps.cases.views.TreatmentDecision.objects")
    @patch("apps.cases.views.Prescription.objects")
    @patch("apps.cases.views.LungCancerCase.objects")
    @patch("apps.cases.views.DoctorTreatmentEvidenceAPIView")
    def test_ai_failure_saves_a_confirmed_data_fallback_without_confirming_treatment(
        self, evidence_view, case_objects, prescription_objects, decision_objects, opinion_objects, _chat,
    ):
        evidence_view.return_value.build_response.return_value = Response(self.available_evidence())
        case_objects.filter.return_value.first.return_value = NS(id=self.case_id)
        opinion_objects.filter.return_value.first.return_value = None
        decision_objects.filter.return_value.exists.return_value = False
        prescription_objects.filter.return_value.prefetch_related.return_value.order_by.return_value.first.return_value = None
        saved = self.saved_opinion()
        saved.status = "CONFIRMED_DATA_FALLBACK_V3"
        opinion_objects.update_or_create.return_value = (saved, True)

        response = DoctorTreatmentOpinionAPIView.as_view()(
            self.request({"selected_regimen": str(self.regimen_id)}),
            case_id=self.case_id,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "CONFIRMED_DATA_FALLBACK_V3")
        defaults = opinion_objects.update_or_create.call_args.kwargs["defaults"]
        self.assertEqual(defaults["status"], "CONFIRMED_DATA_FALLBACK_V3")
        fallback = json.loads(defaults["opinion"])
        self.assertEqual(set(fallback), DoctorTreatmentOpinionAPIView.OPINION_SCHEMA_KEYS)

    @patch("apps.cases.views.TreatmentAIOpinion.objects")
    @patch("apps.cases.views.LungCancerCase.objects")
    def test_get_restores_the_persisted_opinion(self, case_objects, opinion_objects):
        case_objects.filter.return_value.first.return_value = NS(id=self.case_id)
        opinion_objects.filter.return_value.first.return_value = self.saved_opinion(CURRENT_OPINION)

        response = DoctorTreatmentOpinionAPIView.as_view()(self.get_request(), case_id=self.case_id)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "AVAILABLE")
        self.assertEqual(response.data["opinion"], CURRENT_OPINION)

    @patch("apps.cases.views.TreatmentAIOpinion.objects")
    @patch("apps.cases.views.LungCancerCase.objects")
    def test_get_hides_a_legacy_treatment_only_opinion(self, case_objects, opinion_objects):
        case_objects.filter.return_value.first.return_value = NS(id=self.case_id)
        opinion_objects.filter.return_value.first.return_value = self.saved_opinion("기존 치료 중심 소견")

        response = DoctorTreatmentOpinionAPIView.as_view()(self.get_request(), case_id=self.case_id)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "NOT_GENERATED")
        self.assertIsNone(response.data["opinion"])

    @patch("apps.cases.views.TreatmentAIOpinion.objects")
    @patch("apps.cases.views.LungCancerCase.objects")
    def test_get_hides_the_old_raw_confirmed_data_fallback(self, case_objects, opinion_objects):
        case_objects.filter.return_value.first.return_value = NS(id=self.case_id)
        old_fallback = self.saved_opinion(CURRENT_OPINION)
        old_fallback.status = "CONFIRMED_DATA_FALLBACK_V2"
        opinion_objects.filter.return_value.first.return_value = old_fallback

        response = DoctorTreatmentOpinionAPIView.as_view()(self.get_request(), case_id=self.case_id)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "NOT_GENERATED")
        self.assertIsNone(response.data["opinion"])

    @patch("apps.cases.views.request_chat_completion")
    @patch("apps.cases.views.TreatmentAIOpinion.objects")
    @patch("apps.cases.views.TreatmentDecision.objects")
    @patch("apps.cases.views.Prescription.objects")
    @patch("apps.cases.views.LungCancerCase.objects")
    @patch("apps.cases.views.DoctorTreatmentEvidenceAPIView")
    def test_confirmed_korean_opinion_is_frozen(
        self, evidence_view, case_objects, prescription_objects, decision_objects, opinion_objects, chat,
    ):
        evidence_view.return_value.build_response.return_value = Response(self.available_evidence())
        case_objects.filter.return_value.first.return_value = NS(id=self.case_id)
        saved = self.saved_opinion(CURRENT_OPINION)
        opinion_objects.filter.return_value.first.return_value = saved
        decision_objects.filter.return_value.exists.return_value = True
        prescription_objects.filter.return_value.prefetch_related.return_value.order_by.return_value.first.return_value = None

        response = DoctorTreatmentOpinionAPIView.as_view()(
            self.request({"selected_regimen": str(self.regimen_id)}),
            case_id=self.case_id,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["opinion"], CURRENT_OPINION)
        chat.assert_not_called()
        opinion_objects.update_or_create.assert_not_called()

    @patch("apps.cases.views.request_chat_completion", side_effect=["English opinion", CURRENT_OPINION])
    @patch("apps.cases.views.TreatmentAIOpinion.objects")
    @patch("apps.cases.views.TreatmentDecision.objects")
    @patch("apps.cases.views.Prescription.objects")
    @patch("apps.cases.views.LungCancerCase.objects")
    @patch("apps.cases.views.DoctorTreatmentEvidenceAPIView")
    def test_english_model_output_is_repaired_before_it_is_saved(
        self, evidence_view, case_objects, prescription_objects, decision_objects, opinion_objects, chat,
    ):
        evidence_view.return_value.build_response.return_value = Response(self.available_evidence())
        case_objects.filter.return_value.first.return_value = NS(id=self.case_id)
        opinion_objects.filter.return_value.first.return_value = self.saved_opinion("English stored opinion")
        decision_objects.filter.return_value.exists.return_value = True
        prescription_objects.filter.return_value.prefetch_related.return_value.order_by.return_value.first.return_value = None
        opinion_objects.update_or_create.return_value = (self.saved_opinion(CURRENT_OPINION), False)

        response = DoctorTreatmentOpinionAPIView.as_view()(
            self.request({"selected_regimen": str(self.regimen_id)}), case_id=self.case_id,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["opinion"], CURRENT_OPINION)
        self.assertEqual(chat.call_count, 2)
        self.assertEqual(opinion_objects.update_or_create.call_args.kwargs["defaults"]["opinion"], CURRENT_OPINION)


class DoctorTreatmentEvidenceDraftRegimenTests(SimpleTestCase):
    @patch("apps.clinical.views.retrieve_evidence", return_value={
        "answer": None,
        "context": "retrieved NCI context",
        "sources": [{"document": "nci", "chunk_index": 1, "distance": 0.1}],
    })
    @patch("apps.clinical.views.answer_with_rag")
    @patch("apps.clinical.views.KnowledgeDocument.objects")
    @patch("apps.clinical.views.DoctorRegimenCandidateListAPIView.get_queryset")
    @patch("apps.clinical.views.DoctorRegimenCandidateListAPIView._candidate_input")
    def test_opinion_evidence_mode_skips_the_intermediate_llm_summary(
        self, candidate_input, candidate_queryset, documents, answer, retrieve,
    ):
        case_id = uuid.uuid4()
        regimen_id = uuid.uuid4()
        regimen_drugs = MagicMock()
        regimen_drugs.values_list.return_value.distinct.return_value = ["Osimertinib"]
        regimen = NS(id=regimen_id, regimen_code="R1", regimen_name="Osimertinib", regimen_drugs=regimen_drugs)
        rule = NS(id=uuid.uuid4(), regimen_id=regimen_id, regimen=regimen, rule_code="TR01", evidence_source="NCI PDQ")
        candidate_input.return_value = {
            "case": NS(id=case_id), "findings": [], "cancer_type": "NSCLC",
            "histology": "Adenocarcinoma", "stage_group": "IV", "pdl1_tps": None, "ecog": None,
        }
        candidate_queryset.return_value = [rule]
        documents.filter.return_value.first.return_value = NS(id=uuid.uuid4())

        response = DoctorTreatmentEvidenceAPIView().build_response(
            NS(user=object()), case_id, selected_regimen_id=regimen_id, generate_summary=False,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["evidence"]["context"], "retrieved NCI context")
        retrieve.assert_called_once()
        answer.assert_not_called()

    @patch("apps.clinical.views.answer_with_rag", return_value={
        "answer": "evidence",
        "sources": [{"document": "nci", "chunk_index": 1, "distance": 0.1}],
    })
    @patch("apps.clinical.views.KnowledgeDocument.objects")
    @patch("apps.clinical.views.TreatmentDecision.objects")
    @patch("apps.clinical.views.DoctorRegimenCandidateListAPIView.get_queryset")
    @patch("apps.clinical.views.DoctorRegimenCandidateListAPIView._candidate_input")
    def test_selected_draft_regimen_reuses_current_candidate_and_evidence_pipeline(
        self, candidate_input, candidate_queryset, decisions, documents, _rag,
    ):
        case_id = uuid.uuid4()
        regimen_id = uuid.uuid4()
        regimen_drugs = MagicMock()
        regimen_drugs.values_list.return_value.distinct.return_value = ["Osimertinib"]
        regimen = NS(
            id=regimen_id,
            regimen_code="R1",
            regimen_name="Osimertinib",
            regimen_drugs=regimen_drugs,
        )
        rule = NS(
            id=uuid.uuid4(),
            regimen_id=regimen_id,
            regimen=regimen,
            rule_code="TR01",
            evidence_source="NCI PDQ",
        )
        candidate_input.return_value = {
            "case": NS(id=case_id),
            "findings": [],
            "cancer_type": "NSCLC",
            "histology": "Adenocarcinoma",
            "stage_group": "IV",
            "pdl1_tps": 50,
            "ecog": 1,
        }
        candidate_queryset.return_value = [rule]
        documents.filter.return_value.first.return_value = NS(id=uuid.uuid4())

        response = DoctorTreatmentEvidenceAPIView().build_response(
            NS(user=object()), case_id, selected_regimen_id=regimen_id,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "AVAILABLE")
        self.assertEqual(response.data["regimen"]["id"], str(regimen_id))
        decisions.filter.assert_not_called()

    @patch("apps.clinical.views.answer_with_rag", return_value={
        "answer": "evidence",
        "sources": [{"document": "nci", "chunk_index": 1, "distance": 0.1}],
    })
    @patch("apps.clinical.views.KnowledgeDocument.objects")
    @patch("apps.clinical.views.TreatmentDecision.objects")
    @patch("apps.clinical.views.DoctorRegimenCandidateListAPIView.get_queryset")
    @patch("apps.clinical.views.DoctorRegimenCandidateListAPIView._candidate_input")
    def test_legacy_positive_finding_without_alteration_code_uses_gene_fallback(
        self, candidate_input, candidate_queryset, decisions, documents, rag,
    ):
        case_id = uuid.uuid4()
        regimen_id = uuid.uuid4()
        regimen_drugs = MagicMock()
        regimen_drugs.values_list.return_value.distinct.return_value = ["Osimertinib"]
        regimen = NS(
            id=regimen_id,
            regimen_code="R1",
            regimen_name="Osimertinib",
            regimen_drugs=regimen_drugs,
        )
        rule = NS(
            id=uuid.uuid4(),
            regimen_id=regimen_id,
            regimen=regimen,
            rule_code="TR01",
            evidence_source="NCI PDQ",
        )
        candidate_input.return_value = {
            "case": NS(id=case_id),
            "findings": [NS(gene_symbol="EGFR", alteration_code=None, assessment="LIKELY_POSITIVE")],
            "cancer_type": "NSCLC",
            "histology": "Adenocarcinoma",
            "stage_group": "IVA",
            "pdl1_tps": None,
            "ecog": None,
        }
        candidate_queryset.return_value = [rule]
        documents.filter.return_value.first.return_value = NS(id=uuid.uuid4())

        response = DoctorTreatmentEvidenceAPIView().build_response(
            NS(user=object()), case_id, selected_regimen_id=regimen_id,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "AVAILABLE")
        self.assertIn("confirmed alterations EGFR likely positive", rag.call_args.args[0])
        decisions.filter.assert_not_called()

    @patch("apps.clinical.views.answer_with_rag", side_effect=EmbeddingServiceError("auth unavailable"))
    @patch("apps.clinical.views.KnowledgeDocument.objects")
    @patch("apps.clinical.views.DoctorRegimenCandidateListAPIView.get_queryset")
    @patch("apps.clinical.views.DoctorRegimenCandidateListAPIView._candidate_input")
    def test_embedding_auth_failure_is_a_controlled_gateway_error(
        self, candidate_input, candidate_queryset, documents, _rag,
    ):
        case_id = uuid.uuid4()
        regimen_id = uuid.uuid4()
        regimen_drugs = MagicMock()
        regimen_drugs.values_list.return_value.distinct.return_value = ["Osimertinib"]
        regimen = NS(
            id=regimen_id,
            regimen_code="R1",
            regimen_name="Osimertinib",
            regimen_drugs=regimen_drugs,
        )
        rule = NS(id=uuid.uuid4(), regimen_id=regimen_id, regimen=regimen, rule_code="TR01", evidence_source="NCI")
        candidate_input.return_value = {
            "case": NS(id=case_id),
            "findings": [],
            "cancer_type": "NSCLC",
            "histology": "adenocarcinoma",
            "stage_group": "IVA",
            "pdl1_tps": 10,
            "ecog": None,
        }
        candidate_queryset.return_value = [rule]
        documents.filter.return_value.first.return_value = NS(id=uuid.uuid4())

        response = DoctorTreatmentEvidenceAPIView().build_response(
            NS(user=object()), case_id, selected_regimen_id=regimen_id,
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.data["status"], "RAG_ERROR")
