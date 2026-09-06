from rest_framework import serializers

from .models import ClinicalResult


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