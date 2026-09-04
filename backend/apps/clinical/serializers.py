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