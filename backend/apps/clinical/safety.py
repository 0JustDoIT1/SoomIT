import json
from dataclasses import dataclass

from apps.patients.models import CurrentMedication, LabResult, PatientHealthProfile


SAFETY_SNAPSHOT_SOURCE_CODE = "SAFETY_INPUT_SNAPSHOT"


class SafetyFreshness:
    NOT_RUN = "NOT_RUN"
    CURRENT = "CURRENT"
    RECHECK_REQUIRED = "RECHECK_REQUIRED"


@dataclass(frozen=True)
class SafetyFreshnessEvaluation:
    status: str
    reason: str | None = None


def explicit_item_seq(obj):
    value = getattr(obj, "mfds_item_seq", None)
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value if value.isdigit() else None


def build_safety_input_snapshot(*, items, medications, patient_profile, latest_lab):
    return {
        "prescription_items": sorted([
            {
                "id": str(getattr(item, "id", "")),
                "final_dose": str(getattr(item, "final_dose", None)),
                "mfds_item_seq": explicit_item_seq(item),
            }
            for item in items
        ], key=lambda row: row["id"]),
        "current_medications": sorted([
            {
                "id": str(getattr(medication, "id", "")),
                "medication_name": getattr(medication, "medication_name", None),
                "ingredient_name": getattr(medication, "ingredient_name", None),
                "mfds_item_seq": explicit_item_seq(medication),
            }
            for medication in medications
        ], key=lambda row: row["id"]),
        "profile": {
            "exists": patient_profile is not None,
            "allergies": getattr(patient_profile, "allergies", None) if patient_profile is not None else None,
            "allergy_status": getattr(patient_profile, "allergy_status", None) if patient_profile is not None else None,
        },
        "latest_lab": None if latest_lab is None else {
            "id": str(getattr(latest_lab, "id", "")),
            "tested_at": str(getattr(latest_lab, "tested_at", "")),
            "creatinine": str(getattr(latest_lab, "creatinine", None)),
            "egfr": str(getattr(latest_lab, "egfr", None)),
            "ast": str(getattr(latest_lab, "ast", None)),
            "alt": str(getattr(latest_lab, "alt", None)),
            "total_bilirubin": str(getattr(latest_lab, "total_bilirubin", None)),
        },
    }


def compare_safety_snapshot(*, saved_message, current_snapshot, inputs_changed=False):
    try:
        saved_snapshot = json.loads(saved_message or "")
    except (TypeError, ValueError):
        return SafetyFreshnessEvaluation(
            SafetyFreshness.RECHECK_REQUIRED,
            "SNAPSHOT_INVALID",
        )
    if saved_snapshot != current_snapshot or inputs_changed:
        return SafetyFreshnessEvaluation(
            SafetyFreshness.RECHECK_REQUIRED,
            "INPUTS_CHANGED",
        )
    return SafetyFreshnessEvaluation(SafetyFreshness.CURRENT)


def evaluate_prescription_safety_freshness(prescription, *, items=None):
    safety_results = list(prescription.safety_check_results.all())
    snapshot_result = next(
        (
            result for result in sorted(
                safety_results,
                key=lambda result: result.checked_at,
                reverse=True,
            )
            if result.source_code == SAFETY_SNAPSHOT_SOURCE_CODE
        ),
        None,
    )
    if snapshot_result is None:
        if prescription.prescription_status == "DRAFT" and not safety_results:
            return SafetyFreshnessEvaluation(SafetyFreshness.NOT_RUN)
        return SafetyFreshnessEvaluation(
            SafetyFreshness.RECHECK_REQUIRED,
            "SNAPSHOT_MISSING",
        )

    patient = prescription.case.patient
    current_profile = PatientHealthProfile.objects.filter(patient=patient).first()
    current_medications = list(
        CurrentMedication.objects.filter(patient=patient, is_active=True).select_related("drug")
    )
    current_lab = LabResult.objects.filter(patient=patient).order_by("-tested_at").first()
    current_snapshot = build_safety_input_snapshot(
        items=list(prescription.items.all()) if items is None else items,
        medications=current_medications,
        patient_profile=current_profile,
        latest_lab=current_lab,
    )

    latest_checked_at = max(result.checked_at for result in safety_results)
    inputs_changed = (
        CurrentMedication.objects.filter(
            patient=patient,
            updated_at__gt=latest_checked_at,
        ).exists()
        or PatientHealthProfile.objects.filter(
            patient=patient,
            updated_at__gt=latest_checked_at,
        ).exists()
        or LabResult.objects.filter(
            patient=patient,
            updated_at__gt=latest_checked_at,
        ).exists()
    )
    return compare_safety_snapshot(
        saved_message=snapshot_result.message,
        current_snapshot=current_snapshot,
        inputs_changed=inputs_changed,
    )
