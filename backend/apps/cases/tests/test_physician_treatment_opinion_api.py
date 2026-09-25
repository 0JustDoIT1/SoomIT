import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.cases.models import WorkflowStage
from apps.cases.views import DoctorPhysicianTreatmentOpinionAPIView


class DoctorPhysicianTreatmentOpinionAPITests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = SimpleNamespace(
            is_authenticated=True,
            account_status="ACTIVE",
            department_role_id=uuid.uuid4(),
        )
        self.case_id = uuid.uuid4()
        self.case = SimpleNamespace(id=self.case_id, pk=self.case_id, current_stage=WorkflowStage.TREATMENT)

    def _request(self, method="get", data=None, *, department_code="PULMONOLOGY"):
        request = getattr(self.factory, method)(
            "/physician-treatment-opinion/",
            data or {},
            format="json",
        )
        force_authenticate(
            request,
            user=self.user,
            token={"role": "DOCTOR", "department_code": department_code},
        )
        return request

    @patch("apps.cases.views.PhysicianTreatmentOpinion.objects")
    @patch("apps.cases.views.LungCancerCase.objects")
    def test_get_returns_empty_case_scoped_opinion(self, case_objects, opinion_objects):
        case_objects.filter.return_value.first.return_value = self.case
        opinion_objects.filter.return_value.first.return_value = None

        response = DoctorPhysicianTreatmentOpinionAPIView.as_view()(
            self._request(), case_id=self.case_id,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["case"], str(self.case_id))
        self.assertEqual(response.data["physician_opinion"], "")
        case_objects.filter.assert_called_once_with(
            id=self.case_id,
            primary_doctor=self.user,
            case_status="ACTIVE",
        )

    @patch("apps.cases.views.PhysicianTreatmentOpinion.objects")
    @patch("apps.cases.views.LungCancerCase.objects")
    def test_get_remains_available_after_case_advances_to_prescription(self, case_objects, opinion_objects):
        self.case.current_stage = WorkflowStage.PRESCRIPTION
        case_objects.filter.return_value.first.return_value = self.case
        opinion_objects.filter.return_value.first.return_value = None

        response = DoctorPhysicianTreatmentOpinionAPIView.as_view()(
            self._request(), case_id=self.case_id,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["physician_opinion"], "")
        opinion_objects.filter.assert_called_once_with(case=self.case)

    @patch("apps.cases.views.PhysicianTreatmentOpinion.objects")
    @patch("apps.cases.views.LungCancerCase.objects")
    def test_put_saves_independent_opinion_during_treatment(self, case_objects, opinion_objects):
        case_objects.filter.return_value.first.return_value = self.case
        now = datetime.now(timezone.utc)
        saved = SimpleNamespace(
            id=uuid.uuid4(),
            case=self.case,
            case_id=self.case_id,
            physician_opinion="의료진 독립 소견",
            created_at=now,
            updated_at=now,
        )
        opinion_objects.update_or_create.return_value = (saved, True)

        response = DoctorPhysicianTreatmentOpinionAPIView.as_view()(
            self._request("put", {"physician_opinion": "의료진 독립 소견"}),
            case_id=self.case_id,
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["physician_opinion"], "의료진 독립 소견")
        opinion_objects.update_or_create.assert_called_once_with(
            case=self.case,
            defaults={"physician_opinion": "의료진 독립 소견"},
        )

    @patch("apps.cases.views.PhysicianTreatmentOpinion.objects")
    @patch("apps.cases.views.LungCancerCase.objects")
    def test_put_updates_the_same_case_opinion(self, case_objects, opinion_objects):
        case_objects.filter.return_value.first.return_value = self.case
        now = datetime.now(timezone.utc)
        saved = SimpleNamespace(
            id=uuid.uuid4(), case=self.case, case_id=self.case_id,
            physician_opinion="수정된 소견", created_at=now, updated_at=now,
        )
        opinion_objects.update_or_create.return_value = (saved, False)

        response = DoctorPhysicianTreatmentOpinionAPIView.as_view()(
            self._request("put", {"physician_opinion": "수정된 소견"}),
            case_id=self.case_id,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["physician_opinion"], "수정된 소견")

    @patch("apps.cases.views.PhysicianTreatmentOpinion.objects")
    @patch("apps.cases.views.LungCancerCase.objects")
    def test_get_keeps_opinions_isolated_by_case(self, case_objects, opinion_objects):
        second_case_id = uuid.uuid4()
        second_case = SimpleNamespace(
            id=second_case_id,
            pk=second_case_id,
            current_stage=WorkflowStage.TREATMENT,
        )
        now = datetime.now(timezone.utc)
        opinions = {
            self.case_id: SimpleNamespace(
                id=uuid.uuid4(), case=self.case, case_id=self.case_id,
                physician_opinion="Case 1 소견", created_at=now, updated_at=now,
            ),
            second_case_id: SimpleNamespace(
                id=uuid.uuid4(), case=second_case, case_id=second_case_id,
                physician_opinion="Case 2 소견", created_at=now, updated_at=now,
            ),
        }
        cases = {self.case_id: self.case, second_case_id: second_case}
        case_objects.filter.side_effect = lambda **kwargs: SimpleNamespace(
            first=lambda: cases.get(kwargs["id"]),
        )
        opinion_objects.filter.side_effect = lambda **kwargs: SimpleNamespace(
            first=lambda: opinions[kwargs["case"].id],
        )

        first = DoctorPhysicianTreatmentOpinionAPIView.as_view()(
            self._request(), case_id=self.case_id,
        )
        second = DoctorPhysicianTreatmentOpinionAPIView.as_view()(
            self._request(), case_id=second_case_id,
        )

        self.assertEqual(first.data["physician_opinion"], "Case 1 소견")
        self.assertEqual(second.data["physician_opinion"], "Case 2 소견")

    @patch("apps.cases.views.PhysicianTreatmentOpinion.objects")
    @patch("apps.cases.views.LungCancerCase.objects")
    def test_put_is_read_only_after_treatment_confirmation(self, case_objects, opinion_objects):
        self.case.current_stage = WorkflowStage.PRESCRIPTION
        case_objects.filter.return_value.first.return_value = self.case

        response = DoctorPhysicianTreatmentOpinionAPIView.as_view()(
            self._request("put", {"physician_opinion": "변경 시도"}),
            case_id=self.case_id,
        )

        self.assertEqual(response.status_code, 409)
        opinion_objects.update_or_create.assert_not_called()

    @patch("apps.cases.views.PhysicianTreatmentOpinion.objects")
    @patch("apps.cases.views.LungCancerCase.objects")
    def test_unassigned_case_is_hidden(self, case_objects, opinion_objects):
        case_objects.filter.return_value.first.return_value = None

        response = DoctorPhysicianTreatmentOpinionAPIView.as_view()(
            self._request(), case_id=self.case_id,
        )

        self.assertEqual(response.status_code, 404)
        opinion_objects.filter.assert_not_called()

    @patch("apps.cases.views.PhysicianTreatmentOpinion.objects")
    @patch("apps.cases.views.LungCancerCase.objects")
    def test_unassigned_doctor_cannot_write(self, case_objects, opinion_objects):
        case_objects.filter.return_value.first.return_value = None

        response = DoctorPhysicianTreatmentOpinionAPIView.as_view()(
            self._request("put", {"physician_opinion": "권한 없는 변경"}),
            case_id=self.case_id,
        )

        self.assertEqual(response.status_code, 404)
        opinion_objects.update_or_create.assert_not_called()

    @patch("apps.cases.views.PhysicianTreatmentOpinion.objects")
    @patch("apps.cases.views.LungCancerCase.objects")
    def test_other_department_cannot_write(self, case_objects, opinion_objects):
        case_objects.filter.return_value.first.return_value = self.case

        response = DoctorPhysicianTreatmentOpinionAPIView.as_view()(
            self._request(
                "put",
                {"physician_opinion": "병리과 변경 시도"},
                department_code="PATHOLOGY",
            ),
            case_id=self.case_id,
        )

        self.assertEqual(response.status_code, 403)
        case_objects.filter.assert_not_called()
        opinion_objects.update_or_create.assert_not_called()
