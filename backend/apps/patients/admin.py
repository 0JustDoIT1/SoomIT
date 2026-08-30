from django.contrib import admin

from .models import (
    Patient, PatientHealthProfile, PatientAccount, SocialAccount,
    PatientQuestionnaire, Appointment, MedicationSchedule,
    MedicationScheduleItem, MedicationIntakeLog, SymptomLog,
)


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ("name", "patient_code", "hospital", "birth_date", "sex")
    list_filter = ("hospital", "sex")
    search_fields = ("name", "patient_code", "phone_number")


@admin.register(PatientHealthProfile)
class PatientHealthProfileAdmin(admin.ModelAdmin):
    list_display = ("patient", "smoking_status", "height_cm", "weight_kg")


@admin.register(PatientAccount)
class PatientAccountAdmin(admin.ModelAdmin):
    list_display = ("phone_number", "patient", "link_status", "linked_at")
    list_filter = ("link_status",)


@admin.register(SocialAccount)
class SocialAccountAdmin(admin.ModelAdmin):
    list_display = ("patient_account", "provider", "linked_at")
    list_filter = ("provider",)


@admin.register(PatientQuestionnaire)
class PatientQuestionnaireAdmin(admin.ModelAdmin):
    list_display = ("patient", "case", "questionnaire_type", "is_completed")
    list_filter = ("is_completed", "questionnaire_type")


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ("patient", "scheduled_at", "appointment_status", "visit_status", "doctor")
    list_filter = ("appointment_status", "visit_status", "created_by_type")
    date_hierarchy = "scheduled_at"


@admin.register(MedicationSchedule)
class MedicationScheduleAdmin(admin.ModelAdmin):
    list_display = ("patient_account", "prescription", "reminder_time", "enabled")
    list_filter = ("enabled",)


@admin.register(MedicationScheduleItem)
class MedicationScheduleItemAdmin(admin.ModelAdmin):
    list_display = ("medication_schedule", "prescription_item")


@admin.register(MedicationIntakeLog)
class MedicationIntakeLogAdmin(admin.ModelAdmin):
    list_display = ("medication_schedule", "scheduled_at", "status", "taken_at")
    list_filter = ("status",)


@admin.register(SymptomLog)
class SymptomLogAdmin(admin.ModelAdmin):
    list_display = ("patient", "symptom_type", "severity", "risk_level", "logged_at")
    list_filter = ("risk_level", "symptom_type")