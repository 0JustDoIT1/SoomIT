from django.http import Http404
from rest_framework import status
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import APIException, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cases.models import ExaminationOrder, LungCancerCase
from apps.clinical.models import ClinicalResult, Prescription, TreatmentDecision
from apps.clinical.serializers import PatientClinicalResultSerializer
from apps.knowledge.permissions import IsAIService

from .models import (
    Appointment,
    CurrentMedication,
    LabResult,
    MedicationIntakeLog,
    MedicationSchedule,
    PatientAccount,
    SymptomLog,
)
from .patient_tokens import decode_patient_access_token
from .serializers import (
    AppointmentSerializer,
    LabResultSerializer,
    MedicationIntakeLogSerializer,
    MedicationScheduleSerializer,
    PatientProfileSerializer,
    SymptomLogSerializer,
)


class PatientContextAuthenticationFailed(APIException):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_detail = "Patient authentication failed."
    default_code = "patient_authentication_failed"


def _authenticated_patient(request):
    raw_token = request.headers.get("X-Patient-Access-Token", "").strip()
    if not raw_token:
        raise PatientContextAuthenticationFailed("Patient access token is required.")
    try:
        token_data = decode_patient_access_token(raw_token)
    except ValueError as exc:
        raise PatientContextAuthenticationFailed(str(exc)) from exc

    account = (
        PatientAccount.objects.select_related("patient", "patient__hospital")
        .filter(id=token_data["patient_account_id"])
        .first()
    )
    if account is None:
        raise PatientContextAuthenticationFailed("Patient account was not found.")
    if account.link_status != PatientAccount.LinkStatus.LINKED or account.patient_id is None:
        raise PermissionDenied("A linked patient account is required.")
    return account, account.patient


def _doctor_payload(doctor):
    if doctor is None:
        return None
    return {"id": str(doctor.id), "name": doctor.name}


class _ServiceBearerChallengeAuthentication(BaseAuthentication):
    """Keep IsAIService as validator while preserving HTTP 401 semantics."""

    def authenticate(self, request):
        return None

    def authenticate_header(self, request):
        return "Bearer"


class PatientDataAIAPIView(APIView):
    """Read-only patient data endpoint for the trusted Genkit service."""

    authentication_classes = [_ServiceBearerChallengeAuthentication]
    permission_classes = [IsAIService]

    def get(self, request, resource):
        account, patient = _authenticated_patient(request)
        handlers = {
            "info": self._info,
            "case": self._case,
            "examinations": self._examinations,
            "appointments": self._appointments,
            "clinical-results": self._clinical_results,
            "treatment": self._treatment,
            "medications": self._medications,
            "symptoms": self._symptoms,
            "labs": self._labs,
        }
        handler = handlers.get(resource)
        if handler is None:
            raise Http404
        return Response(handler(account, patient), status=status.HTTP_200_OK)

    @staticmethod
    def _info(account, patient):
        profile = PatientProfileSerializer(patient).data
        return {
            "patient": {
                "patient_id": str(profile["id"]),
                "patient_code": profile["patient_code"],
                "name": profile["name"],
                "birth_date": profile["birth_date"],
                "sex": profile["sex"],
                "hospital": {
                    "id": str(patient.hospital_id),
                    "code": patient.hospital.code,
                    "name": profile["hospital_name"],
                },
                "patient_account": {
                    "linked": account.link_status == PatientAccount.LinkStatus.LINKED,
                    "link_status": profile["app_link_status"],
                },
            }
        }

    @staticmethod
    def _case(_account, patient):
        case = (
            LungCancerCase.objects.select_related("primary_doctor")
            .filter(patient=patient, case_status=LungCancerCase.CaseStatus.ACTIVE)
            .order_by("-created_at")
            .first()
        )
        if case is None:
            return {"case": None}
        return {
            "case": {
                "case_id": str(case.id),
                "case_code": case.case_code,
                "current_stage": case.current_stage,
                "case_status": case.case_status,
                "primary_doctor": _doctor_payload(case.primary_doctor),
            }
        }

    @staticmethod
    def _examinations(_account, patient):
        orders = (
            ExaminationOrder.objects.filter(case__patient=patient)
            .select_related("requesting_doctor")
            .prefetch_related("appointments__doctor")
            .order_by("-created_at")[:50]
        )
        examinations = []
        for order in orders:
            appointments = sorted(order.appointments.all(), key=lambda item: item.scheduled_at, reverse=True)
            appointment = appointments[0] if appointments else None
            doctor = appointment.doctor if appointment and appointment.doctor else order.requesting_doctor
            examinations.append(
                {
                    "order_id": str(order.id),
                    "order_type": order.order_type,
                    "order_type_label": order.get_order_type_display(),
                    "status": order.status,
                    "purpose": order.purpose,
                    "scheduled_at": appointment.scheduled_at if appointment else None,
                    "doctor": _doctor_payload(doctor),
                    "completed": order.status == ExaminationOrder.Status.COMPLETED,
                }
            )
        return {"examinations": examinations}

    @staticmethod
    def _appointments(_account, patient):
        appointments = (
            Appointment.objects.filter(patient=patient)
            .select_related("patient__hospital", "doctor", "examination_order")
            .order_by("-scheduled_at")[:50]
        )
        return {"appointments": AppointmentSerializer(appointments, many=True).data}

    @staticmethod
    def _clinical_results(_account, patient):
        results = (
            ClinicalResult.objects.filter(
                case__patient=patient,
                result_status=ClinicalResult.ResultStatus.CONFIRMED,
            )
            .select_related(
                "xray_detail", "ct_detail", "pathology_detail", "gene_detail", "pdl1_detail", "tnm_detail"
            )
            .order_by("-confirmed_at", "-updated_at")[:50]
        )
        return {"clinical_results": PatientClinicalResultSerializer(results, many=True).data}

    @staticmethod
    def _treatment(_account, patient):
        decision = (
            TreatmentDecision.objects.filter(
                clinical_result__case__patient=patient,
                clinical_result__result_status=ClinicalResult.ResultStatus.CONFIRMED,
            )
            .select_related("clinical_result", "selected_regimen")
            .order_by("-clinical_result__confirmed_at", "-clinical_result__updated_at")
            .first()
        )
        if decision is None:
            return {"treatment": None}
        regimen = decision.selected_regimen
        return {
            "treatment": {
                "clinical_result_id": str(decision.clinical_result_id),
                "treatment_type": decision.treatment_type,
                "treatment_type_label": decision.get_treatment_type_display(),
                "treatment_plan": decision.treatment_plan,
                "targeted_therapy_plan": decision.targeted_therapy_plan,
                "rationale": decision.rationale,
                "regimen": (
                    {
                        "id": str(regimen.id),
                        "code": regimen.regimen_code,
                        "name": regimen.regimen_name,
                        "treatment_line": regimen.treatment_line,
                        "cycle_length_days": regimen.cycle_length_days,
                    }
                    if regimen
                    else None
                ),
                "confirmed_at": decision.clinical_result.confirmed_at,
            }
        }

    @staticmethod
    def _medications(account, patient):
        medications = []
        current = CurrentMedication.objects.filter(patient=patient, is_active=True).select_related("drug")
        for medication in current.order_by("-created_at")[:50]:
            medications.append(
                {
                    "type": "current_medication",
                    "id": str(medication.id),
                    "name": medication.medication_name,
                    "ingredient_name": medication.ingredient_name,
                    "dose": medication.dose,
                    "dose_unit": medication.dose_unit,
                    "frequency": medication.frequency,
                    "route": medication.route,
                    "started_at": medication.started_at,
                    "ended_at": medication.ended_at,
                    "note": medication.note,
                }
            )

        prescriptions = list(
            Prescription.objects.filter(
                case__patient=patient,
                prescription_status__in=[
                    Prescription.PrescriptionStatus.FINAL,
                    Prescription.PrescriptionStatus.COMPLETED,
                ],
            )
            .select_related("regimen")
            .prefetch_related("items__drug")
            .order_by("-prescribed_at")[:20]
        )
        schedules = list(
            MedicationSchedule.objects.filter(
                patient_account=account, prescription__in=prescriptions, enabled=True
            ).prefetch_related("items__prescription_item__drug")
        )
        schedules_by_prescription = {}
        for schedule in schedules:
            schedules_by_prescription.setdefault(schedule.prescription_id, []).append(schedule)
        for prescription in prescriptions:
            prescription_schedules = schedules_by_prescription.get(prescription.id, [])
            medications.append(
                {
                    "type": "prescription",
                    "id": str(prescription.id),
                    "status": prescription.prescription_status,
                    "regimen": {
                        "code": prescription.regimen.regimen_code,
                        "name": prescription.regimen.regimen_name,
                    },
                    "cycle_number": prescription.cycle_number,
                    "phase": prescription.phase,
                    "cycle_start_date": prescription.cycle_start_date,
                    "items": [
                        {
                            "id": str(item.id),
                            "drug_name": item.drug.drug_name,
                            "dose": item.final_dose,
                            "unit": item.unit,
                            "route": item.route,
                            "frequency": item.frequency,
                            "instructions": item.instructions,
                        }
                        for item in prescription.items.all()
                    ],
                    "schedules": MedicationScheduleSerializer(prescription_schedules, many=True).data,
                }
            )

        schedule_ids = [schedule.id for schedule in schedules]
        logs = (
            MedicationIntakeLog.objects.filter(medication_schedule_id__in=schedule_ids)
            .select_related("medication_schedule")
            .prefetch_related("medication_schedule__items__prescription_item__drug")
            .order_by("-scheduled_at")[:50]
        )
        if logs:
            medications.append({"type": "intake_history", "logs": MedicationIntakeLogSerializer(logs, many=True).data})
        return {"medications": medications}

    @staticmethod
    def _symptoms(_account, patient):
        symptoms = SymptomLog.objects.filter(patient=patient).order_by("-logged_at")[:20]
        return {"symptoms": SymptomLogSerializer(symptoms, many=True).data}

    @staticmethod
    def _labs(_account, patient):
        labs = LabResult.objects.filter(patient=patient).order_by("-tested_at")[:20]
        return {"labs": LabResultSerializer(labs, many=True).data}
