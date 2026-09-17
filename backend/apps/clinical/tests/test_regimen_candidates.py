import ast
import inspect
import textwrap
from decimal import Decimal
from types import SimpleNamespace as NS
from unittest.mock import MagicMock, patch

from django.db.models import Model
from django.test import SimpleTestCase

from apps.clinical.models import GeneFinding, TreatmentRule
from apps.clinical.serializers import DoctorClinicalResultSerializer, TreatmentRuleCandidateSerializer
from apps.clinical.views import DoctorRegimenCandidateListAPIView as View


class RegimenCandidateTests(SimpleTestCase):
    # SimpleTestCase forbids all database access and needs no test database.
    def setUp(self):
        self.view = View()
        self.data = dict(
            case=object(), histology="adenocarcinoma", cancer_type="NSCLC",
            stage_group="IV", pdl1_tps=Decimal("60"), treatment_line=None, ecog=None,
            findings=[self.finding("EGFR", "EGFR_EX19_DEL")],
        )

    @staticmethod
    def finding(gene, code, assessment="LIKELY_POSITIVE"):
        return GeneFinding(gene_symbol=gene, alteration_code=code, assessment=assessment)

    @staticmethod
    def rule(**kwargs):
        values = dict(rule_code="TR01", cancer_type="NSCLC", histology=None,
                      stage_condition=None, biomarker_condition=None,
                      pdl1_condition=None, ecog_condition=None, treatment_line=None,
                      priority=1)
        values.update(kwargs)
        return TreatmentRule(**values)

    def test_supported_exact_pairs(self):
        for rule, gene, code in [
            ("TR01", "EGFR", "EGFR_EX19_DEL"), ("TR01", "EGFR", "EGFR_L858R"),
            ("TR04", "BRAF", "BRAF_V600E"), ("TR05", "MET", "MET_EXON14_SKIPPING"),
        ]:
            with self.subTest(code=code):
                self.data["findings"] = [self.finding(gene, code)]
                self.assertIsNotNone(self.view._match_rule(self.rule(rule_code=rule), self.data))

    def test_missing_unsupported_wrong_gene_and_nonpositive(self):
        for rule, gene, code, assessment in [
            ("TR01", "EGFR", None, "LIKELY_POSITIVE"),
            ("TR04", "BRAF", "BRAF_OTHER", "LIKELY_POSITIVE"),
            ("TR05", "MET", None, "LIKELY_POSITIVE"),
            ("TR01", "EGFR", "EGFR_EX20_INS", "LIKELY_POSITIVE"),
            ("TR04", "MET", "BRAF_V600E", "LIKELY_POSITIVE"),
            ("TR01", "EGFR", "EGFR_EX19_DEL", "LIKELY_NEGATIVE"),
            ("TR01", "EGFR", "EGFR_EX19_DEL", "INDETERMINATE"),
        ]:
            with self.subTest(gene=gene, code=code, assessment=assessment):
                self.data["findings"] = [self.finding(gene, code, assessment)]
                self.assertIsNone(self.view._match_rule(self.rule(rule_code=rule), self.data))

    def test_missing_required_inputs(self):
        for field, condition in [
            ("stage_group", {"stage_condition": {"stage": ["IV"]}}),
            ("pdl1_tps", {"pdl1_condition": {"min": 50}}),
            ("treatment_line", {"treatment_line": "FIRST_LINE"}),
            ("ecog", {"ecog_condition": {"max": 1}}),
            ("cancer_type", {}),
        ]:
            with self.subTest(field=field):
                data = {**self.data, field: None}
                self.assertIsNone(self.view._match_rule(self.rule(**condition), data))

    def test_stage_and_pdl1_boundaries(self):
        for value, matches in [(49, False), (50, True), (100, True), (None, False)]:
            self.data["pdl1_tps"] = value
            result = self.view._match_rule(self.rule(pdl1_condition={"min": 50}), self.data)
            self.assertEqual(result is not None, matches)
        self.assertIsNone(self.view._match_rule(
            self.rule(stage_condition={"stage": ["III"]}), self.data))

    def test_common_and_exact_histology(self):
        for value in (None, ""):
            self.assertIsNotNone(self.view._match_rule(self.rule(histology=value), self.data))
        self.assertIsNotNone(self.view._match_rule(
            self.rule(histology="Adenocarcinoma"), self.data))
        for value in ("squamous", "adeno", "unrecognized"):
            self.assertIsNone(self.view._match_rule(self.rule(histology=value), self.data))

    def test_cancer_mapping_is_explicit(self):
        self.assertEqual(View.CANCER_TYPES[View._histology("NSCLC")], "NSCLC")
        self.assertIsNone(View._histology("possible NSCLC"))
        self.assertIsNone(self.view._match_rule(self.rule(cancer_type="SCLC"), self.data))

    def test_korean_histology_aliases(self):
        aliases = {
            "선암": "adenocarcinoma", "편평상피암": "squamous",
            "비편평": "non-squamous", "비소세포폐암": "nsclc",
            "소세포폐암": "sclc",
        }
        for alias, canonical in aliases.items():
            with self.subTest(alias=alias):
                self.assertEqual(View._histology(alias), canonical)
                self.assertEqual(View._histology(f" {alias} "), canonical)
                self.assertIsNone(View._histology(f"{alias} 의심"))
        actual = {key: value for key, value in View.HISTOLOGY_ALIASES.items()
                  if any("가" <= char <= "힣" for char in key)}
        self.assertEqual(actual, aliases)

    def test_histology_alias_source_has_no_duplicate_keys(self):
        # Inspect the literal: duplicate keys disappear before runtime inspection.
        tree = ast.parse(textwrap.dedent(inspect.getsource(View)))
        assignment = next(
            node for node in tree.body[0].body
            if isinstance(node, ast.Assign)
            and any(isinstance(target, ast.Name) and target.id == "HISTOLOGY_ALIASES"
                    for target in node.targets)
        )
        keys = [ast.literal_eval(key) for key in assignment.value.keys]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertTrue(all("?" not in key for key in keys))

    def test_korean_match_reasons_are_intact(self):
        data = {**self.data, "treatment_line": "FIRST_LINE", "ecog": 1}
        rule = self.rule(
            histology="선암", stage_condition={"stage": ["IV"]},
            treatment_line="FIRST_LINE", pdl1_condition={"min": 50},
            ecog_condition={"max": 1},
        )
        reasons = self.view._match_rule(rule, data)
        self.assertEqual(reasons, [
            "암종 일치: NSCLC", "조직형 일치: adenocarcinoma", "병기 일치: IV",
            "치료 차수 일치: FIRST_LINE", "PD-L1 TPS 60%: 조건 충족",
            "ECOG 1: 조건 충족", "바이오마커 일치: EGFR / EGFR_EX19_DEL",
        ])
        serializer = TreatmentRuleCandidateSerializer(
            context={"match_reasons_by_id": {rule.id: reasons}},
        )
        self.assertEqual(serializer.get_match_reasons(rule), reasons)
        self.assertTrue(all("?" not in reason for reason in reasons))

    def test_bad_json_never_matches(self):
        for field in ("stage_condition", "biomarker_condition", "pdl1_condition", "ecog_condition"):
            for value in ([], "", False, 0, {"unknown": 1}):
                with self.subTest(field=field, value=value):
                    self.assertIsNone(self.view._match_rule(self.rule(**{field: value}), self.data))
        for kwargs in [
            {"stage_condition": {"stage": []}},
            {"stage_condition": {"stage": "IV"}},
            {"biomarker_condition": {"positive": "EGFR"}},
            {"biomarker_condition": {"alterations": []}},
            {"biomarker_condition": {"alterations": {"EGFR": ["EGFR_OTHER"]}}},
            {"pdl1_condition": {"min": True}},
            {"pdl1_condition": {"min": "50"}},
            {"pdl1_condition": {"min": 60, "max": 50}},
            {"pdl1_condition": {"min": float("nan")}},
            {"pdl1_condition": {"max": 101}},
        ]:
            with self.subTest(kwargs=kwargs):
                self.assertIsNone(self.view._match_rule(self.rule(**kwargs), self.data))

    def test_alteration_condition_refines_rule(self):
        for code, expected in [("EGFR_EX19_DEL", True), ("EGFR_L858R", False)]:
            rule = self.rule(biomarker_condition={"alterations": {"EGFR": [code]}})
            self.assertEqual(self.view._match_rule(rule, self.data) is not None, expected)

    def test_unsupported_cannot_fall_through_or_coexist(self):
        self.data["findings"].append(self.finding("KRAS", "KRAS_G12C"))
        for code in ("TR01", "TR02", "TR03"):
            self.assertIsNone(self.view._match_rule(self.rule(rule_code=code), self.data))

    def test_tr03_and_unresolved_tr02_are_closed(self):
        for code in ("TR02", "TR03"):
            self.assertIsNone(self.view._match_rule(self.rule(rule_code=code), self.data))

    def test_ai_and_note_are_not_molecular_evidence(self):
        self.data["findings"] = []
        self.data["ai_results"] = [NS(gene_symbol="EGFR", predicted_status="PREDICTED_POSITIVE")]
        self.assertIsNone(self.view._match_rule(self.rule(), self.data))
        finding = self.finding("EGFR", None)
        finding.note = "EGFR_EX19_DEL"
        self.data["findings"] = [finding]
        self.assertIsNone(self.view._match_rule(self.rule(), self.data))

    def test_context_genes_do_not_block_target(self):
        self.data["findings"].append(self.finding("TP53", None))
        self.assertIsNotNone(self.view._match_rule(self.rule(), self.data))

    def test_blank_normalization_without_database(self):
        for value in ("", "  ", None):
            finding = self.finding("EGFR", value)
            with patch.object(Model, "save") as save:
                finding.save()
                save.assert_called_once()
            self.assertIsNone(finding.alteration_code)
        finding = self.finding("EGFR", " ")
        finding.full_clean(exclude=["gene_result"], validate_unique=False, validate_constraints=False)
        self.assertIsNone(finding.alteration_code)

    def test_serializer_preserves_fields_and_reuses_reasons(self):
        finding = self.finding("EGFR", "EGFR_EX19_DEL")
        findings = MagicMock()
        findings.all.return_value = [finding]
        obj = NS(gene_detail=NS(
            interpretation=None, additional_test_recommended=False, gene_findings=findings))
        output = DoctorClinicalResultSerializer().get_result_detail(obj)["gene"]["findings"][0]
        self.assertEqual(output["alteration_code"], "EGFR_EX19_DEL")
        self.assertTrue({"gene_symbol", "assessment", "assessment_label", "note"}.issubset(output))
        rule = self.rule()
        reasons = self.view._match_rule(rule, self.data)
        serializer = TreatmentRuleCandidateSerializer(context={"match_reasons_by_id": {rule.id: reasons}})
        self.assertEqual(serializer.get_match_reasons(rule), reasons)
        self.assertTrue({"id", "regimen", "regimen_detail", "priority", "match_reasons"}.issubset(serializer.fields))

    @patch("apps.clinical.views.PDL1Result.objects")
    @patch("apps.clinical.views.ClinicalResult.objects")
    @patch("apps.clinical.views.LungCancerCase.objects")
    def test_direct_pdl1_latest_null_and_request_cache(self, cases, clinical, pdl1):
        case = object()
        cases.filter.return_value.first.return_value = case
        confirmed = clinical.filter.return_value
        confirmed.filter.return_value.select_related.return_value.order_by.return_value.first.return_value = None
        gene_query = confirmed.filter.return_value.select_related.return_value.prefetch_related.return_value
        gene_query.order_by.return_value.first.return_value = None
        pdl1.filter.return_value.order_by.return_value.first.return_value = NS(tps_percent=None)
        self.view.kwargs = {"case_id": "case"}
        self.view.request = NS(user=object())
        data = self.view._candidate_input()
        self.assertIsNone(data["pdl1_tps"])
        self.assertEqual(data["findings"], [])
        self.assertIs(self.view._candidate_input(), data)
        pdl1.filter.assert_called_once_with(
            clinical_result__case=case, clinical_result__result_status="CONFIRMED")
        pdl1.filter.return_value.order_by.return_value.first.assert_called_once()
        clinical.filter.assert_called_once_with(case=case, result_status="CONFIRMED")
        for call in confirmed.filter.call_args_list:
            self.assertNotIn("pdl1_detail", str(call))
        self.assertTrue(any(
            call.kwargs.get("workflow_stage") == "PATHOLOGY_GENE"
            for call in confirmed.filter.call_args_list
        ))
