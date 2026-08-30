import uuid

from django.db import models
from django.db.models import Q

from apps.cases.models import LungCancerCase, CaseImageAsset
from apps.common.models import CreatedOnlyUUIDModel


class AnalysisType(models.TextChoices):
    XRAY_SCREENING = "XRAY_SCREENING", "X-ray 선별"
    CT_NODULE = "CT_NODULE", "CT 결절분석"
    SPECIMEN_ADEQUACY = "SPECIMEN_ADEQUACY", "검체 적정성"
    PATHOLOGY_DIAGNOSIS = "PATHOLOGY_DIAGNOSIS", "병리 진단"
    TNM_STAGING = "TNM_STAGING", "TNM 병기"
    GENE_PREDICTION = "GENE_PREDICTION", "유전자 예측"
    TREATMENT_RECOMMENDATION = "TREATMENT_RECOMMENDATION", "치료 추천"


# ── 10-1. model_versions (여기서 먼저 정의: ai_analyses가 참조) ──
class ModelVersion(CreatedOnlyUUIDModel):
    model_name = models.CharField(max_length=100)
    version = models.CharField(max_length=50)
    analysis_type = models.CharField(max_length=30, choices=AnalysisType.choices)
    components = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "model_versions"
        constraints = [
            models.UniqueConstraint(fields=["model_name", "version"], name="uq_model_name_version"),
        ]

    def __str__(self):
        return f"{self.model_name} v{self.version}"


# ── 4-1. ai_analyses ────────────────────────────────────────────
# 스펙: created_at만 존재(updated_at 없음) → CreatedOnlyUUIDModel 사용
class AiAnalysis(CreatedOnlyUUIDModel):
    class Status(models.TextChoices):
        PENDING = "PENDING", "대기"
        RUNNING = "RUNNING", "실행중"
        SUCCEEDED = "SUCCEEDED", "성공"
        FAILED = "FAILED", "실패"

    case = models.ForeignKey(LungCancerCase, on_delete=models.PROTECT, related_name="ai_analyses")
    source_image_asset = models.ForeignKey(
        CaseImageAsset, on_delete=models.PROTECT, null=True, blank=True, related_name="ai_analyses"
    )
    analysis_type = models.CharField(max_length=30, choices=AnalysisType.choices)
    model_version = models.ForeignKey(ModelVersion, on_delete=models.PROTECT, related_name="ai_analyses")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    input_metadata = models.JSONField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "ai_analyses"


# ── 4-2. ai_results ──────────────────────────────────────────────
class AiResult(CreatedOnlyUUIDModel):
    ai_analysis = models.OneToOneField(AiAnalysis, on_delete=models.PROTECT, related_name="ai_result")
    schema_version = models.CharField(max_length=30)
    result_payload = models.JSONField()
    result_files = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "ai_results"


# ── 4-3. xray_ai_results ────────────────────────────────────────
class XrayAiResult(models.Model):
    class Assessment(models.TextChoices):
        NEGATIVE = "NEGATIVE", "음성"
        SUSPICIOUS = "SUSPICIOUS", "의심"
        INDETERMINATE = "INDETERMINATE", "판정불가"

    ai_result = models.OneToOneField(
        AiResult, on_delete=models.CASCADE, primary_key=True, db_column="ai_result_id", related_name="xray_detail"
    )
    assessment = models.CharField(max_length=15, choices=Assessment.choices)
    suspicion_score = models.DecimalField(max_digits=5, decimal_places=4, null=True, blank=True)

    class Meta:
        db_table = "xray_ai_results"
        constraints = [
            models.CheckConstraint(
                check=Q(suspicion_score__gte=0) & Q(suspicion_score__lte=1), name="ck_xray_ai_score_0_1"
            ),
        ]


# ── 4-4. ct_ai_results ──────────────────────────────────────────
class CtAiResult(models.Model):
    ai_result = models.OneToOneField(
        AiResult, on_delete=models.CASCADE, primary_key=True, db_column="ai_result_id", related_name="ct_detail"
    )
    overall_malignancy_risk = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    class Meta:
        db_table = "ct_ai_results"
        constraints = [
            models.CheckConstraint(
                check=Q(overall_malignancy_risk__gte=0) & Q(overall_malignancy_risk__lte=100),
                name="ck_ct_ai_malig_0_100",
            ),
        ]


# ── 4-5. nodule_ai_results ──────────────────────────────────────
class NoduleAiResult(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ct_ai_result = models.ForeignKey(
        CtAiResult, on_delete=models.CASCADE, related_name="nodule_results"
    )
    nodule_no = models.SmallIntegerField()
    detection_confidence = models.DecimalField(max_digits=5, decimal_places=4, null=True, blank=True)
    malignancy_risk = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    finding_payload = models.JSONField()

    class Meta:
        db_table = "nodule_ai_results"
        constraints = [
            models.UniqueConstraint(fields=["ct_ai_result", "nodule_no"], name="uq_nodule_ai_ct_no"),
            models.CheckConstraint(
                check=Q(detection_confidence__gte=0) & Q(detection_confidence__lte=1),
                name="ck_nodule_ai_conf_0_1",
            ),
            models.CheckConstraint(
                check=Q(malignancy_risk__gte=0) & Q(malignancy_risk__lte=100), name="ck_nodule_ai_malig_0_100"
            ),
        ]


# ── 4-6. specimen_adequacy_ai_results ───────────────────────────
class SpecimenAdequacyAiResult(models.Model):
    class AdequacyStatus(models.TextChoices):
        ADEQUATE = "ADEQUATE", "적정"
        INADEQUATE = "INADEQUATE", "부적정"
        INDETERMINATE = "INDETERMINATE", "판정불가"

    ai_result = models.OneToOneField(
        AiResult, on_delete=models.CASCADE, primary_key=True, db_column="ai_result_id",
        related_name="specimen_adequacy_detail",
    )
    adequacy_status = models.CharField(max_length=15, choices=AdequacyStatus.choices)
    tumor_cell_ratio = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    confidence = models.DecimalField(max_digits=5, decimal_places=4, null=True, blank=True)

    class Meta:
        db_table = "specimen_adequacy_ai_results"
        constraints = [
            models.CheckConstraint(
                check=Q(tumor_cell_ratio__gte=0) & Q(tumor_cell_ratio__lte=100), name="ck_spec_ai_ratio_0_100"
            ),
            models.CheckConstraint(
                check=Q(confidence__gte=0) & Q(confidence__lte=1), name="ck_spec_ai_conf_0_1"
            ),
        ]


# ── 4-7. pathology_ai_results ───────────────────────────────────
class PathologyAiResult(models.Model):
    class MalignancyAssessment(models.TextChoices):
        BENIGN = "BENIGN", "양성"
        MALIGNANT = "MALIGNANT", "악성"
        INDETERMINATE = "INDETERMINATE", "판정불가"

    ai_result = models.OneToOneField(
        AiResult, on_delete=models.CASCADE, primary_key=True, db_column="ai_result_id",
        related_name="pathology_detail",
    )
    malignancy_assessment = models.CharField(max_length=15, choices=MalignancyAssessment.choices)
    malignancy_probability = models.DecimalField(max_digits=5, decimal_places=4, null=True, blank=True)
    predicted_histologic_type = models.CharField(max_length=100, null=True, blank=True)
    predicted_subtype = models.CharField(max_length=100, null=True, blank=True)
    subtype_confidence = models.DecimalField(max_digits=5, decimal_places=4, null=True, blank=True)

    class Meta:
        db_table = "pathology_ai_results"
        constraints = [
            models.CheckConstraint(
                check=Q(malignancy_probability__gte=0) & Q(malignancy_probability__lte=1),
                name="ck_path_ai_prob_0_1",
            ),
            models.CheckConstraint(
                check=Q(subtype_confidence__gte=0) & Q(subtype_confidence__lte=1),
                name="ck_path_ai_subtype_conf_0_1",
            ),
        ]


# ── 4-8. tnm_ai_results ─────────────────────────────────────────
class TnmAiResult(models.Model):
    ai_result = models.OneToOneField(
        AiResult, on_delete=models.CASCADE, primary_key=True, db_column="ai_result_id", related_name="tnm_detail"
    )
    predicted_t = models.CharField(max_length=10, null=True, blank=True)
    predicted_n = models.CharField(max_length=10, null=True, blank=True)
    predicted_m = models.CharField(max_length=10, null=True, blank=True)
    predicted_stage_group = models.CharField(max_length=20, null=True, blank=True)
    confidence = models.DecimalField(max_digits=5, decimal_places=4, null=True, blank=True)

    class Meta:
        db_table = "tnm_ai_results"
        constraints = [
            models.CheckConstraint(check=Q(confidence__gte=0) & Q(confidence__lte=1), name="ck_tnm_ai_conf_0_1"),
        ]


# ── 4-9. gene_ai_results ────────────────────────────────────────
class GeneAiResult(models.Model):
    class PredictedStatus(models.TextChoices):
        PREDICTED_POSITIVE = "PREDICTED_POSITIVE", "양성 예측"
        PREDICTED_NEGATIVE = "PREDICTED_NEGATIVE", "음성 예측"
        INDETERMINATE = "INDETERMINATE", "판정불가"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ai_result = models.ForeignKey(AiResult, on_delete=models.CASCADE, related_name="gene_ai_results")
    gene_symbol = models.CharField(max_length=30)
    predicted_status = models.CharField(max_length=20, choices=PredictedStatus.choices)
    predicted_probability = models.DecimalField(max_digits=5, decimal_places=4, null=True, blank=True)

    class Meta:
        db_table = "gene_ai_results"
        constraints = [
            models.UniqueConstraint(fields=["ai_result", "gene_symbol"], name="uq_gene_ai_result_symbol"),
            models.CheckConstraint(
                check=Q(predicted_probability__gte=0) & Q(predicted_probability__lte=1),
                name="ck_gene_ai_prob_0_1",
            ),
        ]


# ── 4-10. treatment_ai_results ──────────────────────────────────
class TreatmentAiResult(models.Model):
    ai_result = models.OneToOneField(
        AiResult, on_delete=models.CASCADE, primary_key=True, db_column="ai_result_id",
        related_name="treatment_detail",
    )
    overall_opinion = models.TextField()
    recommended_plan = models.TextField()
    targeted_therapy_recommendation = models.TextField(null=True, blank=True)
    prescription_draft = models.JSONField(null=True, blank=True)
    rationale = models.TextField(null=True, blank=True)
    evidence = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "treatment_ai_results"
