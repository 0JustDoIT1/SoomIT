import uuid
from datetime import date

from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.audit.models import AuditLog
from apps.cases.models import LungCancerCase, WorkflowStage
from apps.notifications.models import NotificationLog
from apps.patients.models import Patient

from .models import CaseChatMessage
from .permissions import can_access_case_chat


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
            account_status=User.AccountStatus.ACTIVE,
        )
        radiology_department = Department.objects.create(
            hospital=hospital,
            code="RADIOLOGY",
            name="Radiology",
        )
        radiology_role = DepartmentRole.objects.create(
            department=radiology_department,
            role=DepartmentRole.Role.TECHNOLOGIST,
            display_name="Technologist",
        )
        self.radiologist = User.objects.create_user(
            login_id="chat-radiologist",
            password="test-password",
            name="Chat Radiologist",
            department_role=radiology_role,
            account_status=User.AccountStatus.ACTIVE,
        )
        pathology_department = Department.objects.create(
            hospital=hospital,
            code="PATHOLOGY",
            name="Pathology",
        )
        pathology_role = DepartmentRole.objects.create(
            department=pathology_department,
            role=DepartmentRole.Role.TECHNOLOGIST,
            display_name="Technologist",
        )
        self.pathology_technologist = User.objects.create_user(
            login_id="chat-pathology",
            password="test-password",
            name="Chat Pathology Technologist",
            department_role=pathology_role,
            account_status=User.AccountStatus.ACTIVE,
        )
        administration_department = Department.objects.create(
            hospital=hospital,
            code="ADMINISTRATION",
            name="Administration",
        )
        administration_role = DepartmentRole.objects.create(
            department=administration_department,
            role=DepartmentRole.Role.MEDICAL_STAFF,
            display_name="Administration Staff",
        )
        self.administration_user = User.objects.create_user(
            login_id="chat-administration",
            password="test-password",
            name="Chat Administration",
            department_role=administration_role,
            account_status=User.AccountStatus.ACTIVE,
        )
        other_hospital = Hospital.objects.create(name="Other Chat Hospital", code="OTHER-CHAT")
        other_radiology_department = Department.objects.create(
            hospital=other_hospital,
            code="RADIOLOGY",
            name="Radiology",
        )
        other_radiology_role = DepartmentRole.objects.create(
            department=other_radiology_department,
            role=DepartmentRole.Role.TECHNOLOGIST,
            display_name="Technologist",
        )
        self.other_hospital_radiologist = User.objects.create_user(
            login_id="other-chat-radiologist",
            password="test-password",
            name="Other Chat Radiologist",
            department_role=other_radiology_role,
            account_status=User.AccountStatus.ACTIVE,
        )
        self.other_doctor = User.objects.create_user(
            login_id="other-chat-doctor",
            password="test-password",
            name="Other Chat Doctor",
            department_role=role,
            account_status=User.AccountStatus.ACTIVE,
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
        self.client = APIClient()

    def authenticate(self, user):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}")

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

    def test_primary_pulmonology_doctor_can_access(self):
        self.assertTrue(can_access_case_chat(self.sender, self.case))

    def test_other_pulmonology_doctor_cannot_access(self):
        self.assertFalse(can_access_case_chat(self.other_doctor, self.case))

    def test_same_hospital_radiology_technologist_can_access(self):
        self.assertTrue(can_access_case_chat(self.radiologist, self.case))

    def test_other_hospital_radiology_technologist_cannot_access(self):
        self.assertFalse(can_access_case_chat(self.other_hospital_radiologist, self.case))

    def test_same_hospital_pathology_technologist_can_access(self):
        self.assertTrue(can_access_case_chat(self.pathology_technologist, self.case))

    def test_administration_user_cannot_access(self):
        self.assertFalse(can_access_case_chat(self.administration_user, self.case))

    def test_message_history_returns_cursor_page(self):
        CaseChatMessage.objects.bulk_create(
            [
                CaseChatMessage(
                    case=self.case,
                    sender=self.sender,
                    client_message_id=uuid.uuid4(),
                    body=f"메시지 {index}",
                )
                for index in range(51)
            ]
        )
        self.authenticate(self.sender)

        response = self.client.get(
            reverse("chat:case-message-list", kwargs={"case_id": self.case.id})
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 50)
        self.assertIsNotNone(response.data["next_cursor"])
        first = response.data["results"][0]
        self.assertEqual(first["case_id"], self.case.id)
        self.assertEqual(first["sender"]["department"], "PULMONOLOGY")
        self.assertEqual(first["sender"]["role"], "DOCTOR")

        next_response = self.client.get(
            reverse("chat:case-message-list", kwargs={"case_id": self.case.id}),
            {"cursor": response.data["next_cursor"]},
        )
        self.assertEqual(next_response.status_code, 200)
        self.assertEqual(len(next_response.data["results"]), 1)
        self.assertIsNone(next_response.data["next_cursor"])

    def test_message_history_rejects_other_doctor(self):
        self.authenticate(self.other_doctor)
        response = self.client.get(
            reverse("chat:case-message-list", kwargs={"case_id": self.case.id})
        )
        self.assertEqual(response.status_code, 403)

    def test_message_history_requires_authentication(self):
        response = self.client.get(
            reverse("chat:case-message-list", kwargs={"case_id": self.case.id})
        )
        self.assertEqual(response.status_code, 401)

    @override_settings(AI_SERVICE_TOKEN="test-realtime-service-token")
    def test_internal_create_is_idempotent(self):
        self.authenticate(self.sender)
        url = reverse("chat:internal-case-message-create", kwargs={"case_id": self.case.id})
        client_message_id = str(uuid.uuid4())
        headers = {"HTTP_X_SERVICE_TOKEN": "test-realtime-service-token"}

        first = self.client.post(
            url,
            {"client_message_id": client_message_id, "body": "검사 영상을 확인했습니다."},
            format="json",
            **headers,
        )
        replay = self.client.post(
            url,
            {"client_message_id": client_message_id, "body": "검사 영상을 확인했습니다."},
            format="json",
            **headers,
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(first.data["message"]["id"], replay.data["message"]["id"])
        self.assertEqual(CaseChatMessage.objects.count(), 1)

    @override_settings(AI_SERVICE_TOKEN="test-realtime-service-token")
    def test_internal_create_rejects_reused_id_with_different_body(self):
        self.authenticate(self.sender)
        url = reverse("chat:internal-case-message-create", kwargs={"case_id": self.case.id})
        client_message_id = str(uuid.uuid4())
        headers = {"HTTP_X_SERVICE_TOKEN": "test-realtime-service-token"}
        self.client.post(
            url,
            {"client_message_id": client_message_id, "body": "첫 메시지"},
            format="json",
            **headers,
        )

        response = self.client.post(
            url,
            {"client_message_id": client_message_id, "body": "다른 메시지"},
            format="json",
            **headers,
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(CaseChatMessage.objects.count(), 1)

    @override_settings(AI_SERVICE_TOKEN="test-realtime-service-token")
    def test_internal_create_rejects_html(self):
        self.authenticate(self.sender)
        response = self.client.post(
            reverse("chat:internal-case-message-create", kwargs={"case_id": self.case.id}),
            {"client_message_id": str(uuid.uuid4()), "body": "<b>메시지</b>"},
            format="json",
            HTTP_X_SERVICE_TOKEN="test-realtime-service-token",
        )
        self.assertEqual(response.status_code, 400)

    @override_settings(AI_SERVICE_TOKEN="test-realtime-service-token")
    def test_private_message_is_visible_only_to_sender_and_selected_recipient(self):
        self.authenticate(self.sender)
        create_url = reverse("chat:internal-case-message-create", kwargs={"case_id": self.case.id})
        with self.captureOnCommitCallbacks(execute=True):
            created = self.client.post(
                create_url,
                {
                    "client_message_id": str(uuid.uuid4()),
                    "body": "영상 소견을 확인 부탁드립니다.",
                    "is_private": True,
                    "recipient_ids": [str(self.radiologist.id)],
                },
                format="json",
                HTTP_X_SERVICE_TOKEN="test-realtime-service-token",
            )
        self.assertEqual(created.status_code, 201)
        self.assertTrue(created.data["message"]["is_private"])
        self.assertEqual(created.data["message"]["recipient_ids"], [str(self.radiologist.id)])
        notification = NotificationLog.objects.get(recipient_user=self.radiologist, notification_type="CASE_CHAT")
        self.assertEqual(notification.case_id, self.case.id)
        self.assertNotIn("영상 소견을 확인", notification.message)
        audit_log = AuditLog.objects.get(target_id=created.data["message"]["id"])
        self.assertEqual(audit_log.metadata["event"], "PRIVATE_CASE_CHAT_MESSAGE_CREATED")
        self.assertEqual(audit_log.metadata["recipient_count"], 1)
        self.assertIsNone(audit_log.before_data)
        self.assertIsNone(audit_log.after_data)

        history_url = reverse("chat:case-message-list", kwargs={"case_id": self.case.id})
        self.authenticate(self.radiologist)
        recipient_history = self.client.get(history_url)
        self.assertEqual(recipient_history.status_code, 200)
        self.assertEqual(len(recipient_history.data["results"]), 1)

        self.authenticate(self.pathology_technologist)
        unrelated_history = self.client.get(history_url)
        self.assertEqual(unrelated_history.status_code, 200)
        self.assertEqual(unrelated_history.data["results"], [])

    @override_settings(AI_SERVICE_TOKEN="test-realtime-service-token")
    def test_private_message_requires_at_least_one_recipient(self):
        self.authenticate(self.sender)
        response = self.client.post(
            reverse("chat:internal-case-message-create", kwargs={"case_id": self.case.id}),
            {
                "client_message_id": str(uuid.uuid4()),
                "body": "수신자 없는 개인 메시지",
                "is_private": True,
            },
            format="json",
            HTTP_X_SERVICE_TOKEN="test-realtime-service-token",
        )
        self.assertEqual(response.status_code, 400)

    @override_settings(AI_SERVICE_TOKEN="test-realtime-service-token")
    def test_message_read_receipt_is_recorded_for_recipient_and_visible_to_sender(self):
        message = CaseChatMessage.objects.create(
            case=self.case,
            sender=self.sender,
            client_message_id=uuid.uuid4(),
            body="판독 확인 부탁드립니다.",
            is_private=True,
        )
        message.recipients.add(self.radiologist)
        read_url = reverse("chat:case-message-read", kwargs={"case_id": self.case.id})
        self.authenticate(self.radiologist)
        marked = self.client.post(read_url, {"message_ids": [str(message.id)]}, format="json")
        repeated = self.client.post(read_url, {"message_ids": [str(message.id)]}, format="json")
        self.assertEqual(marked.status_code, 200)
        self.assertEqual(marked.data["marked_count"], 1)
        self.assertEqual(marked.data["read_messages"][0]["reader"]["id"], str(self.radiologist.id))
        self.assertEqual(marked.data["read_messages"][0]["sender_id"], str(self.sender.id))
        self.assertEqual(repeated.data["marked_count"], 0)

        self.authenticate(self.sender)
        history = self.client.get(reverse("chat:case-message-list", kwargs={"case_id": self.case.id}))
        self.assertEqual(history.status_code, 200)
        self.assertEqual(history.data["results"][0]["read_by"][0]["id"], str(self.radiologist.id))

        self.authenticate(self.pathology_technologist)
        unrelated_mark = self.client.post(read_url, {"message_ids": [str(message.id)]}, format="json")
        self.assertEqual(unrelated_mark.status_code, 200)
        self.assertEqual(unrelated_mark.data["marked_count"], 0)

    def test_unread_count_includes_only_visible_unread_messages(self):
        public_message = CaseChatMessage.objects.create(
            case=self.case,
            sender=self.sender,
            client_message_id=uuid.uuid4(),
            body="공용 메시지",
        )
        private_message = CaseChatMessage.objects.create(
            case=self.case,
            sender=self.sender,
            client_message_id=uuid.uuid4(),
            body="개인 메시지",
            is_private=True,
        )
        private_message.recipients.add(self.radiologist)
        count_url = reverse("chat:case-message-unread-count", kwargs={"case_id": self.case.id})

        self.authenticate(self.radiologist)
        before_read = self.client.get(count_url)
        self.assertEqual(before_read.status_code, 200)
        self.assertEqual(before_read.data["unread_count"], 2)

        self.client.post(
            reverse("chat:case-message-read", kwargs={"case_id": self.case.id}),
            {"message_ids": [str(public_message.id)]},
            format="json",
        )
        after_read = self.client.get(count_url)
        self.assertEqual(after_read.data["unread_count"], 1)

        self.authenticate(self.pathology_technologist)
        unrelated_count = self.client.get(count_url)
        self.assertEqual(unrelated_count.status_code, 200)
        self.assertEqual(unrelated_count.data["unread_count"], 1)

    @override_settings(AI_SERVICE_TOKEN="test-realtime-service-token")
    def test_internal_create_requires_service_token(self):
        self.authenticate(self.sender)
        response = self.client.post(
            reverse("chat:internal-case-message-create", kwargs={"case_id": self.case.id}),
            {"client_message_id": str(uuid.uuid4()), "body": "메시지"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    @override_settings(AI_SERVICE_TOKEN="test-realtime-service-token")
    def test_internal_access_accepts_authorized_case_member(self):
        self.authenticate(self.pathology_technologist)
        response = self.client.get(
            reverse("chat:internal-case-access", kwargs={"case_id": self.case.id}),
            HTTP_X_SERVICE_TOKEN="test-realtime-service-token",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["allowed"])

    @override_settings(AI_SERVICE_TOKEN="test-realtime-service-token")
    def test_internal_access_rejects_unauthorized_case_member(self):
        self.authenticate(self.other_doctor)
        response = self.client.get(
            reverse("chat:internal-case-access", kwargs={"case_id": self.case.id}),
            HTTP_X_SERVICE_TOKEN="test-realtime-service-token",
        )
        self.assertEqual(response.status_code, 403)

    def test_inactive_user_cannot_access(self):
        self.radiologist.account_status = User.AccountStatus.DISABLED
        self.assertFalse(can_access_case_chat(self.radiologist, self.case))
