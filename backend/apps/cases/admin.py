from django.contrib import admin

from .models import LungCancerCase, ClinicianDecision, ExaminationOrder, CaseImageAsset


@admin.register(LungCancerCase)
class LungCancerCaseAdmin(admin.ModelAdmin):
    list_display = ("case_code", "patient", "current_stage", "case_status", "primary_doctor")
    list_filter = ("current_stage", "case_status")
    search_fields = ("case_code", "patient__name")


@admin.register(ClinicianDecision)
class ClinicianDecisionAdmin(admin.ModelAdmin):
    list_display = ("case", "source_stage", "decision_type", "target_stage", "decided_by_user", "decided_at")
    list_filter = ("source_stage", "decision_type")


@admin.register(ExaminationOrder)
class ExaminationOrderAdmin(admin.ModelAdmin):
    list_display = ("case", "exam_type", "priority", "status", "requesting_doctor")
    list_filter = ("exam_type", "priority", "status")


@admin.register(CaseImageAsset)
class CaseImageAssetAdmin(admin.ModelAdmin):
    list_display = ("case", "image_type", "uploaded_stage", "storage_type", "status")
    list_filter = ("image_type", "storage_type", "status")