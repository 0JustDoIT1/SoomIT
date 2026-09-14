from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any


ACCEPTED_LESION_STATUS = {"confirmed", "high_suspicion"}


def _positive(value: Any) -> bool:
    return value is True


def classify_m(payload: dict[str, Any]) -> dict[str, Any]:
    evidence = payload.get("imaging_evidence", {})
    lesions = [
        lesion
        for lesion in evidence.get("extrathoracic_lesions", [])
        if lesion.get("status") in ACCEPTED_LESION_STATUS
    ]
    organ_counts = Counter(str(lesion.get("organ_system", "unknown")) for lesion in lesions)
    extrathoracic_count = len(lesions)
    organ_system_count = len(organ_counts)

    m1a_reasons = []
    if int(evidence.get("contralateral_lung_nodules", 0) or 0) > 0:
        m1a_reasons.append("contralateral lung tumor nodule(s)")
    if int(evidence.get("pleural_nodules", 0) or 0) > 0:
        m1a_reasons.append("pleural nodule(s)")
    if int(evidence.get("pericardial_nodules", 0) or 0) > 0:
        m1a_reasons.append("pericardial nodule(s)")
    if _positive(evidence.get("malignant_pleural_effusion")):
        m1a_reasons.append("malignant pleural effusion")
    if _positive(evidence.get("malignant_pericardial_effusion")):
        m1a_reasons.append("malignant pericardial effusion")

    if extrathoracic_count == 1:
        m_category, stage_group = "M1b", "IVA"
        reasons = ["single extrathoracic metastasis"]
    elif extrathoracic_count > 1 and organ_system_count == 1:
        m_category, stage_group = "M1c1", "IVB"
        reasons = ["multiple extrathoracic metastases in one organ system"]
    elif extrathoracic_count > 1 and organ_system_count > 1:
        m_category, stage_group = "M1c2", "IVB"
        reasons = ["multiple extrathoracic metastases in multiple organ systems"]
    elif m1a_reasons:
        m_category, stage_group = "M1a", "IVA"
        reasons = m1a_reasons
    elif evidence.get("distant_metastasis_assessment_complete") is True:
        m_category, stage_group = "M0", None
        reasons = ["no accepted distant metastatic evidence"]
    else:
        m_category, stage_group = "M_indeterminate", None
        reasons = ["distant metastasis assessment is incomplete"]

    probability = payload.get("model_support", {}).get("m_positive_probability")
    probability = float(probability) if probability is not None else None
    review_threshold = float(payload.get("model_support", {}).get("review_threshold", 0.38))
    rule_positive = m_category in {"M1a", "M1b", "M1c1", "M1c2"}
    model_positive = probability is not None and probability >= review_threshold
    discordance = None
    if probability is not None and rule_positive != model_positive:
        discordance = "rule_positive_model_lower" if rule_positive else "rule_nonpositive_model_review"

    return {
        "patient_id": payload.get("patient_id"),
        "m_candidate": m_category,
        "stage_group_if_m_positive": stage_group,
        "rule_positive": rule_positive,
        "evidence": {
            "reasons": reasons,
            "accepted_extrathoracic_lesion_count": extrathoracic_count,
            "organ_system_count": organ_system_count,
            "organ_counts": dict(sorted(organ_counts.items())),
            "m1a_reasons": m1a_reasons,
        },
        "model_support": {
            "m_positive_probability": probability,
            "review_threshold": review_threshold,
            "model_review_positive": model_positive if probability is not None else None,
        },
        "discordance_flag": discordance,
        "review_required": m_category != "M0" or model_positive,
        "finalization_status": "physician_review_required",
        "warning": "Rule output is a cM candidate, not a physician-confirmed final stage.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Lung cancer TNM9 M rule engine")
    parser.add_argument("input_json", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    payload = json.loads(args.input_json.read_text(encoding="utf-8-sig"))
    result = classify_m(payload)
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text)


if __name__ == "__main__":
    main()
