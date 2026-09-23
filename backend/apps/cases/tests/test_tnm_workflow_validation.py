"""Database-free endpoint unit tests for the TNM advancement boundary.

ORM and transaction effects are mocked; request validation and branching are real.
"""
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import uuid4

from django.test import SimpleTestCase

from apps.cases.models import WorkflowStage
from apps.cases.views import DoctorCaseWorkflowDecisionAPIView
from apps.clinical.models import TnmResult
from apps.clinical.serializers import TNM_M_VALUES
from apps.clinical.views import (
    PULMONOLOGY_WRITE_PERMISSIONS,
    DoctorCtResultAPIView,
    DoctorCtResultConfirmAPIView,
    DoctorTnmConfirmAPIView,
    DoctorTnmDraftAPIView,
    DoctorTnmStageAPIView,
    DoctorTnmStageConfirmAPIView,
)
from apps.cases.services.examination_orders import ExaminationOrderCreationError


class TnmWorkflowValidationTests(SimpleTestCase):
    def workflow(self, stage_group, *, action="PROCEED_NEXT_STAGE"):
        case = Mock(id=uuid4(), current_stage=WorkflowStage.PET_CT_TNM, case_status="ACTIVE")
        result = Mock(id=uuid4(), workflow_stage=WorkflowStage.PET_CT_TNM)
        result.tnm_detail = None if stage_group is None else SimpleNamespace(stage_group=stage_group)
        request = SimpleNamespace(user=Mock(), data={
            "action": action, "source_clinical_result_id": str(result.id),
            "target_stage": "PATHOLOGY_GENE" if action == "PROCEED_NEXT_STAGE" else None,
            "reason": "Clinical decision",
        })
        with patch("apps.cases.views.LungCancerCase.objects") as cases, \
             patch("apps.cases.views.ClinicalResult.objects") as results, \
             patch("apps.cases.views.ExaminationOrder.objects") as orders, \
             patch("apps.cases.views.Prescription.objects") as prescriptions, \
             patch("apps.cases.views.ClinicianDecision.objects") as decisions, \
             patch("apps.cases.views.create_examination_order") as create_order:
            cases.select_for_update.return_value.filter.return_value.first.return_value = case
            results.select_for_update.return_value.filter.return_value.first.return_value = result
            orders.filter.return_value.exists.return_value = True
            prescriptions.filter.return_value.exists.return_value = True
            # Call the real handler without its database transaction wrapper.
            response = DoctorCaseWorkflowDecisionAPIView.post.__wrapped__(DoctorCaseWorkflowDecisionAPIView(), request, case.id)
            if stage_group in (None, "", "   ") and action == "PROCEED_NEXT_STAGE":
                self.assertEqual(response.status_code, 400)
                self.assertIn("Stage Group", response.data["detail"])
                case.save.assert_not_called()
                decisions.create.assert_not_called()
                create_order.assert_not_called()
            else:
                self.assertEqual(response.status_code, 200)
                decisions.create.assert_called_once()
                if action == "PROCEED_NEXT_STAGE":
                    self.assertEqual(case.current_stage, WorkflowStage.PATHOLOGY_GENE)

    def test_missing_or_blank_final_stage_blocks_even_when_next_order_exists(self):
        for group in (None, "", "   "):
            with self.subTest(group=group):
                self.workflow(group)

    def test_final_stage_allows_advancement(self):
        self.workflow("IIA")

    def test_confirmed_pathology_advancement_creates_one_pdl1_order_and_updates_stage(self):
        case = Mock(id=uuid4(), current_stage=WorkflowStage.PATHOLOGY_GENE, case_status="ACTIVE")
        result = Mock(id=uuid4(), workflow_stage=WorkflowStage.PATHOLOGY_GENE)
        request = SimpleNamespace(user=Mock(), data={
            "action": "PROCEED_NEXT_STAGE",
            "source_clinical_result_id": str(result.id),
            "target_stage": WorkflowStage.PDL1,
            "reason": "",
        })
        with patch("apps.cases.views.LungCancerCase.objects") as cases, \
             patch("apps.cases.views.ClinicalResult.objects") as results, \
             patch("apps.cases.views.ExaminationOrder.objects") as orders, \
             patch("apps.cases.views.ClinicianDecision.objects") as decisions, \
             patch("apps.cases.views.create_examination_order") as create_order:
            cases.select_for_update.return_value.filter.return_value.first.return_value = case
            results.select_for_update.return_value.filter.return_value.first.return_value = result
            orders.filter.return_value.exists.side_effect = [False, True]

            response = DoctorCaseWorkflowDecisionAPIView.post.__wrapped__(
                DoctorCaseWorkflowDecisionAPIView(), request, case.id,
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["current_stage"], WorkflowStage.PDL1)
        self.assertEqual(case.current_stage, WorkflowStage.PDL1)
        create_order.assert_called_once()
        self.assertEqual(create_order.call_args.kwargs["order_type"], WorkflowStage.PDL1)
        decisions.create.assert_called_once()

    def test_confirmed_pathology_advancement_reuses_an_active_pdl1_order(self):
        case = Mock(id=uuid4(), current_stage=WorkflowStage.PATHOLOGY_GENE, case_status="ACTIVE")
        result = Mock(id=uuid4(), workflow_stage=WorkflowStage.PATHOLOGY_GENE)
        request = SimpleNamespace(user=Mock(), data={
            "action": "PROCEED_NEXT_STAGE",
            "source_clinical_result_id": str(result.id),
            "target_stage": WorkflowStage.PDL1,
            "reason": "",
        })
        with patch("apps.cases.views.LungCancerCase.objects") as cases, \
             patch("apps.cases.views.ClinicalResult.objects") as results, \
             patch("apps.cases.views.ExaminationOrder.objects") as orders, \
             patch("apps.cases.views.ClinicianDecision.objects") as decisions, \
             patch("apps.cases.views.create_examination_order") as create_order:
            cases.select_for_update.return_value.filter.return_value.first.return_value = case
            results.select_for_update.return_value.filter.return_value.first.return_value = result
            orders.filter.return_value.exists.return_value = True

            response = DoctorCaseWorkflowDecisionAPIView.post.__wrapped__(
                DoctorCaseWorkflowDecisionAPIView(), request, case.id,
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(case.current_stage, WorkflowStage.PDL1)
        create_order.assert_not_called()
        decisions.create.assert_called_once()

    def test_unfinalized_stage_does_not_block_referral_or_closure(self):
        for action in ("REFERRED_OUT", "CASE_CLOSED"):
            with self.subTest(action=action):
                self.workflow("", action=action)

    def test_tnm_m_storage_fits_every_supported_value(self):
        self.assertGreaterEqual(
            TnmResult._meta.get_field("m_category").max_length,
            max(len(value) for value in TNM_M_VALUES),
        )

    def test_ct_and_tnm_write_endpoints_require_pulmonology_permissions(self):
        for view in (
            DoctorCtResultAPIView,
            DoctorCtResultConfirmAPIView,
            DoctorTnmDraftAPIView,
            DoctorTnmConfirmAPIView,
            DoctorTnmStageAPIView,
            DoctorTnmStageConfirmAPIView,
        ):
            with self.subTest(view=view.__name__):
                self.assertEqual(view.permission_classes, PULMONOLOGY_WRITE_PERMISSIONS)

    def finalize(self, *, candidate_status="candidate_ready", current_stage="PET_CT_TNM", fail_order=False):
        detail = Mock(stage_group="", evidence={"stage": {"stage_group_candidate": "IIA", "stage_group_status": candidate_status}})
        case = Mock(current_stage=current_stage, case_status="ACTIVE")
        diagnosis = Mock(tnm_detail=detail, case=case)
        request = SimpleNamespace(user=Mock(), data={"advance_to_next_stage": True})
        with patch("apps.clinical.views.LungCancerCase.objects") as cases, \
             patch("apps.clinical.views.ClinicalResult.objects") as results, \
             patch("apps.cases.services.examination_orders.create_examination_order") as order, \
             patch("apps.clinical.views.ClinicianDecision.objects") as decisions, \
             patch("apps.clinical.views.DoctorTnmDraftSerializer") as serializer, \
             patch("apps.clinical.views.transaction.set_rollback") as rollback:
            cases.select_for_update.return_value.filter.return_value.first.return_value = case
            results.select_for_update.return_value.filter.return_value.first.return_value = diagnosis
            serializer.return_value.data = {"stage_group": "IIA"}
            if fail_order:
                order.side_effect = ExaminationOrderCreationError("Order failed")
            response = DoctorTnmStageConfirmAPIView.post.__wrapped__(DoctorTnmStageConfirmAPIView(), request, uuid4(), uuid4())
            if fail_order:
                self.assertEqual(response.status_code, 400)
                rollback.assert_called_once_with(True)
                case.save.assert_not_called()
                decisions.create.assert_not_called()
            elif candidate_status != "candidate_ready" or current_stage != "PET_CT_TNM":
                self.assertEqual(response.status_code, 400)
                detail.save.assert_not_called()
                order.assert_not_called()
            else:
                self.assertEqual(response.status_code, 200)
                self.assertEqual(detail.stage_group, "IIA")
                self.assertEqual(case.current_stage, "PATHOLOGY_GENE")
                order.assert_called_once()
                self.assertEqual(order.call_args.kwargs["order_type"], WorkflowStage.PATHOLOGY_GENE)
                self.assertIs(order.call_args.kwargs["case"], case)
                decisions.create.assert_called_once()

    def test_finalization_requires_ready_candidate(self):
        self.finalize(candidate_status="indeterminate")

    def test_finalization_and_advancement_update_case(self):
        self.finalize()

    def test_wrong_stage_does_not_persist_finalization(self):
        self.finalize(current_stage="CT")

    def test_failed_order_rolls_back_finalization(self):
        self.finalize(fail_order=True)

    def test_prescription_exceptions_accept_confirmed_treatment_and_record_prescription_stage(self):
        for action in ("REFERRED_OUT", "CASE_CLOSED"):
            with self.subTest(action=action):
                case = Mock(id=uuid4(), current_stage="PRESCRIPTION", case_status="ACTIVE")
                result = Mock(id=uuid4(), workflow_stage="TREATMENT")
                request = SimpleNamespace(user=Mock(), data={
                    "action": action, "source_clinical_result_id": str(result.id),
                    "target_stage": None, "reason": "Clinical decision",
                })
                with patch("apps.cases.views.LungCancerCase.objects") as cases, \
                     patch("apps.cases.views.ClinicalResult.objects") as results, \
                     patch("apps.cases.views.Prescription.objects") as prescriptions, \
                     patch("apps.cases.views.ClinicianDecision.objects") as decisions:
                    cases.select_for_update.return_value.filter.return_value.first.return_value = case
                    results.select_for_update.return_value.filter.return_value.first.return_value = result
                    prescriptions.filter.return_value.exists.return_value = True
                    response = DoctorCaseWorkflowDecisionAPIView.post.__wrapped__(DoctorCaseWorkflowDecisionAPIView(), request, case.id)
                    self.assertEqual(response.status_code, 200)
                    results.select_for_update.return_value.filter.assert_called_once_with(
                        id=result.id, case=case, workflow_stage__in=["PRESCRIPTION", "TREATMENT"], result_status="CONFIRMED",
                    )
                    self.assertEqual(decisions.create.call_args.kwargs["source_stage"], "PRESCRIPTION")
                    self.assertEqual(decisions.create.call_args.kwargs["source_clinical_result"], result)
                    self.assertEqual(case.case_status, "REFERRED_OUT" if action == "REFERRED_OUT" else "CLOSED")
                    if action == "REFERRED_OUT":
                        prescriptions.filter.assert_not_called()
                    else:
                        prescriptions.filter.assert_called_once_with(
                            case=case, prescription_status="FINAL",
                        )

    def test_case_closure_requires_a_final_prescription(self):
        case = Mock(id=uuid4(), current_stage="PRESCRIPTION", case_status="ACTIVE")
        result = Mock(id=uuid4(), workflow_stage="TREATMENT")
        request = SimpleNamespace(user=Mock(), data={
            "action": "CASE_CLOSED",
            "source_clinical_result_id": str(result.id),
            "target_stage": None,
            "reason": "Regular follow-up",
        })
        with patch("apps.cases.views.LungCancerCase.objects") as cases, \
             patch("apps.cases.views.ClinicalResult.objects") as results, \
             patch("apps.cases.views.Prescription.objects") as prescriptions, \
             patch("apps.cases.views.ClinicianDecision.objects") as decisions:
            cases.select_for_update.return_value.filter.return_value.first.return_value = case
            results.select_for_update.return_value.filter.return_value.first.return_value = result
            prescriptions.filter.return_value.exists.return_value = False

            response = DoctorCaseWorkflowDecisionAPIView.post.__wrapped__(
                DoctorCaseWorkflowDecisionAPIView(), request, case.id,
            )

            self.assertEqual(response.status_code, 400)
            self.assertIn("FINAL prescription", response.data["detail"])
            case.save.assert_not_called()
            decisions.create.assert_not_called()

    def test_repeated_case_closure_does_not_create_a_second_decision(self):
        case = Mock(id=uuid4(), current_stage="PRESCRIPTION", case_status="ACTIVE")
        result = Mock(id=uuid4(), workflow_stage="TREATMENT")
        request = SimpleNamespace(user=Mock(), data={
            "action": "CASE_CLOSED",
            "source_clinical_result_id": str(result.id),
            "target_stage": None,
            "reason": "Regular follow-up",
        })
        with patch("apps.cases.views.LungCancerCase.objects") as cases, \
             patch("apps.cases.views.ClinicalResult.objects") as results, \
             patch("apps.cases.views.Prescription.objects") as prescriptions, \
             patch("apps.cases.views.ClinicianDecision.objects") as decisions:
            locked_case = cases.select_for_update.return_value.filter.return_value.first
            locked_case.side_effect = [case, None]
            results.select_for_update.return_value.filter.return_value.first.return_value = result
            prescriptions.filter.return_value.exists.return_value = True

            first = DoctorCaseWorkflowDecisionAPIView.post.__wrapped__(
                DoctorCaseWorkflowDecisionAPIView(), request, case.id,
            )
            second = DoctorCaseWorkflowDecisionAPIView.post.__wrapped__(
                DoctorCaseWorkflowDecisionAPIView(), request, case.id,
            )

            self.assertEqual(first.status_code, 200)
            self.assertEqual(second.status_code, 404)
            decisions.create.assert_called_once()
            self.assertEqual(decisions.create.call_args.kwargs["reason"], "Regular follow-up")

    def test_prescription_does_not_gain_a_next_stage_path(self):
        case = Mock(id=uuid4(), current_stage="PRESCRIPTION", case_status="ACTIVE")
        result = Mock(id=uuid4(), workflow_stage="PRESCRIPTION")
        request = SimpleNamespace(user=Mock(), data={
            "action": "PROCEED_NEXT_STAGE", "source_clinical_result_id": str(result.id), "target_stage": "TREATMENT",
        })
        with patch("apps.cases.views.LungCancerCase.objects") as cases, \
             patch("apps.cases.views.ClinicalResult.objects") as results, \
             patch("apps.cases.views.ClinicianDecision.objects") as decisions:
            cases.select_for_update.return_value.filter.return_value.first.return_value = case
            results.select_for_update.return_value.filter.return_value.first.return_value = result
            response = DoctorCaseWorkflowDecisionAPIView.post.__wrapped__(DoctorCaseWorkflowDecisionAPIView(), request, case.id)
            self.assertEqual(response.status_code, 400)
            self.assertEqual(results.select_for_update.return_value.filter.call_args.kwargs["workflow_stage__in"], ["PRESCRIPTION"])
            decisions.create.assert_not_called()
            case.save.assert_not_called()
