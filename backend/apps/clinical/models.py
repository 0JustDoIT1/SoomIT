import uuid

from django.db import models
from django.db.models import Q

from apps.accounts.models import User
from apps.cases.models import LungCancerCase, CaseImageAsset, Stage
from apps.ai_results.models import AiResult
from apps.common.models import TimestampedUUIDModel


# ── 5-1. clinical_results ───────────────────────────────────────
class ClinicalResult(TimestampedUUIDModel):
    class ResultStatus(models.TextChoices):
        DRAFT = "DRAFT", "작성중"
        CONFIRMED = "CONFIRMED", "확정"

    # stage: PRESCRIPTION 제외한 6개 (prescriptions는 treatment_decisions를 근거로 별도 테이블)
    STAGE_CHOICES = [c for c in Stage.choices if c[0] != "PRESCRIPTION"]

    case = models.ForeignKey(LungCancerCase, on_delete=models.PROTECT, related_name="clinical_results")
    stage = models.CharField(max_length=20, choices=STAGE_CHOICES)
    source_image_asset = models.ForeignKey(
        CaseImageAsset, on_delete=models.PROTECT, null=True, blank=True, related_name="clinical_results"
    )
    reviewed_ai_result = models.ForeignKey(
        AiResult, on_delete=models.PROTECT, null=True, blank=True, related_name="clinical_results"
    )
    result_status = models.CharField(max_length=10, choices=ResultStatus.choices, default=ResultStatus.DRAFT)
    confirmed_by_user = models.ForeignKey(
        User, on_delete=models.PROTECT, null=True, blank=True, related_name="confirmed_clinical_results"
    )
    confirmed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "clinical_results"


# ── 5-2. xray_results ───────────────────────────────────────────
class XrayResult(models.Model):
    class Assessment(models.TextChoices):
        NEGATIVE = "NEGATIVE", "음성"
        SUSPICIOUS = "SUSPICIOUS", "의심"
        INDETERMINATE = "INDETERMINATE", "판정불가"

    class RecommendedAction(models.TextChoices):
        NO_FURTHER_ACTION = "NO_FURTHER_ACTION", "추가조치없음"
        CHEST_CT = "CHEST_CT", "흉부CT권고"
        REPEAT_XRAY = "REPEAT_XRAY", "X-ray재검"

    clinical_result = models.OneToOneField(
        ClinicalResult, on_delete=models.CASCADE, primary_key=True, related_name="xray_detail"
    )
    assessment = models.CharField(max_length=15, choices=Assessment.choices)
    finding_summary = models.TextField(null=True, blank=True)
    recommended_action = models.CharField(max_length=20, choices=RecommendedAction.choices)

    class Meta:
        db_table = "xray_results"


# ── 5-3. ct_results ─────────────────────────────────────────────
class CtResult(models.Model):
    class OverallAssessment(models.TextChoices):
        NO_NODULE = "NO_NODULE", "결절없음"
        NODULE_DETECTED = "NODULE_DETECTED", "결절발견"
        INDETERMINATE = "INDETERMINATE", "판정불가"

    clinical_result = models.OneToOneField(
        ClinicalResult, on_delete=models.CASCADE, primary_key=True, related_name="ct_detail"
    )
    overall_assessment = models.CharField(max_length=20, choices=OverallAssessment.choices)
    overall_malignancy_risk = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    finding_summary = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "ct_results"
        constraints = [
            models.CheckConstraint(
                check=Q(overall_malignancy_risk__gte=0) & Q(overall_malignancy_risk__lte=100),
                name="ck_ct_result_malig_0_100",
            ),
        ]


# ── 5-4. nodules ─────────────────────────────────────────────────
class Nodule(TimestampedUUIDModel):
    class TrackingStatus(models.TextChoices):
        TRACKING = "TRACKING", "추적중"
        RESOLVED = "RESOLVED", "해소됨"

    case = models.ForeignKey(LungCancerCase, on_delete=models.PROTECT, related_name="nodules")
    nodule_no = models.SmallIntegerField()
    tracking_status = models.CharField(max_length=10, choices=TrackingStatus.choices, default=TrackingStatus.TRACKING)

    class Meta:
        db_table = "nodules"
        constraints = [
            models.UniqueConstraint(fields=["case", "nodule_no"], name="uq_nodule_case_no"),
        ]


# ── 5-5. nodule_observations ────────────────────────────────────
class NoduleObservation(TimestampedUUIDModel):
    class Lobe(models.TextChoices):
        RUL = "RUL", "우상엽"
        RML = "RML", "우중엽"
        RLL = "RLL", "우하엽"
        LUL = "LUL", "좌상엽"
        LLL = "LLL", "좌하엽"
        UNKNOWN = "UNKNOWN", "미상"

    class PresenceFlag(models.TextChoices):
        PRESENT = "PRESENT", "있음"
        ABSENT = "ABSENT", "없음"
        INDETERMINATE = "INDETERMINATE", "판정불가"

    nodule = models.ForeignKey(Nodule, on_delete=models.PROTECT, related_name="observations")
    ct_result = models.ForeignKey(CtResult, on_delete=models.PROTECT, related_name="nodule_observations")
    lobe = models.CharField(max_length=10, choices=Lobe.choices, null=True, blank=True)
    location_description = models.CharField(max_length=255, null=True, blank=True)
    max_diameter_mm = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    volume_mm3 = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    surface_area_mm2 = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    sphericity = models.DecimalField(max_digits=5, decimal_places=4, null=True, blank=True)
    spiculation = models.CharField(max_length=15, choices=PresenceFlag.choices, null=True, blank=True)
    lobulation = models.CharField(max_length=15, choices=PresenceFlag.choices, null=True, blank=True)
    malignancy_risk = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    class Meta:
        db_table = "nodule_observations"
        constraints = [
            models.UniqueConstraint(fields=["nodule", "ct_result"], name="uq_nodule_obs_nodule_ctresult"),
            models.CheckConstraint(check=Q(max_diameter_mm__gte=0), name="ck_nodobs_diameter_ge0"),
            models.CheckConstraint(check=Q(volume_mm3__gte=0), name="ck_nodobs_volume_ge0"),
            models.CheckConstraint(check=Q(surface_area_mm2__gte=0), name="ck_nodobs_surface_ge0"),
            models.CheckConstraint(
                check=Q(sphericity__gte=0) & Q(sphericity__lte=1), name="ck_nodobs_sphericity_0_1"
            ),
            models.CheckConstraint(
                check=Q(malignancy_risk__gte=0) & Q(malignancy_risk__lte=100), name="ck_nodobs_malig_0_100"
            ),
        ]


# ── 5-6. specimen_adequacy_results ──────────────────────────────
class SpecimenAdequacyResult(models.Model):
    class AdequacyStatus(models.TextChoices):
        ADEQUATE = "ADEQUATE", "적정"
        INADEQUATE = "INADEQUATE", "부적정"
        INDETERMINATE = "INDETERMINATE", "판정불가"

    clinical_result = models.OneToOneField(
        ClinicalResult, on_delete=models.CASCADE, primary_key=True, related_name="specimen_adequacy_detail"
    )
    adequacy_status = models.CharField(max_length=15, choices=AdequacyStatus.choices)
    tumor_cell_ratio = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    reason = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "specimen_adequacy_results"
        constraints = [
            models.CheckConstraint(
                check=Q(tumor_cell_ratio__gte=0) & Q(tumor_cell_ratio__lte=100), name="ck_spec_result_ratio_0_100"
            ),
        ]


# ── 5-7. pathology_results ──────────────────────────────────────
class PathologyResult(models.Model):
    class MalignancyStatus(models.TextChoices):
        BENIGN = "BENIGN", "양성"
        MALIGNANT = "MALIGNANT", "악성"
        INDETERMINATE = "INDETERMINATE", "판정불가"

    clinical_result = models.OneToOneField(
        ClinicalResult, on_delete=models.CASCADE, primary_key=True, related_name="pathology_detail"
    )
    malignancy_status = models.CharField(max_length=15, choices=MalignancyStatus.choices)
    histologic_type = models.CharField(max_length=100, null=True, blank=True)
    subtype = models.CharField(max_length=100, null=True, blank=True)
    diagnosis_summary = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "pathology_results"


# ── 5-8. tnm_results ────────────────────────────────────────────
class TnmResult(models.Model):
    clinical_result = models.OneToOneField(
        ClinicalResult, on_delete=models.CASCADE, primary_key=True, related_name="tnm_detail"
    )
    t_category = models.CharField(max_length=10)
    n_category = models.CharField(max_length=10)
    m_category = models.CharField(max_length=10)
    stage_group = models.CharField(max_length=20)
    evidence = models.JSONField(null=True, blank=True)
    note = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "tnm_results"


# ── 5-9. gene_results ───────────────────────────────────────────
class GeneResult(models.Model):
    clinical_result = models.OneToOneField(
        ClinicalResult, on_delete=models.CASCADE, primary_key=True, related_name="gene_detail"
    )
    interpretation = models.TextField(null=True, blank=True)
    additional_test_recommended = models.BooleanField(default=False)

    class Meta:
        db_table = "gene_results"


# ── 5-10. gene_findings ─────────────────────────────────────────
class GeneFinding(models.Model):
    class Assessment(models.TextChoices):
        LIKELY_POSITIVE = "LIKELY_POSITIVE", "양성가능성"
        LIKELY_NEGATIVE = "LIKELY_NEGATIVE", "음성가능성"
        INDETERMINATE = "INDETERMINATE", "판정불가"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    gene_result = models.ForeignKey(GeneResult, on_delete=models.CASCADE, related_name="gene_findings")
    gene_symbol = models.CharField(max_length=30)
    assessment = models.CharField(max_length=20, choices=Assessment.choices)
    note = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "gene_findings"
        constraints = [
            models.UniqueConstraint(fields=["gene_result", "gene_symbol"], name="uq_gene_finding_result_symbol"),
        ]


# ── 5-11. treatment_decisions ───────────────────────────────────
class TreatmentDecision(models.Model):
    class AiRecommendationAction(models.TextChoices):
        ACCEPTED = "ACCEPTED", "수용"
        MODIFIED = "MODIFIED", "수정"
        REJECTED = "REJECTED", "거부"
        NOT_USED = "NOT_USED", "미사용"

    class TreatmentType(models.TextChoices):
        SURGERY = "SURGERY", "수술"
        RADIATION = "RADIATION", "방사선치료"
        CHEMOTHERAPY = "CHEMOTHERAPY", "항암화학요법"
        TARGETED_THERAPY = "TARGETED_THERAPY", "표적치료"
        IMMUNOTHERAPY = "IMMUNOTHERAPY", "면역치료"
        COMBINATION = "COMBINATION", "병합치료"
        SUPPORTIVE_CARE = "SUPPORTIVE_CARE", "완화치료"
        OBSERVATION = "OBSERVATION", "경과관찰"
        OTHER = "OTHER", "기타"

    clinical_result = models.OneToOneField(
        ClinicalResult, on_delete=models.CASCADE, primary_key=True, related_name="treatment_detail"
    )
    ai_recommendation_action = models.CharField(max_length=15, choices=AiRecommendationAction.choices)
    treatment_type = models.CharField(max_length=20, choices=TreatmentType.choices)
    treatment_plan = models.TextField()
    targeted_therapy_plan = models.TextField(null=True, blank=True)
    rationale = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "treatment_decisions"


# ── 6-1. case_final_results ─────────────────────────────────────
class CaseFinalResult(TimestampedUUIDModel):
    case = models.OneToOneField(LungCancerCase, on_delete=models.PROTECT, related_name="final_result")
    final_summary = models.TextField()
    finalized_by_user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="finalized_case_results")
    finalized_at = models.DateTimeField()

    class Meta:
        db_table = "case_final_results"


# 약물·처방 공통 route ENUM (drugs / regimen_drugs / prescription_items 공용)
class DrugRoute(models.TextChoices):
    ORAL = "ORAL", "경구"
    INTRAVENOUS = "INTRAVENOUS", "정맥"
    INTRAMUSCULAR = "INTRAMUSCULAR", "근육"
    SUBCUTANEOUS = "SUBCUTANEOUS", "피하"
    INHALATION = "INHALATION", "흡입"
    OTHER = "OTHER", "기타"


class DoseBasis(models.TextChoices):
    FIXED = "FIXED", "고정용량"
    MG_PER_M2 = "MG_PER_M2", "mg/m²"
    MG_PER_KG = "MG_PER_KG", "mg/kg"
    AUC = "AUC", "AUC"
    OTHER = "OTHER", "기타"


class TreatmentPhase(models.TextChoices):
    INDUCTION = "INDUCTION", "초기치료"
    MAINTENANCE = "MAINTENANCE", "유지요법"


# ── 6-2. drugs ───────────────────────────────────────────────────
class Drug(TimestampedUUIDModel):
    drug_name = models.CharField(max_length=200)
    ingredient_name = models.CharField(max_length=200)
    hira_ingredient_code = models.CharField(max_length=50, null=True, blank=True)
    product_code = models.CharField(max_length=50, null=True, blank=True)
    standard_code = models.CharField(max_length=50, null=True, blank=True)
    mfds_item_seq = models.CharField(max_length=50, null=True, blank=True)
    dur_ingredient_code = models.CharField(max_length=50, null=True, blank=True)
    strength = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    strength_unit = models.CharField(max_length=30, null=True, blank=True)
    dosage_form = models.CharField(max_length=100, null=True, blank=True)
    route = models.CharField(max_length=15, choices=DrugRoute.choices, null=True, blank=True)
    efficacy_class_code = models.CharField(max_length=50, null=True, blank=True)
    atc_code = models.CharField(max_length=30, null=True, blank=True)

    class Meta:
        db_table = "drugs"
        constraints = [
            models.CheckConstraint(check=Q(strength__gte=0), name="ck_drug_strength_ge0"),
        ]

    def __str__(self):
        return self.drug_name


# ── 6-3. regimens ────────────────────────────────────────────────
class Regimen(TimestampedUUIDModel):
    regimen_code = models.CharField(max_length=50, unique=True)
    regimen_name = models.CharField(max_length=200)
    cancer_type = models.CharField(max_length=100)
    histology = models.CharField(max_length=100, null=True, blank=True)
    treatment_line = models.CharField(max_length=30, null=True, blank=True)
    cycle_length_days = models.SmallIntegerField()
    induction_cycles = models.SmallIntegerField(null=True, blank=True)
    maintenance_yn = models.BooleanField(default=False)
    source = models.CharField(max_length=255, null=True, blank=True)
    source_version = models.CharField(max_length=50, null=True, blank=True)

    class Meta:
        db_table = "regimens"
        constraints = [
            models.CheckConstraint(check=Q(cycle_length_days__gt=0), name="ck_regimen_cycle_len_gt0"),
            models.CheckConstraint(check=Q(induction_cycles__gte=0), name="ck_regimen_induction_ge0"),
        ]

    def __str__(self):
        return self.regimen_name


# ── 6-4. regimen_drugs ───────────────────────────────────────────
class RegimenDrug(TimestampedUUIDModel):
    regimen = models.ForeignKey(Regimen, on_delete=models.PROTECT, related_name="regimen_drugs")
    drug = models.ForeignKey(Drug, on_delete=models.PROTECT, related_name="regimen_drugs")
    dose = models.DecimalField(max_digits=12, decimal_places=3)
    dose_basis = models.CharField(max_length=10, choices=DoseBasis.choices)
    route = models.CharField(max_length=15, choices=DrugRoute.choices)
    administration_day = models.CharField(max_length=50)
    frequency = models.CharField(max_length=100, null=True, blank=True)
    sequence = models.SmallIntegerField()
    phase = models.CharField(max_length=15, choices=TreatmentPhase.choices)

    class Meta:
        db_table = "regimen_drugs"
        constraints = [
            models.UniqueConstraint(
                fields=["regimen", "drug", "phase", "administration_day", "sequence"],
                name="uq_regimen_drug_slot",
            ),
            models.CheckConstraint(check=Q(dose__gte=0), name="ck_regimendrug_dose_ge0"),
            models.CheckConstraint(check=Q(sequence__gte=1), name="ck_regimendrug_seq_ge1"),
        ]


# ── 6-5. treatment_rules ────────────────────────────────────────
class TreatmentRule(TimestampedUUIDModel):
    rule_code = models.CharField(max_length=50)
    cancer_type = models.CharField(max_length=100)
    histology = models.CharField(max_length=100, null=True, blank=True)
    stage_condition = models.JSONField(null=True, blank=True)
    biomarker_condition = models.JSONField(null=True, blank=True)
    pdl1_condition = models.JSONField(null=True, blank=True)
    ecog_condition = models.JSONField(null=True, blank=True)
    treatment_line = models.CharField(max_length=30, null=True, blank=True)
    regimen = models.ForeignKey(Regimen, on_delete=models.PROTECT, related_name="treatment_rules")
    priority = models.SmallIntegerField()
    evidence_source = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "treatment_rules"
        constraints = [
            models.UniqueConstraint(fields=["rule_code", "priority"], name="uq_treatmentrule_code_priority"),
            models.UniqueConstraint(fields=["rule_code", "regimen"], name="uq_treatmentrule_code_regimen"),
            models.CheckConstraint(check=Q(priority__gte=1), name="ck_treatmentrule_priority_ge1"),
        ]


# ── 6-6. prescriptions (v1.6: 약물 1행 → Regimen/Cycle 처방 Header로 개편) ──
class Prescription(TimestampedUUIDModel):
    class PrescriptionStatus(models.TextChoices):
        DRAFT = "DRAFT", "작성중"
        VALIDATED = "VALIDATED", "검증완료"
        FINAL = "FINAL", "최종확정"
        COMPLETED = "COMPLETED", "완료"
        CANCELLED = "CANCELLED", "취소됨"

    case = models.ForeignKey(LungCancerCase, on_delete=models.PROTECT, related_name="prescriptions")
    treatment_decision = models.ForeignKey(
        TreatmentDecision, on_delete=models.PROTECT, related_name="prescriptions"
    )
    regimen = models.ForeignKey(Regimen, on_delete=models.PROTECT, related_name="prescriptions")
    cycle_number = models.SmallIntegerField()
    phase = models.CharField(max_length=15, choices=TreatmentPhase.choices)
    cycle_start_date = models.DateField()
    prescription_status = models.CharField(max_length=15, choices=PrescriptionStatus.choices)
    prescribed_by_user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="prescriptions")
    prescribed_at = models.DateTimeField()
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "prescriptions"
        constraints = [
            models.CheckConstraint(check=Q(cycle_number__gte=1), name="ck_prescription_cycle_ge1"),
        ]


# ── 6-7. prescription_items ─────────────────────────────────────
class PrescriptionItem(TimestampedUUIDModel):
    prescription = models.ForeignKey(Prescription, on_delete=models.PROTECT, related_name="items")
    drug = models.ForeignKey(Drug, on_delete=models.PROTECT, related_name="prescription_items")
    standard_dose = models.DecimalField(max_digits=12, decimal_places=3)
    dose_basis = models.CharField(max_length=10, choices=DoseBasis.choices)
    patient_bsa = models.DecimalField(max_digits=8, decimal_places=3, null=True, blank=True)
    target_auc = models.DecimalField(max_digits=8, decimal_places=3, null=True, blank=True)
    renal_value = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    calculated_dose = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    final_dose = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    unit = models.CharField(max_length=30)
    route = models.CharField(max_length=15, choices=DrugRoute.choices)
    administration_day = models.CharField(max_length=50)
    frequency = models.CharField(max_length=100, null=True, blank=True)
    instructions = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "prescription_items"
        constraints = [
            models.CheckConstraint(check=Q(standard_dose__gte=0), name="ck_rxitem_standard_dose_ge0"),
            models.CheckConstraint(check=Q(patient_bsa__gt=0), name="ck_rxitem_bsa_gt0"),
            models.CheckConstraint(check=Q(target_auc__gt=0), name="ck_rxitem_auc_gt0"),
            models.CheckConstraint(check=Q(renal_value__gte=0), name="ck_rxitem_renal_ge0"),
            models.CheckConstraint(check=Q(calculated_dose__gte=0), name="ck_rxitem_calc_dose_ge0"),
            models.CheckConstraint(check=Q(final_dose__gte=0), name="ck_rxitem_final_dose_ge0"),
        ]


# ── 6-8. safety_check_results ───────────────────────────────────
class SafetyCheckResult(models.Model):
    class CheckType(models.TextChoices):
        DRUG_INTERACTION = "DRUG_INTERACTION", "약물상호작용"
        ALLERGY = "ALLERGY", "알레르기"
        RENAL_FUNCTION = "RENAL_FUNCTION", "신장기능"
        HEPATIC_FUNCTION = "HEPATIC_FUNCTION", "간기능"
        DOSE = "DOSE", "용량"
        AGE = "AGE", "연령"
        PREGNANCY = "PREGNANCY", "임신"
        DUPLICATION = "DUPLICATION", "중복처방"

    class Result(models.TextChoices):
        PASS = "PASS", "통과"
        WARNING = "WARNING", "경고"
        BLOCK = "BLOCK", "차단"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    prescription = models.ForeignKey(Prescription, on_delete=models.PROTECT, related_name="safety_check_results")
    prescription_item = models.ForeignKey(
        PrescriptionItem, on_delete=models.PROTECT, null=True, blank=True, related_name="safety_check_results"
    )
    check_type = models.CharField(max_length=20, choices=CheckType.choices)
    result = models.CharField(max_length=10, choices=Result.choices)
    message = models.TextField(null=True, blank=True)
    source = models.CharField(max_length=100, null=True, blank=True)
    source_code = models.CharField(max_length=100, null=True, blank=True)
    checked_at = models.DateTimeField()

    class Meta:
        db_table = "safety_check_results"
