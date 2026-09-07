from rest_framework import serializers

from .models import ClinicalResult
from .models import Prescription, PrescriptionItem, Regimen, SafetyCheckResult, TreatmentDecision, TreatmentRule

class PatientClinicalResultSerializer(serializers.ModelSerializer):
    exam_type = serializers.CharField(source="stage")
    exam_name = serializers.SerializerMethodField()
    result_status_label = serializers.CharField(
        source="get_result_status_display",
        read_only=True,
    )
    result_summary = serializers.SerializerMethodField()
    result_date = serializers.SerializerMethodField()

    class Meta:
        model = ClinicalResult
        fields = [
            "id",
            "exam_type",
            "exam_name",
            "result_status",
            "result_status_label",
            "result_date",
            "result_summary",
        ]

    def get_exam_name(self, obj):
        exam_names = {
            "XRAY": "흉부 X-ray 검사",
            "CT": "흉부 CT 검사",
            "PATHOLOGY": "병리 검사",
            "TNM": "병기 검사",
            "GENE": "유전자 검사",
        }

        return exam_names.get(
            obj.stage,
            obj.get_stage_display(),
        )

    def get_result_date(self, obj):
        # 확정된 결과는 확정일을 우선 사용
        if obj.confirmed_at:
            return obj.confirmed_at

        return obj.updated_at

    def get_result_summary(self, obj):
        # X-ray
        if hasattr(obj, "xray_detail"):
            return (
                obj.xray_detail.finding_summary
                or obj.xray_detail.get_assessment_display()
            )

        # CT
        if hasattr(obj, "ct_detail"):
            return (
                obj.ct_detail.finding_summary
                or obj.ct_detail.get_overall_assessment_display()
            )

        # 병리
        if hasattr(obj, "pathology_detail"):
            return (
                obj.pathology_detail.diagnosis_summary
                or obj.pathology_detail.get_malignancy_status_display()
            )

        # TNM
        if hasattr(obj, "tnm_detail"):
            return f"병기 {obj.tnm_detail.stage_group}"

        # 유전자
        if hasattr(obj, "gene_detail"):
            return (
                obj.gene_detail.interpretation
                or "유전자 검사 결과가 등록되었습니다."
            )

        return "검사 결과가 등록되었습니다."

# 호흡기내과 - Case 검사 결과 상세 조회용
class DoctorClinicalResultSerializer(serializers.ModelSerializer):
    exam_type = serializers.CharField(source="stage", read_only=True)
    exam_name = serializers.SerializerMethodField()
    result_status_label = serializers.CharField(
        source="get_result_status_display",
        read_only=True,
    )
    result_date = serializers.SerializerMethodField()
    result_detail = serializers.SerializerMethodField()

    class Meta:
        model = ClinicalResult
        fields = [
            "id",
            "exam_type",
            "exam_name",
            "result_status",
            "result_status_label",
            "result_date",
            "result_detail",
        ]

    def get_exam_name(self, obj):
        exam_names = {
            "XRAY": "흉부 X-ray 검사",
            "CT": "흉부 CT 검사",
            "PATHOLOGY": "병리 검사",
            "STAGING": "TNM 병기 검사",
            "GENE": "유전자 검사",
        }

        return exam_names.get(
            obj.stage,
            obj.get_stage_display(),
        )

    def get_result_date(self, obj):
        if obj.confirmed_at:
            return obj.confirmed_at

        return obj.updated_at

    def get_result_detail(self, obj):
        detail = {}

        # X-ray
        if hasattr(obj, "xray_detail"):
            xray = obj.xray_detail
            detail["xray"] = {
                "assessment": xray.assessment,
                "assessment_label": xray.get_assessment_display(),
                "finding_summary": xray.finding_summary,
                "recommended_action": xray.recommended_action,
            }

        # CT
        if hasattr(obj, "ct_detail"):
            ct = obj.ct_detail
            detail["ct"] = {
                "overall_assessment": ct.overall_assessment,
                "overall_assessment_label": ct.get_overall_assessment_display(),
                "overall_malignancy_risk": ct.overall_malignancy_risk,
                "finding_summary": ct.finding_summary,
            }

        # 병리
        if hasattr(obj, "pathology_detail"):
            pathology = obj.pathology_detail
            detail["pathology"] = {
                "malignancy_status": pathology.malignancy_status,
                "malignancy_status_label": pathology.get_malignancy_status_display(),
                "histologic_type": pathology.histologic_type,
                "subtype": pathology.subtype,
                "diagnosis_summary": pathology.diagnosis_summary,
            }

        # TNM
        if hasattr(obj, "tnm_detail"):
            tnm = obj.tnm_detail
            detail["tnm"] = {
                "t_category": tnm.t_category,
                "n_category": tnm.n_category,
                "m_category": tnm.m_category,
                "stage_group": tnm.stage_group,
                "evidence": tnm.evidence,
                "note": tnm.note,
            }

        # 유전자
        if hasattr(obj, "gene_detail"):
            gene = obj.gene_detail
            detail["gene"] = {
                "interpretation": gene.interpretation,
                "additional_test_recommended": gene.additional_test_recommended,
                "findings": [
                    {
                        "gene_symbol": finding.gene_symbol,
                        "assessment": finding.assessment,
                        "assessment_label": finding.get_assessment_display(),
                        "note": finding.note,
                    }
                    for finding in gene.findings.all()
                ],
            }

        # PD-L1
        if hasattr(obj, "pdl1_detail"):
            pdl1 = obj.pdl1_detail
            detail["pdl1"] = {
                "tps_percent": pdl1.tps_percent,
                "interpretation": pdl1.interpretation,
                "note": pdl1.note,
            }

        return detail


from .models import Regimen, TreatmentDecision


class RegimenSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Regimen
        fields = [
            "id",
            "regimen_code",
            "regimen_name",
            "cancer_type",
            "histology",
            "treatment_line",
            "cycle_length_days",
            "induction_cycles",
            "maintenance_yn",
            "source",
            "source_version",
        ]


class DoctorTreatmentDecisionSerializer(serializers.ModelSerializer):
    selected_regimen_detail = RegimenSummarySerializer(
        source="selected_regimen",
        read_only=True,
    )
    ai_recommendation_action_label = serializers.CharField(
        source="get_ai_recommendation_action_display",
        read_only=True,
    )
    treatment_type_label = serializers.CharField(
        source="get_treatment_type_display",
        read_only=True,
    )

    class Meta:
        model = TreatmentDecision
        fields = [
            "clinical_result",
            "ai_recommendation_action",
            "ai_recommendation_action_label",
            "treatment_type",
            "treatment_type_label",
            "selected_regimen",
            "selected_regimen_detail",
            "treatment_plan",
            "targeted_therapy_plan",
            "rationale",
        ]
        read_only_fields = [
            "clinical_result",
        ]

from .models import Prescription, PrescriptionItem, SafetyCheckResult


class PrescriptionItemSerializer(serializers.ModelSerializer):
    drug_name = serializers.CharField(
        source="drug.drug_name",
        read_only=True,
    )
    ingredient_name = serializers.CharField(
        source="drug.ingredient_name",
        read_only=True,
    )
    dose_basis_label = serializers.CharField(
        source="get_dose_basis_display",
        read_only=True,
    )
    route_label = serializers.CharField(
        source="get_route_display",
        read_only=True,
    )

    class Meta:
        model = PrescriptionItem
        fields = [
            "id",
            "drug",
            "drug_name",
            "ingredient_name",
            "standard_dose",
            "dose_basis",
            "dose_basis_label",
            "patient_bsa",
            "target_auc",
            "renal_value",
            "calculated_dose",
            "final_dose",
            "unit",
            "route",
            "route_label",
            "administration_day",
            "frequency",
            "instructions",
        ]


class SafetyCheckResultSerializer(serializers.ModelSerializer):
    check_type_label = serializers.CharField(
        source="get_check_type_display",
        read_only=True,
    )
    result_label = serializers.CharField(
        source="get_result_display",
        read_only=True,
    )

    class Meta:
        model = SafetyCheckResult
        fields = [
            "id",
            "prescription_item",
            "check_type",
            "check_type_label",
            "result",
            "result_label",
            "message",
            "source",
            "source_code",
            "checked_at",
            "acknowledged_by_user",
            "acknowledged_at",
            "acknowledgment_note",
        ]


class DoctorPrescriptionSerializer(serializers.ModelSerializer):
    regimen_detail = RegimenSummarySerializer(
        source="regimen",
        read_only=True,
    )
    prescription_status_label = serializers.CharField(
        source="get_prescription_status_display",
        read_only=True,
    )
    phase_label = serializers.CharField(
        source="get_phase_display",
        read_only=True,
    )
    items = PrescriptionItemSerializer(
        many=True,
        read_only=True,
    )
    safety_check_results = SafetyCheckResultSerializer(
        many=True,
        read_only=True,
    )

    class Meta:
        model = Prescription
        fields = [
            "id",
            "case",
            "treatment_decision",
            "regimen",
            "regimen_detail",
            "cycle_number",
            "phase",
            "phase_label",
            "cycle_start_date",
            "prescription_status",
            "prescription_status_label",
            "prescribed_by_user",
            "prescribed_at",
            "cancelled_at",
            "cancellation_reason",
            "items",
            "safety_check_results",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "case",
            "treatment_decision",
            "regimen",
            "prescription_status",
            "prescribed_by_user",
            "prescribed_at",
        ]

class TreatmentRuleCandidateSerializer(serializers.ModelSerializer):
    regimen_detail = RegimenSummarySerializer(source="regimen", read_only=True)
    match_reasons = serializers.SerializerMethodField()

    class Meta:
        model = TreatmentRule
        fields = [
            "id",
            "rule_code",
            "cancer_type",
            "histology",
            "stage_condition",
            "biomarker_condition",
            "pdl1_condition",
            "ecog_condition",
            "treatment_line",
            "priority",
            "evidence_source",
            "regimen",
            "regimen_detail",
            "match_reasons",
        ]

    def get_match_reasons(self, obj):
        context = self.context

        histology = context.get("histology")
        stage_group = context.get("stage_group")
        positive_genes = context.get("positive_genes", set())
        pdl1_tps = context.get("pdl1_tps")

        reasons = []

        if histology and obj.histology:
            reasons.append(f"조직형 일치: {histology}")

        allowed_stages = (obj.stage_condition or {}).get("stage", [])
        if stage_group and stage_group in allowed_stages:
            reasons.append(f"병기 일치: {stage_group}")

        required_genes = (obj.biomarker_condition or {}).get("positive", [])
        for gene in required_genes:
            if str(gene).upper() in positive_genes:
                reasons.append(f"바이오마커 일치: {str(gene).upper()} 양성")

        pdl1_condition = obj.pdl1_condition or {}
        if pdl1_tps is not None and pdl1_condition:
            minimum = pdl1_condition.get("min")
            maximum = pdl1_condition.get("max")

            if minimum is not None:
                reasons.append(f"PD-L1 TPS {pdl1_tps}% ≥ {minimum}%")

            if maximum is not None:
                reasons.append(f"PD-L1 TPS {pdl1_tps}% ≤ {maximum}%")

        return reasons