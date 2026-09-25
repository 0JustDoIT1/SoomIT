import re
import unicodedata


CANONICAL_ALTERATIONS = {
    "EGFR": frozenset({"EGFR_EX19_DEL", "EGFR_L858R"}),
    "BRAF": frozenset({"BRAF_V600E"}),
    "MET": frozenset({"MET_EXON14_SKIPPING"}),
}

AI_TO_CLINICAL_ASSESSMENT = {
    "PREDICTED_POSITIVE": "LIKELY_POSITIVE",
    "PREDICTED_NEGATIVE": "LIKELY_NEGATIVE",
    "INDETERMINATE": "INDETERMINATE",
}


def _alias_key(value):
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"[^a-z0-9]+", "", normalized)


_ALIASES = {
    "EGFR": {
        "egfrex19del": "EGFR_EX19_DEL",
        "egfrexon19del": "EGFR_EX19_DEL",
        "egfrexon19deletion": "EGFR_EX19_DEL",
        "ex19del": "EGFR_EX19_DEL",
        "exon19del": "EGFR_EX19_DEL",
        "exon19deletion": "EGFR_EX19_DEL",
        "egfrl858r": "EGFR_L858R",
        "egfrpl858r": "EGFR_L858R",
        "l858r": "EGFR_L858R",
        "pl858r": "EGFR_L858R",
    },
    "BRAF": {
        "brafv600e": "BRAF_V600E",
        "brafpv600e": "BRAF_V600E",
        "v600e": "BRAF_V600E",
        "pv600e": "BRAF_V600E",
    },
    "MET": {
        "metex14skipping": "MET_EXON14_SKIPPING",
        "metexon14skip": "MET_EXON14_SKIPPING",
        "metexon14skipping": "MET_EXON14_SKIPPING",
        "ex14skipping": "MET_EXON14_SKIPPING",
        "exon14skip": "MET_EXON14_SKIPPING",
        "exon14skipping": "MET_EXON14_SKIPPING",
    },
}


def canonicalize_alteration_code(gene_symbol, value):
    """Canonicalize only unambiguous variants; retain explicit unknown variants."""
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    gene = gene_symbol.strip().upper()
    return _ALIASES.get(gene, {}).get(_alias_key(stripped), stripped)


def canonical_code_gene(value):
    """Return the owner gene for a supported canonical code, if any."""
    for gene, codes in CANONICAL_ALTERATIONS.items():
        if value in codes:
            return gene
    return None
