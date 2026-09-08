from rest_framework import serializers

from .models import AiAnalysis


class DoctorAiAnalysisSerializer(serializers.ModelSerializer):
    analysis_type_label = serializers.CharField(
        source="get_analysis_type_display",
        read_only=True,
    )
    status_label = serializers.CharField(
        source="get_status_display",
        read_only=True,
    )
    model_name = serializers.CharField(
        source="model_version.model_name",
        read_only=True,
    )
    model_version_name = serializers.CharField(
        source="model_version.version",
        read_only=True,
    )
    result_detail = serializers.SerializerMethodField()

    class Meta:
        model = AiAnalysis
        fields = [
            "id",
            "analysis_type",
            "analysis_type_label",
            "status",
            "status_label",
            "model_name",
            "model_version_name",
            "started_at",
            "completed_at",
            "error_message",
            "result_detail",
            "created_at",
        ]

    def get_result_detail(self, obj):
        if not hasattr(obj, "ai_result"):
            return None

        result = obj.ai_result
        detail = {
            "schema_version": result.schema_version,
            "result_payload": result.result_payload,
            "result_files": result.result_files,
        }

        # X-ray
        if hasattr(result, "xray_detail"):
            xray = result.xray_detail
            detail["xray"] = {
                "assessment": xray.assessment,
                "assessment_label": xray.get_assessment_display(),
                "suspicion_score": xray.suspicion_score,
            }

        # CT
        if hasattr(result, "ct_detail"):
            ct = result.ct_detail
            detail["ct"] = {
                "overall_malignancy_risk": ct.overall_malignancy_risk,
                "nodules": [
                    {
                        "nodule_no": nodule.nodule_no,
                        "detection_confidence": nodule.detection_confidence,
                        "malignancy_risk": nodule.malignancy_risk,
                        "finding_payload": nodule.finding_payload,
                    }
                    for nodule in ct.nodule_results.all()
                ],
            }

        # 검체 적정성
        if hasattr(result, "specimen_adequacy_detail"):
            specimen = result.specimen_adequacy_detail
            detail["specimen_adequacy"] = {
                "adequacy_status": specimen.adequacy_status,
                "adequacy_status_label": specimen.get_adequacy_status_display(),
                "tumor_cell_ratio": specimen.tumor_cell_ratio,
                "confidence": specimen.confidence,
            }

        # 병리
        if hasattr(result, "pathology_detail"):
            pathology = result.pathology_detail
            detail["pathology"] = {
                "malignancy_assessment": pathology.malignancy_assessment,
                "malignancy_assessment_label": pathology.get_malignancy_assessment_display(),
                "malignancy_probability": pathology.malignancy_probability,
                "predicted_histologic_type": pathology.predicted_histologic_type,
                "predicted_subtype": pathology.predicted_subtype,
                "subtype_confidence": pathology.subtype_confidence,
            }

        # PD-L1 구간 분류
        if hasattr(result, "pdl1_detail"):
            pdl1 = result.pdl1_detail
            detail["pdl1"] = {
                "predicted_class": pdl1.predicted_class,
                "predicted_tps_range": pdl1.predicted_tps_range,
                "predicted_tps_range_label": pdl1.get_predicted_tps_range_display(),
                "confidence": pdl1.confidence,
                "probabilities": pdl1.probabilities,
            }

        # TNM
        if hasattr(result, "tnm_detail"):
            tnm = result.tnm_detail
            detail["tnm"] = {
                "predicted_t": tnm.predicted_t,
                "predicted_n": tnm.predicted_n,
                "predicted_m": tnm.predicted_m,
                "predicted_stage_group": tnm.predicted_stage_group,
                "confidence": tnm.confidence,
            }

        # 유전자
        if result.gene_ai_results.exists():
            detail["genes"] = [
                {
                    "gene_symbol": gene.gene_symbol,
                    "predicted_status": gene.predicted_status,
                    "predicted_status_label": gene.get_predicted_status_display(),
                    "predicted_probability": gene.predicted_probability,
                }
                for gene in result.gene_ai_results.all()
            ]

        # 치료 추천
        if hasattr(result, "treatment_detail"):
            treatment = result.treatment_detail
            detail["treatment"] = {
                "overall_opinion": treatment.overall_opinion,
                "recommended_plan": treatment.recommended_plan,
                "targeted_therapy_recommendation": treatment.targeted_therapy_recommendation,
                "prescription_draft": treatment.prescription_draft,
                "rationale": treatment.rationale,
                "evidence": treatment.evidence,
            }

        return detail
