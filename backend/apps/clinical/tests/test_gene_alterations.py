from django.test import SimpleTestCase

from apps.clinical.gene_alterations import canonicalize_alteration_code
from apps.clinical.serializers import DoctorGeneFindingWriteSerializer


class GeneAlterationNormalizationTests(SimpleTestCase):
    def test_supported_explicit_variants_are_canonicalized(self):
        cases = {
            ("EGFR", "Exon 19 deletion"): "EGFR_EX19_DEL",
            ("EGFR", "EGFR exon 19 del"): "EGFR_EX19_DEL",
            ("EGFR", "Ex19del"): "EGFR_EX19_DEL",
            ("EGFR", "L858R"): "EGFR_L858R",
            ("EGFR", "EGFR p.L858R"): "EGFR_L858R",
            ("BRAF", "V600E"): "BRAF_V600E",
            ("MET", "Exon 14 skipping"): "MET_EXON14_SKIPPING",
        }
        for (gene, value), expected in cases.items():
            with self.subTest(gene=gene, value=value):
                self.assertEqual(canonicalize_alteration_code(gene, value), expected)

    def test_unknown_or_missing_variant_is_not_inferred(self):
        self.assertIsNone(canonicalize_alteration_code("EGFR", None))
        self.assertIsNone(canonicalize_alteration_code("EGFR", "  "))
        self.assertEqual(
            canonicalize_alteration_code("EGFR", "EGFR uncommon variant"),
            "EGFR uncommon variant",
        )

    def test_positive_assessment_without_variant_keeps_null_code(self):
        serializer = DoctorGeneFindingWriteSerializer(data={
            "gene_symbol": "egfr",
            "assessment": "LIKELY_POSITIVE",
            "alteration_code": "",
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["gene_symbol"], "EGFR")
        self.assertIsNone(serializer.validated_data["alteration_code"])

    def test_nonpositive_finding_cannot_carry_an_alteration(self):
        serializer = DoctorGeneFindingWriteSerializer(data={
            "gene_symbol": "EGFR",
            "assessment": "LIKELY_NEGATIVE",
            "alteration_code": "L858R",
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn("alteration_code", serializer.errors)

    def test_canonical_code_cannot_be_attached_to_another_gene(self):
        serializer = DoctorGeneFindingWriteSerializer(data={
            "gene_symbol": "BRAF",
            "assessment": "LIKELY_POSITIVE",
            "alteration_code": "EGFR_L858R",
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn("alteration_code", serializer.errors)
