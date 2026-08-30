from django.contrib import admin

from .models import (
    ClinicalResult, XrayResult, CtResult, Nodule, NoduleObservation,
    SpecimenAdequacyResult, PathologyResult, TnmResult, GeneResult,
    GeneFinding, TreatmentDecision, CaseFinalResult,
    Drug, Regimen, RegimenDrug, TreatmentRule,
    Prescription, PrescriptionItem, SafetyCheckResult,
)


@admin.register(ClinicalResult)
class ClinicalResultAdmin(admin.ModelAdmin):
    list_display = ("case", "stage", "result_status", "confirmed_by_user", "confirmed_at")
    list_filter = ("stage", "result_status")


admin.site.register(XrayResult)
admin.site.register(CtResult)
admin.site.register(Nodule)
admin.site.register(NoduleObservation)
admin.site.register(SpecimenAdequacyResult)
admin.site.register(PathologyResult)
admin.site.register(TnmResult)
admin.site.register(GeneResult)
admin.site.register(GeneFinding)


@admin.register(TreatmentDecision)
class TreatmentDecisionAdmin(admin.ModelAdmin):
    list_display = ("clinical_result", "treatment_type", "ai_recommendation_action")
    list_filter = ("treatment_type", "ai_recommendation_action")


@admin.register(CaseFinalResult)
class CaseFinalResultAdmin(admin.ModelAdmin):
    list_display = ("case", "finalized_by_user", "finalized_at")


# ── 약물처방 마스터 데이터 ──
@admin.register(Drug)
class DrugAdmin(admin.ModelAdmin):
    list_display = ("drug_name", "ingredient_name", "route", "strength", "strength_unit", "atc_code")
    search_fields = ("drug_name", "ingredient_name", "atc_code")


@admin.register(Regimen)
class RegimenAdmin(admin.ModelAdmin):
    list_display = ("regimen_name", "regimen_code", "cancer_type", "histology", "cycle_length_days")
    list_filter = ("cancer_type",)
    search_fields = ("regimen_name", "regimen_code")


class RegimenDrugInline(admin.TabularInline):
    model = RegimenDrug
    extra = 1


@admin.register(RegimenDrug)
class RegimenDrugAdmin(admin.ModelAdmin):
    list_display = ("regimen", "drug", "dose", "dose_basis", "route", "administration_day", "phase")
    list_filter = ("phase", "dose_basis")


@admin.register(TreatmentRule)
class TreatmentRuleAdmin(admin.ModelAdmin):
    list_display = ("rule_code", "cancer_type", "histology", "regimen", "priority")
    list_filter = ("cancer_type",)
    ordering = ("rule_code", "priority")


@admin.register(Prescription)
class PrescriptionAdmin(admin.ModelAdmin):
    list_display = ("case", "regimen", "cycle_number", "phase", "prescription_status", "cycle_start_date")
    list_filter = ("prescription_status", "phase")


@admin.register(PrescriptionItem)
class PrescriptionItemAdmin(admin.ModelAdmin):
    list_display = ("prescription", "drug", "standard_dose", "calculated_dose", "final_dose", "route")


@admin.register(SafetyCheckResult)
class SafetyCheckResultAdmin(admin.ModelAdmin):
    list_display = ("prescription", "prescription_item", "check_type", "result", "checked_at")
    list_filter = ("check_type", "result")