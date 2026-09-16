import uuid
from datetime import date

from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.cases.models import LungCancerCase, WorkflowStage
from apps.patients.models import Patient

from .models import CaseChatMessage


class CaseChatMessageModelTestCase(TestCase):
    def setUp(self):
        hospital = Hospital.objects.create(name="Chat Hospital", code="CHAT-HOSP")
        department = Department.objects.create(
            hospital=hospital,
            code="PULMONOLOGY",
            name="Pulmonology",
        )
        role = DepartmentRole.objects.create(
            department=department,
            role=DepartmentRole.Role.DOCTOR,
            display_name="Doctor",
        )
        self.sender = User.objects.create_user(
            login_id="chat-doctor",
            password="test-password",
            name="Chat Doctor",
            department_role=role,
        )
        patient = Patient.objects.create(
            hospital=hospital,
            patient_code="CHAT-PATIENT",
            name="Chat Patient",
            birth_date=date(1960, 1, 1),
            sex=Patient.Sex.MALE,
            phone_number="010-0000-0099",
            phone_number_hash="chat-patient-hash",
        )
        self.case = LungCancerCase.objects.create(
            patient=patient,
            case_code="CHAT-CASE",
            primary_doctor=self.sender,
            current_stage=WorkflowStage.XRAY,
        )

    def test_replayed_client_message_is_rejected_for_same_case_and_sender(self):
        client_message_id = uuid.uuid4()
        CaseChatMessage.objects.create(
            case=self.case,
            sender=self.sender,
            client_message_id=client_message_id,
            body="첫 번째 메시지",
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            CaseChatMessage.objects.create(
                case=self.case,
                sender=self.sender,
                client_message_id=client_message_id,
                body="재전송된 메시지",
            )
