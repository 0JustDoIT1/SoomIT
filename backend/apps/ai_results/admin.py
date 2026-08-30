from django.contrib import admin

from .models import (
    ModelVersion, AiAnalysis, AiResult, XrayAiResult, CtAiResult,
    NoduleAiResult, SpecimenAdequacyAiResult, PathologyAiResult,
    TnmAiResult, GeneAiResult, TreatmentAiResult,
)


@admin.register(ModelVersion)
class ModelVersionAdmin(admin.ModelAdmin):
    list_display = ("model_name", "version", "analysis_type")
    list_filter = ("analysis_type",)


@admin.register(AiAnalysis)
class AiAnalysisAdmin(admin.ModelAdmin):
    list_display = ("case", "analysis_type", "status", "model_version", "completed_at")
    list_filter = ("analysis_type", "status")


admin.site.register(AiResult)
admin.site.register(XrayAiResult)
admin.site.register(CtAiResult)
admin.site.register(NoduleAiResult)
admin.site.register(SpecimenAdequacyAiResult)
admin.site.register(PathologyAiResult)
admin.site.register(TnmAiResult)
admin.site.register(GeneAiResult)
admin.site.register(TreatmentAiResult)