"""Database-free validation for the cancelled PD-L1 reorder boundary."""
from unittest.mock import Mock, patch

from django.test import SimpleTestCase

from apps.cases.models import ExaminationOrder, WorkflowStage
from apps.cases.services.pathology_orders import (
    PathologyOrderCreationError,
    create_follow_up_pathology_order,
)
from apps.pathology.models import PathologyWorkItem


class Pdl1ReorderValidationTests(SimpleTestCase):
    def reorder(self, *, pdl1_result_exists=False, completed_order_exists=False, cancelled_order_exists=True, active_order_exists=False):
        case = Mock(pk="case-1", current_stage=WorkflowStage.PDL1)
        doctor = Mock()
        with patch("apps.cases.services.pathology_orders.LungCancerCase.objects") as cases, \
             patch("apps.cases.services.pathology_orders.ClinicalResult.objects") as results, \
             patch("apps.cases.services.pathology_orders.ExaminationOrder.objects") as orders, \
             patch("apps.cases.services.pathology_orders.PathologyWorkItem.objects") as work_items:
            cases.select_for_update.return_value.get.return_value = case
            results.filter.return_value.exists.return_value = pdl1_result_exists
            orders.filter.return_value.exists.side_effect = [
                completed_order_exists,
                cancelled_order_exists,
                active_order_exists,
            ]
            created_order = Mock(status=ExaminationOrder.Status.ORDERED)
            created_work_item = Mock(status=PathologyWorkItem.Status.PENDING)
            orders.create.return_value = created_order
            work_items.create.return_value = created_work_item
            result = create_follow_up_pathology_order.__wrapped__(
                case=case,
                requesting_doctor=doctor,
                pathology_test_type="PDL1",
                priority=ExaminationOrder.Priority.NORMAL,
                purpose="Cancelled PD-L1 reorder",
                clinical_note="",
            )
            return result, case, orders, work_items

    def test_cancelled_pdl1_reorder_creates_a_fresh_order_and_work_item(self):
        (order, work_item), case, orders, work_items = self.reorder()

        self.assertEqual(case.current_stage, WorkflowStage.PDL1)
        self.assertEqual(order.status, ExaminationOrder.Status.ORDERED)
        self.assertEqual(work_item.status, PathologyWorkItem.Status.PENDING)
        orders.create.assert_called_once()
        self.assertEqual(orders.create.call_args.kwargs["order_type"], ExaminationOrder.OrderType.PDL1)
        work_items.create.assert_called_once()
        self.assertEqual(work_items.create.call_args.kwargs["task_type"], PathologyWorkItem.TaskType.WSI_UPLOAD)

    def test_reorder_rejects_existing_active_pdl1_order(self):
        with self.assertRaises(PathologyOrderCreationError):
            self.reorder(active_order_exists=True)

    def test_reorder_rejects_completed_order_or_existing_result(self):
        with self.subTest(condition="completed"):
            with self.assertRaises(PathologyOrderCreationError):
                self.reorder(completed_order_exists=True)
        with self.subTest(condition="result"):
            with self.assertRaises(PathologyOrderCreationError):
                self.reorder(pdl1_result_exists=True)
