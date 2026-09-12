from decimal import Decimal
from unittest.mock import patch

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.constants import DEFAULT_DEPARTMENT_TEMPLATES
from apps.accounts.models import (
    Department,
    DepartmentRole,
    Hospital,
    HospitalAdmin,
    SystemAdmin,
    User,
)
from apps.accounts.services.kakao_local import (
    KakaoAddressNotFoundError,
    KakaoGeocodingServiceError,
)


class SystemAdminHospitalCreateAPITestCase(APITestCase):
    def setUp(self):
        self.url = reverse("system-admin:hospital-create")
        self.system_user = User.objects.create_user(
            login_id="system-admin",
            password="password",
            name="시스템 관리자",
            account_status=User.AccountStatus.ACTIVE,
        )
        SystemAdmin.objects.create(user=self.system_user)
        geocode_patcher = patch(
            "apps.accounts.system_admin_views.geocode_road_address",
            return_value=(Decimal("37.566295"), Decimal("126.977945")),
        )
        self.geocode = geocode_patcher.start()
        self.addCleanup(geocode_patcher.stop)

    def authenticate(self, user):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}")

    def payload(self, **overrides):
        payload = {
            "name": "숨잇병원",
            "code": "soomit-01",
            "address": "서울특별시 중구 세종대로 110",
            "postal_code": "04524",
        }
        payload.update(overrides)
        return payload

    def test_system_admin_creates_hospital_departments_and_roles(self):
        self.authenticate(self.system_user)
        response = self.client.post(self.url, self.payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["hospital"]["code"], "SOOMIT-01")
        self.assertEqual(len(response.data["departments"]), len(DEFAULT_DEPARTMENT_TEMPLATES))
        hospital = Hospital.objects.get(code="SOOMIT-01")
        self.assertEqual(hospital.departments.count(), len(DEFAULT_DEPARTMENT_TEMPLATES))
        self.assertEqual(
            DepartmentRole.objects.filter(department__hospital=hospital).count(),
            sum(len(template.roles) for template in DEFAULT_DEPARTMENT_TEMPLATES),
        )

    def test_hospital_address_fields_are_saved_and_returned(self):
        self.authenticate(self.system_user)
        response = self.client.post(
            self.url,
            self.payload(
                address="서울특별시 중구 세종대로 110",
                address_detail="본관 3층",
                postal_code="04524",
                latitude="37.566295",
                longitude="126.977945",
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        hospital = Hospital.objects.get(code="SOOMIT-01")
        self.assertEqual(hospital.address, "서울특별시 중구 세종대로 110")
        self.assertEqual(hospital.address_detail, "본관 3층")
        self.assertEqual(hospital.postal_code, "04524")
        self.assertEqual(str(hospital.latitude), "37.566295")
        self.assertEqual(str(hospital.longitude), "126.977945")
        self.assertEqual(response.data["hospital"]["address"], hospital.address)
        self.assertEqual(response.data["hospital"]["address_detail"], hospital.address_detail)
        self.assertEqual(response.data["hospital"]["postal_code"], hospital.postal_code)
        self.assertEqual(response.data["hospital"]["latitude"], "37.566295")
        self.assertEqual(response.data["hospital"]["longitude"], "126.977945")

    def test_address_detail_remains_optional(self):
        self.authenticate(self.system_user)
        response = self.client.post(self.url, self.payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        hospital = Hospital.objects.get(code="SOOMIT-01")
        self.assertIsNone(hospital.address_detail)

    def test_client_coordinates_are_ignored(self):
        self.authenticate(self.system_user)
        response = self.client.post(
            self.url,
            self.payload(latitude="1.000000", longitude="2.000000"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        hospital = Hospital.objects.get(code="SOOMIT-01")
        self.assertEqual(hospital.latitude, Decimal("37.566295"))
        self.assertEqual(hospital.longitude, Decimal("126.977945"))

    def test_address_and_postal_code_are_required(self):
        self.authenticate(self.system_user)
        for missing_field in ("address", "postal_code"):
            payload = self.payload()
            payload.pop(missing_field)
            response = self.client.post(self.url, payload, format="json")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn(missing_field, response.data)

    def test_empty_geocoding_result_does_not_create_hospital(self):
        self.authenticate(self.system_user)
        self.geocode.side_effect = KakaoAddressNotFoundError("좌표 없음")

        response = self.client.post(self.url, self.payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Hospital.objects.filter(code="SOOMIT-01").exists())
        self.assertEqual(Department.objects.count(), 0)

    def test_geocoding_service_error_does_not_create_hospital(self):
        self.authenticate(self.system_user)
        self.geocode.side_effect = KakaoGeocodingServiceError("서비스 오류")

        response = self.client.post(self.url, self.payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertFalse(Hospital.objects.filter(code="SOOMIT-01").exists())
        self.assertEqual(Department.objects.count(), 0)

    def test_unauthenticated_request_is_rejected(self):
        response = self.client.post(self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_regular_employee_is_forbidden(self):
        hospital = Hospital.objects.create(name="기존병원", code="EXISTING")
        department = Department.objects.create(
            hospital=hospital,
            code="PULMONOLOGY",
            name="호흡기내과",
        )
        role = DepartmentRole.objects.create(
            department=department,
            role=DepartmentRole.Role.DOCTOR,
            display_name="의사",
        )
        employee = User.objects.create_user(
            login_id="employee",
            password="password",
            name="직원",
            department_role=role,
            account_status=User.AccountStatus.ACTIVE,
        )
        self.authenticate(employee)

        response = self.client.post(self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_hospital_admin_is_forbidden(self):
        hospital = Hospital.objects.create(name="기존병원", code="EXISTING")
        admin_user = User.objects.create_user(
            login_id="hospital-admin",
            password="password",
            name="병원 관리자",
            account_status=User.AccountStatus.ACTIVE,
        )
        HospitalAdmin.objects.create(user=admin_user, hospital=hospital)
        self.authenticate(admin_user)

        response = self.client.post(self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_duplicate_code_is_rejected_case_insensitively(self):
        Hospital.objects.create(name="기존병원", code="SOOMIT-01")
        self.authenticate(self.system_user)

        response = self.client.post(self.url, self.payload(code="soomit-01"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("code", response.data)

    def test_invalid_code_is_rejected(self):
        self.authenticate(self.system_user)
        response = self.client.post(self.url, self.payload(code="SOOM IT!"), format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("code", response.data)

    def test_departments_are_independent_between_hospitals(self):
        self.authenticate(self.system_user)
        first = self.client.post(self.url, self.payload(code="FIRST"), format="json")
        second = self.client.post(self.url, self.payload(code="SECOND"), format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        first_ids = {item["id"] for item in first.data["departments"]}
        second_ids = {item["id"] for item in second.data["departments"]}
        self.assertTrue(first_ids.isdisjoint(second_ids))
