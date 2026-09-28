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

    def saved_opinion(self, opinion="AI 참고 소견"):
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

    @patch("apps.cases.views.request_chat_completion", return_value="AI 참고 소견")
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
        self.assertEqual(response.data["opinion"], "AI 참고 소견")
        evidence_view.return_value.build_response.assert_called_once()
        self.assertEqual(
            evidence_view.return_value.build_response.call_args.kwargs["selected_regimen_id"],
            self.regimen_id,
        )
        self.assertFalse(evidence_view.return_value.build_response.call_args.kwargs["generate_summary"])
        prompt = json.loads(chat.call_args.args[0][1]["content"])
        self.assertEqual(prompt["draft_treatment"], {
            "treatment_type": "TARGETED_THERAPY",
            "treatment_plan": "DRAFT 치료계획",
        })
        opinion_objects.update_or_create.assert_called_once_with(
            case=case_objects.filter.return_value.first.return_value,
            defaults=ANY,
        )

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
    def test_ai_failure_does_not_write_or_confirm_treatment(
        self, evidence_view, case_objects, prescription_objects, decision_objects, opinion_objects, _chat,
    ):
        evidence_view.return_value.build_response.return_value = Response(self.available_evidence())
        case_objects.filter.return_value.first.return_value = NS(id=self.case_id)
        opinion_objects.filter.return_value.first.return_value = None
        decision_objects.filter.return_value.exists.return_value = False
        prescription_objects.filter.return_value.prefetch_related.return_value.order_by.return_value.first.return_value = None

        response = DoctorTreatmentOpinionAPIView.as_view()(
            self.request({"selected_regimen": str(self.regimen_id)}),
            case_id=self.case_id,
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.data["status"], "MEDGEMMA_ERROR")
        opinion_objects.update_or_create.assert_not_called()

    @patch("apps.cases.views.TreatmentAIOpinion.objects")
    @patch("apps.cases.views.LungCancerCase.objects")
    def test_get_restores_the_persisted_opinion(self, case_objects, opinion_objects):
        case_objects.filter.return_value.first.return_value = NS(id=self.case_id)
        opinion_objects.filter.return_value.first.return_value = self.saved_opinion("저장된 AI 소견")

        response = DoctorTreatmentOpinionAPIView.as_view()(self.get_request(), case_id=self.case_id)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "AVAILABLE")
        self.assertEqual(response.data["opinion"], "저장된 AI 소견")

    @patch("apps.cases.views.TreatmentAIOpinion.objects")
    @patch("apps.cases.views.LungCancerCase.objects")
    def test_get_hides_a_legacy_english_opinion(self, case_objects, opinion_objects):
        case_objects.filter.return_value.first.return_value = NS(id=self.case_id)
        opinion_objects.filter.return_value.first.return_value = self.saved_opinion("English treatment opinion")

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
        saved = self.saved_opinion("확정 시점 AI 소견")
        opinion_objects.filter.return_value.first.return_value = saved
        decision_objects.filter.return_value.exists.return_value = True
        prescription_objects.filter.return_value.prefetch_related.return_value.order_by.return_value.first.return_value = None

        response = DoctorTreatmentOpinionAPIView.as_view()(
            self.request({"selected_regimen": str(self.regimen_id)}),
            case_id=self.case_id,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["opinion"], "확정 시점 AI 소견")
        chat.assert_not_called()
        opinion_objects.update_or_create.assert_not_called()

    @patch("apps.cases.views.request_chat_completion", side_effect=["English opinion", "한국어 치료 소견"])
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
        opinion_objects.update_or_create.return_value = (self.saved_opinion("한국어 치료 소견"), False)

        response = DoctorTreatmentOpinionAPIView.as_view()(
            self.request({"selected_regimen": str(self.regimen_id)}), case_id=self.case_id,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["opinion"], "한국어 치료 소견")
        self.assertEqual(chat.call_count, 2)
        self.assertEqual(opinion_objects.update_or_create.call_args.kwargs["defaults"]["opinion"], "한국어 치료 소견")


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
