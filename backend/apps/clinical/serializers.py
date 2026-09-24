from decimal import Decimal

from rest_framework import serializers

from apps.ai_results.models import AiAnalysis, AnalysisType

from .models import ClinicalResult, CtResult, NoduleObservation, TnmResult
from .models import Prescription, PrescriptionItem, Regimen, SafetyCheckResult, TreatmentDecision, TreatmentRule


TNM_T_VALUES = {
    "TX", "T0", "Tis", "T1mi", "T1a", "T1b", "T1c", "T1", "T2a", "T2b", "T2", "T3", "T4",
}
TNM_N_VALUES = {"NX", "N0", "N1", "N2", "N2a", "N2b", "N3"}
TNM_M_VALUES = {"M0", "M1", "M1a", "M1b", "M1c", "M1c1", "M1c2", "M_indeterminate"}


class DoctorTnmDraftSerializer(serializers.Serializer):
    reviewed_ai_result_id = serializers.UUIDField()
    t_category = serializers.ChoiceField(choices=sorted(TNM_T_VALUES))
    n_category = serializers.ChoiceField(choices=sorted(TNM_N_VALUES))
    m_category = serializers.ChoiceField(choices=sorted(TNM_M_VALUES))
    evidence = serializers.JSONField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate_reviewed_ai_result_id(self, value):
        case = self.context["case"]
        order = self.context["order"]
        result = (
            AiAnalysis.objects.filter(
                ai_result__id=value,
                case=case,
                examination_order=order,
                analysis_type=AnalysisType.PET_CT_TNM_ANALYSIS,
                status=AiAnalysis.Status.SUCCEEDED,
            )
            .exists()
        )
        if not result:
            raise serializers.ValidationError("A succeeded PET-CT TNM AI result for this order is required.")
        return value

    def to_representation(self, instance):
        detail = instance.tnm_detail
        return {
            "id": str(instance.id),
            "workflow_stage": instance.workflow_stage,
            "result_status": instance.result_status,
            "result_status_label": instance.get_result_status_display(),
            "reviewed_ai_result_id": str(instance.reviewed_ai_result_id) if instance.reviewed_ai_result_id else None,
            "t_category": detail.t_category,
            "n_category": detail.n_category,
            "m_category": detail.m_category,
            "stage_group": detail.stage_group or None,
            "evidence": detail.evidence,
            "note": detail.note,
            "confirmed_by_user_id": str(instance.confirmed_by_user_id) if instance.confirmed_by_user_id else None,
            "confirmed_at": instance.confirmed_at,
        }

class NoduleObservationWriteSerializer(serializers.Serializer):
    nodule_no = serializers.IntegerField(min_value=1)
    lobe = serializers.ChoiceField(choices=NoduleObservation.Lobe.choices, required=False, allow_null=True)
    location_description = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)
    max_diameter_mm = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=Decimal("0"), required=False, allow_null=True)
    volume_mm3 = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False, allow_null=True)
    surface_area_mm2 = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False, allow_null=True)
    sphericity = serializers.DecimalField(max_digits=5, decimal_places=4, min_value=Decimal("0"), max_value=Decimal("1"), required=False, allow_null=True)
    spiculation = serializers.ChoiceField(choices=NoduleObservation.PresenceFlag.choices, required=False, allow_null=True)
    lobulation = serializers.ChoiceField(choices=NoduleObservation.PresenceFlag.choices, required=False, allow_null=True)
    malignancy_risk = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal("0"), max_value=Decimal("100"), required=False, allow_null=True)


class DoctorCtResultWriteSerializer(serializers.Serializer):
    reviewed_ai_result_id = serializers.UUIDField()
    overall_assessment = serializers.ChoiceField(choices=CtResult.OverallAssessment.choices)
    finding_summary = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    nodule_observations = NoduleObservationWriteSerializer(many=True, required=False)

    def validate(self, attrs):
        case = self.context["case"]
        from apps.ai_results.models import AiAnalysis, AnalysisType
        analysis = AiAnalysis.objects.select_related("examination_order").filter(
            ai_result__id=attrs["reviewed_ai_result_id"], case=case,
            examination_order__order_type="CT",
            analysis_type=AnalysisType.CT_ANALYSIS,
            status=AiAnalysis.Status.SUCCEEDED,
        ).first()
        if analysis is None:
            raise serializers.ValidationError({"reviewed_ai_result_id": "A succeeded CT AI result for this order is required."})
        self.context["validated_order_id"] = analysis.examination_order_id
        nodule_numbers = [item["nodule_no"] for item in attrs.get("nodule_observations", [])]
        if len(nodule_numbers) != len(set(nodule_numbers)):
            raise serializers.ValidationError({"nodule_observations": "Nodule numbers must be unique."})
        return attrs

class PatientClinicalResultSerializer(serializers.ModelSerializer):
    workflow_stage = serializers.CharField(read_only=True)

    exam_name = serializers.SerializerMethodField()

    result_status_label = serializers.CharField(
        source="get_result_status_display",
        read_only=True,
    )

    result_summary = serializers.SerializerMethodField()
    result_date = serializers.SerializerMethodField()

    # 환자 앱 상세 결과
    result_sections = serializers.SerializerMethodField()

    class Meta:
        model = ClinicalResult
        fields = [
            "id",
            "workflow_stage",
            "exam_name",
            "result_status",
            "result_status_label",
            "result_date",
            "result_summary",
            "result_sections",
        ]

    def get_exam_name(self, obj):
        exam_names = {
            "XRAY": "흉부 X-ray 검사",
            "CT": "흉부 CT 검사",
            "PET_CT_TNM": "PET-CT 및 TNM 병기 평가",
            "PATHOLOGY_GENE": "조직·유전자 검사",
            "PDL1": "PD-L1 검사",
        }

        return exam_names.get(
            obj.workflow_stage,
            obj.get_workflow_stage_display(),
        )

    def get_result_date(self, obj):
        if obj.confirmed_at:
            return obj.confirmed_at

        return obj.updated_at

    # =========================================================
    # 검사 결과 목록에 보여줄 짧은 결과
    #
    # finding_summary
    # diagnosis_summary
    # interpretation
    # 같은 서술형 내용은 사용하지 않음.
    # =========================================================
    def get_result_summary(self, obj):

        # X-ray
        if hasattr(obj, "xray_detail"):
            return obj.xray_detail.get_assessment_display()

        # CT
        if hasattr(obj, "ct_detail"):
            ct = obj.ct_detail

            assessment = ct.get_overall_assessment_display()

            if ct.overall_malignancy_risk is not None:
                return (
                    f"{assessment} · "
                    f"악성 위험도 {ct.overall_malignancy_risk}%"
                )

            return assessment

        # PET-CT / TNM
        if hasattr(obj, "tnm_detail"):
            stage = obj.tnm_detail.stage_group

            if stage:
                return f"최종 병기 {stage}"

            return "병기 평가 완료"

        # 조직검사
        if hasattr(obj, "pathology_detail"):
            pathology = obj.pathology_detail

            result = pathology.get_malignancy_status_display()

            if pathology.histologic_type:
                return f"{result} · {pathology.histologic_type}"

            return result

        # 유전자만 존재하는 경우
        if hasattr(obj, "gene_detail"):
            findings = list(
                obj.gene_detail.gene_findings.all()
            )

            if findings:
                first = findings[0]

                if len(findings) == 1:
                    return (
                        f"{first.gene_symbol} "
                        f"{first.get_assessment_display()}"
                    )

                return f"유전자 결과 {len(findings)}건 확인"

            return "유전자 검사 결과 확인"

        # PD-L1
        if hasattr(obj, "pdl1_detail"):
            pdl1 = obj.pdl1_detail

            if pdl1.tps_percent is not None:
                return f"PD-L1 TPS {pdl1.tps_percent}%"

            return "PD-L1 검사 결과 확인"

        return "검사 결과 확인"

    # =========================================================
    # 환자 앱 상세 결과
    #
    # 의료진 서술형 소견 제외
    #
    # 제외:
    # - finding_summary
    # - diagnosis_summary
    # - interpretation
    # - recommended_action
    # - note
    #
    # 구조화된 확정 결과만 전달
    # =========================================================
    def get_result_sections(self, obj):
        sections = []

        # =====================================================
        # 1. X-ray
        # =====================================================
        if hasattr(obj, "xray_detail"):
            xray = obj.xray_detail

            sections.append({
                "type": "XRAY_ASSESSMENT",
                "label": "최종 판정",
                "summary": xray.get_assessment_display(),
            })

            return sections

        # =====================================================
        # 2. CT
        # =====================================================
        if hasattr(obj, "ct_detail"):
            ct = obj.ct_detail

            sections.append({
                "type": "CT_ASSESSMENT",
                "label": "종합 판정",
                "summary": ct.get_overall_assessment_display(),
            })

            if ct.overall_malignancy_risk is not None:
                sections.append({
                    "type": "CT_MALIGNANCY_RISK",
                    "label": "전체 악성 위험도",
                    "summary": f"{ct.overall_malignancy_risk}%",
                })

            observations = list(
                ct.nodule_observations
                .select_related("nodule")
                .all()
                .order_by("nodule__nodule_no")
            )

            sections.append({
                "type": "CT_NODULE_COUNT",
                "label": "결절 개수",
                "summary": f"{len(observations)}개",
            })

            for observation in observations:
                nodule = observation.nodule
                nodule_no = nodule.nodule_no

                location_parts = []

                if observation.lobe:
                    location_parts.append(
                        observation.get_lobe_display()
                    )

                if observation.location_description:
                    location_parts.append(
                        observation.location_description
                    )

                if location_parts:
                    sections.append({
                        "type": f"CT_NODULE_{nodule_no}_LOCATION",
                        "label": "위치",
                        "summary": " · ".join(location_parts),
                    })

                if observation.max_diameter_mm is not None:
                    sections.append({
                        "type": f"CT_NODULE_{nodule_no}_SIZE",
                        "label": "최대 크기",
                        "summary": f"{observation.max_diameter_mm} mm",
                    })

                if observation.volume_mm3 is not None:
                    sections.append({
                        "type": f"CT_NODULE_{nodule_no}_VOLUME",
                        "label": "부피",
                        "summary": f"{observation.volume_mm3} mm³",
                    })

                if observation.surface_area_mm2 is not None:
                    sections.append({
                        "type": f"CT_NODULE_{nodule_no}_SURFACE_AREA",
                        "label": "표면적",
                        "summary": f"{observation.surface_area_mm2} mm²",
                    })

                if observation.sphericity is not None:
                    sections.append({
                        "type": f"CT_NODULE_{nodule_no}_SPHERICITY",
                        "label": "구형도",
                        "summary": str(observation.sphericity),
                    })

                if observation.spiculation:
                    sections.append({
                        "type": f"CT_NODULE_{nodule_no}_SPICULATION",
                        "label": "침상형 경계",
                        "summary": observation.get_spiculation_display(),
                    })

                if observation.lobulation:
                    sections.append({
                        "type": f"CT_NODULE_{nodule_no}_LOBULATION",
                        "label": "분엽형 경계",
                        "summary": observation.get_lobulation_display(),
                    })

                if observation.malignancy_risk is not None:
                    sections.append({
                        "type": f"CT_NODULE_{nodule_no}_MALIGNANCY_RISK",
                        "label": "악성 위험도",
                        "summary": f"{observation.malignancy_risk}%",
                    })

                if nodule.tracking_status:
                    sections.append({
                        "type": f"CT_NODULE_{nodule_no}_TRACKING_STATUS",
                        "label": "추적 상태",
                        "summary": nodule.get_tracking_status_display(),
                    })

            return sections

        # =====================================================
        # 3. PET-CT / TNM
        # =====================================================
        if hasattr(obj, "tnm_detail"):
            tnm = obj.tnm_detail

            sections.extend([
                {
                    "type": "TNM_T",
                    "label": "T 범주",
                    "summary": tnm.t_category,
                },
                {
                    "type": "TNM_N",
                    "label": "N 범주",
                    "summary": tnm.n_category,
                },
                {
                    "type": "TNM_M",
                    "label": "M 범주",
                    "summary": tnm.m_category,
                },
                {
                    "type": "TNM_STAGE",
                    "label": "최종 병기",
                    "summary": tnm.stage_group,
                },
            ])

            return sections

        # =====================================================
        # 4. 조직 + 유전자
        #
        # PATHOLOGY_GENE는
        # PathologyResult + GeneResult가 함께 들어갈 수 있음
        # =====================================================
        if hasattr(obj, "pathology_detail"):
            pathology = obj.pathology_detail

            sections.append({
                "type": "PATHOLOGY_MALIGNANCY",
                "label": "악성 여부",
                "summary": (
                    pathology.get_malignancy_status_display()
                ),
            })

            if pathology.histologic_type:
                sections.append({
                    "type": "PATHOLOGY_HISTOLOGY",
                    "label": "조직형",
                    "summary": pathology.histologic_type,
                })

            if pathology.subtype:
                sections.append({
                    "type": "PATHOLOGY_SUBTYPE",
                    "label": "세부 아형",
                    "summary": pathology.subtype,
                })

        # 유전자
        if hasattr(obj, "gene_detail"):
            gene = obj.gene_detail

            findings = gene.gene_findings.all()

            for finding in findings:
                sections.append({
                    "type": "GENE_FINDING",
                    "label": finding.gene_symbol,
                    "summary": (
                        finding.get_assessment_display()
                    ),
                })

        if sections:
            return sections

        # =====================================================
        # 5. PD-L1
        # =====================================================
        if hasattr(obj, "pdl1_detail"):
            pdl1 = obj.pdl1_detail

            if pdl1.tps_percent is not None:
                sections.append({
                    "type": "PDL1_TPS",
                    "label": "PD-L1 TPS",
                    "summary": f"{pdl1.tps_percent}%",
                })

            return sections

        return sections
# 호흡기내과 - Case 검사 결과 상세 조회용
class DoctorClinicalResultSerializer(serializers.ModelSerializer):
    workflow_stage = serializers.CharField(read_only=True)
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
            "workflow_stage",
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
            "PET_CT_TNM": "PET-CT 및 TNM 병기 평가",
            "PATHOLOGY_GENE": "조직·유전자 검사",
            "PDL1": "PD-L1 검사",
        }

        return exam_names.get(
            obj.workflow_stage,
            obj.get_workflow_stage_display(),
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
                "nodule_observations": [
                    {
                        "nodule_no": observation.nodule.nodule_no,
                        "lobe": observation.lobe,
                        "lobe_label": observation.get_lobe_display() if observation.lobe else None,
                        "location_description": observation.location_description,
                        "max_diameter_mm": observation.max_diameter_mm,
                        "volume_mm3": observation.volume_mm3,
                        "surface_area_mm2": observation.surface_area_mm2,
                        "sphericity": observation.sphericity,
                        "spiculation": observation.spiculation,
                        "lobulation": observation.lobulation,
                        "malignancy_risk": observation.malignancy_risk,
                    }
                    for observation in ct.nodule_observations.select_related("nodule").order_by("nodule__nodule_no")
                ],
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
                        "alteration_code": finding.alteration_code,
                        "assessment": finding.assessment,
                        "assessment_label": finding.get_assessment_display(),
                        "note": finding.note,
                    }
                    for finding in gene.gene_findings.all()
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
    decision_status = serializers.CharField(
        source="clinical_result.result_status",
        read_only=True,
    )
    current_stage = serializers.CharField(
        source="clinical_result.case.current_stage",
        read_only=True,
    )
    case_status = serializers.CharField(
        source="clinical_result.case.case_status",
        read_only=True,
    )
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
    requires_prescription = serializers.BooleanField(
        source="requires_drug_prescription",
        read_only=True,
    )

    class Meta:
        model = TreatmentDecision
        fields = [
            "clinical_result",
            "decision_status",
            "current_stage",
            "case_status",
            "ai_recommendation_action",
            "ai_recommendation_action_label",
            "treatment_type",
            "treatment_type_label",
            "requires_prescription",
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
            "mfds_item_seq",
            "drug_name",
            "ingredient_name",
            "standard_dose",
            "dose_basis",
            "dose_basis_label",
            "patient_bsa",
            "target_auc",
            "renal_value",
            "renal_value_type",
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
    def validate_cycle_number(self, value):
        if value < 1:
            raise serializers.ValidationError("Cycle 번호는 1 이상의 정수여야 합니다.")
        return value

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

class PrescriptionItemUpdateSerializer(serializers.Serializer):
    mfds_item_seq = serializers.CharField(required=False, allow_null=True, max_length=50)
    final_dose = serializers.DecimalField(
        max_digits=PrescriptionItem._meta.get_field("final_dose").max_digits,
        decimal_places=PrescriptionItem._meta.get_field("final_dose").decimal_places,
        min_value=Decimal("0"), required=False,
    )
    instructions = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, trim_whitespace=False,
    )

    def validate_mfds_item_seq(self, value):
        if value is not None and (not value.isdigit() or not value):
            raise serializers.ValidationError("mfds_item_seq must be a numeric ITEM_SEQ.")
        return value


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
        return self.context.get("match_reasons_by_id", {}).get(obj.id, [])
