import json
from datetime import date

from apps.clinical.models import ClinicalResult
from apps.clinical.serializers import DoctorClinicalResultSerializer
from apps.knowledge.services.medgemma_client import request_chat_completion


class NoConfirmedClinicalResults(RuntimeError):
    pass


SYSTEM_PROMPT = (
    "You draft a concise integrated clinical opinion for a licensed clinician. "
    "Use only the confirmed clinical results supplied by the application. "
    "Separate observed facts from interpretation, state important uncertainty, "
    "and never invent a diagnosis, stage, biomarker, or treatment. "
    "This is a draft for clinician review and must not be presented as a final decision. "
    "Respond in Korean unless the instruction explicitly requests another language."
)


def _age_on(birth_date, today=None):
    if birth_date is None:
        return None
    today = today or date.today()
    return today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))


def _confirmed_results(case):
    return list(
        ClinicalResult.objects.filter(
            case=case,
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
        )
        .select_related(
            "xray_detail",
            "ct_detail",
            "pathology_detail",
            "tnm_detail",
            "gene_detail",
            "pdl1_detail",
            "treatment_detail__selected_regimen",
        )
        .prefetch_related("gene_detail__gene_findings")
        .order_by("stage", "-confirmed_at")
    )


def generate_medical_opinion(case, instruction="임상 결과를 종합한 간결한 소견 초안을 작성해주세요."):
    results = _confirmed_results(case)
    if not results:
        raise NoConfirmedClinicalResults("확정된 임상 결과가 없어 소견을 생성할 수 없습니다.")

    patient = case.patient
    health_profile = getattr(patient, "health_profile", None)
    payload = {
        "case": {
            "current_workflow_stage": case.current_stage,
            "status": case.case_status,
        },
        "patient_context": {
            "age": _age_on(patient.birth_date),
            "sex": patient.sex,
            "smoking_status": getattr(health_profile, "smoking_status", None),
            "allergies": getattr(health_profile, "allergies", []),
            "comorbidities": getattr(health_profile, "comorbidities", []),
        },
        "confirmed_clinical_results": DoctorClinicalResultSerializer(results, many=True).data,
    }

    opinion = request_chat_completion(
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"작성 요청:\n{instruction}\n\n"
                    "비식별 임상 데이터:\n"
                    f"{json.dumps(payload, ensure_ascii=False, default=str)}"
                ),
            },
        ],
        max_tokens=600,
        temperature=0,
    )

    return {
        "opinion": opinion,
        "source_results": [
            {
                "id": str(result.id),
                "stage": result.stage,
                "confirmed_at": result.confirmed_at,
            }
            for result in results
        ],
    }
