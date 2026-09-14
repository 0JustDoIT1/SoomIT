from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


VALID_T = {"TX", "T0", "TIS", "T1MI", "T1A", "T1B", "T1C", "T1", "T2A", "T2B", "T2", "T3", "T4"}
VALID_N = {"NX", "N0", "N1", "N2", "N2A", "N2B", "N3"}
VALID_M = {"M0", "M1", "M1A", "M1B", "M1C", "M1C1", "M1C2", "M_INDETERMINATE"}


def normalize(value: Any) -> str:
    return str(value).strip().upper().replace(" ", "")


def display_category(value: str) -> str:
    suffixes = {
        "TIS": "Tis",
        "T1MI": "T1mi",
        "M1C1": "M1c1",
        "M1C2": "M1c2",
        "M_INDETERMINATE": "M_indeterminate",
    }
    if value in suffixes:
        return suffixes[value]
    if value and value[-1:] in {"A", "B", "C"}:
        return value[:-1] + value[-1].lower()
    return value


def m0_stage(t: str, n: str) -> tuple[str | None, str | None]:
    if t == "TX" and n == "N0":
        return "Occult carcinoma", None
    if t == "TIS" and n == "N0":
        return "0", None
    if t in {"T1MI", "T1A"} and n == "N0":
        return "IA1", None
    if t == "T1B" and n == "N0":
        return "IA2", None
    if t == "T1C" and n == "N0":
        return "IA3", None
    if t == "T1" and n == "N0":
        return None, "T1 subtype is required for Stage IA1/IA2/IA3"
    if t == "T2A" and n == "N0":
        return "IB", None
    if t == "T2B" and n == "N0":
        return "IIA", None
    if t == "T2" and n == "N0":
        return None, "T2 subtype is required to distinguish Stage IB from IIA"
    if t in {"T1", "T1MI", "T1A", "T1B", "T1C"} and n == "N1":
        return "IIA", None
    if t == "T3" and n == "N0":
        return "IIB", None
    if t in {"T1", "T1MI", "T1A", "T1B", "T1C"} and n == "N2A":
        return "IIB", None
    if t in {"T2", "T2A", "T2B"} and n == "N1":
        return "IIB", None
    if t == "T4" and n == "N0":
        return "IIIA", None
    if t in {"T3", "T4"} and n == "N1":
        return "IIIA", None
    if t in {"T1", "T1MI", "T1A", "T1B", "T1C"} and n == "N2B":
        return "IIIA", None
    if t in {"T2", "T2A", "T2B", "T3"} and n == "N2A":
        return "IIIA", None
    if t in {"T2", "T2A", "T2B", "T3"} and n == "N2B":
        return "IIIB", None
    if t == "T4" and n in {"N2A", "N2B"}:
        return "IIIB", None
    if t in {"T1", "T1MI", "T1A", "T1B", "T1C", "T2", "T2A", "T2B"} and n == "N3":
        return "IIIB", None
    if t in {"T3", "T4"} and n == "N3":
        return "IIIC", None
    if n == "N2":
        return None, "N2 must be subdivided into N2a or N2b for TNM9 stage grouping"
    if n == "NX":
        return None, "Regional lymph nodes cannot be assessed"
    if t in {"TX", "T0"}:
        return None, "Primary tumor category does not produce a standard stage group for this combination"
    return None, "Unsupported or incomplete T/N/M0 combination"


def stage_group(t_value: Any, n_value: Any, m_value: Any) -> dict[str, Any]:
    t, n, m = normalize(t_value), normalize(n_value), normalize(m_value)
    errors = []
    if t not in VALID_T:
        errors.append(f"Unsupported T category: {t}")
    if n not in VALID_N:
        errors.append(f"Unsupported N category: {n}")
    if m not in VALID_M:
        errors.append(f"Unsupported M category: {m}")
    if errors:
        return result(t, n, m, None, errors)

    if m in {"M1A", "M1B"}:
        return result(t, n, m, "IVA", [])
    if m in {"M1C1", "M1C2"}:
        return result(t, n, m, "IVB", [])
    if m in {"M1", "M1C"}:
        return result(t, n, m, None, ["M subtype is required to distinguish Stage IVA from IVB"])
    if m == "M_INDETERMINATE":
        return result(t, n, m, None, ["M assessment is incomplete"])

    stage, warning = m0_stage(t, n)
    return result(t, n, m, stage, [warning] if warning else [])


def result(t: str, n: str, m: str, stage: str | None, warnings: list[str]) -> dict[str, Any]:
    t_display, n_display, m_display = map(display_category, (t, n, m))
    return {
        "t_candidate": t_display,
        "n_candidate": n_display,
        "m_candidate": m_display,
        "ctnm_candidate": f"c{t_display}{n_display}{m_display}",
        "stage_group_candidate": stage,
        "stage_group_status": "candidate_ready" if stage else "indeterminate",
        "warnings": warnings,
        "finalization_status": "physician_review_required",
        "clinical_use_warning": "The output is a project cTNM candidate and does not replace physician staging.",
    }


def integrate(payload: dict[str, Any]) -> dict[str, Any]:
    output = stage_group(payload.get("t_candidate"), payload.get("n_candidate"), payload.get("m_candidate"))
    output["patient_id"] = payload.get("patient_id")
    output["component_evidence"] = payload.get("component_evidence", {})
    output["discordance_flags"] = payload.get("discordance_flags", [])
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Lung cancer TNM9 stage-group engine")
    parser.add_argument("input_json", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    payload = json.loads(args.input_json.read_text(encoding="utf-8-sig"))
    text = json.dumps(integrate(payload), ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text)


if __name__ == "__main__":
    main()
