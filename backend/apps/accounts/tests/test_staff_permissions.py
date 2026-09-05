from types import SimpleNamespace

from django.test import RequestFactory, SimpleTestCase, override_settings
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.accounts.models import DepartmentRole, User
from apps.accounts.permissions import (
    IsActiveStaff,
    IsAdministrationStaff,
    IsDoctor,
    IsMedicalStaff,
    IsNurse,
    IsPathologyStaff,
    IsPulmonologyStaff,
    IsRadiologyStaff,
    IsSameHospital,
    IsTechnologist,
)


class StaffPermissionTestCase(SimpleTestCase):
    def setUp(self):
        self.request = RequestFactory().get("/")
        self.request.user = SimpleNamespace(
            is_authenticated=True,
            account_status=User.AccountStatus.ACTIVE,
            department_role_id="role-id",
        )
        self.request.auth = AccessToken()

    def set_claims(self, **claims):
        token = AccessToken()
        for key, value in claims.items():
            token[key] = value
        self.request.auth = token

    def test_pathology_department_permission_allows_matching_claim(self):
        self.set_claims(department_code="PATHOLOGY")
        self.assertTrue(IsPathologyStaff().has_permission(self.request, None))

    def test_pulmonology_department_permission_allows_matching_claim(self):
        self.set_claims(department_code="PULMONOLOGY")
        self.assertTrue(IsPulmonologyStaff().has_permission(self.request, None))

    def test_department_permission_denies_non_matching_claim(self):
        self.set_claims(department_code="PATHOLOGY")
        self.assertFalse(IsPulmonologyStaff().has_permission(self.request, None))

    @override_settings(SOOMIT_RADIOLOGY_DEPARTMENT_CODE="VERIFIED_RAD_CODE")
    def test_radiology_permission_uses_configured_actual_code(self):
        self.set_claims(department_code="VERIFIED_RAD_CODE")
        self.assertTrue(IsRadiologyStaff().has_permission(self.request, None))

    @override_settings(SOOMIT_ADMINISTRATION_DEPARTMENT_CODE="VERIFIED_ADMIN_CODE")
    def test_administration_permission_uses_configured_actual_code(self):
        self.set_claims(department_code="VERIFIED_ADMIN_CODE")
        self.assertTrue(IsAdministrationStaff().has_permission(self.request, None))

    def test_each_existing_role_permission_uses_token_role(self):
        permission_by_role = {
            DepartmentRole.Role.DOCTOR: IsDoctor,
            DepartmentRole.Role.NURSE: IsNurse,
            DepartmentRole.Role.TECHNOLOGIST: IsTechnologist,
            DepartmentRole.Role.MEDICAL_STAFF: IsMedicalStaff,
        }
        for role, permission_class in permission_by_role.items():
            with self.subTest(role=role):
                self.set_claims(role=role)
                self.assertTrue(
                    permission_class().has_permission(self.request, None),
                )

    def test_role_permission_denies_different_role(self):
        self.set_claims(role=DepartmentRole.Role.NURSE)
        self.assertFalse(IsDoctor().has_permission(self.request, None))

    def test_inactive_user_is_denied(self):
        self.request.user.account_status = User.AccountStatus.DISABLED
        self.assertFalse(IsActiveStaff().has_permission(self.request, None))

    def test_missing_or_malformed_claims_deny_without_error(self):
        for token in (None, {}, {"department_code": 123}, {"role": "UNKNOWN"}):
            with self.subTest(token=token):
                self.request.auth = token
                self.assertFalse(
                    IsPathologyStaff().has_permission(self.request, None),
                )
                self.assertFalse(IsDoctor().has_permission(self.request, None))

    def test_same_hospital_compares_token_with_explicit_object_interface(self):
        hospital_id = "877ea63f-776d-45ec-9409-97646ba8513f"
        self.set_claims(hospital_id=hospital_id)

        same_hospital_object = SimpleNamespace(
            permission_hospital_id=hospital_id,
        )
        other_hospital_object = SimpleNamespace(
            permission_hospital_id="2bc74c79-a241-42be-bea6-a7585682a735",
        )

        permission = IsSameHospital()
        self.assertTrue(
            permission.has_object_permission(
                self.request,
                None,
                same_hospital_object,
            ),
        )
        self.assertFalse(
            permission.has_object_permission(
                self.request,
                None,
                other_hospital_object,
            ),
        )

    def test_same_hospital_denies_malformed_claim_without_error(self):
        self.set_claims(hospital_id="not-a-uuid")
        obj = SimpleNamespace(
            permission_hospital_id="877ea63f-776d-45ec-9409-97646ba8513f",
        )
        self.assertFalse(
            IsSameHospital().has_object_permission(self.request, None, obj),
        )


class StaffTokenClaimTestCase(SimpleTestCase):
    def test_access_and_refresh_copy_custom_claims(self):
        refresh = RefreshToken()
        claims = {
            "hospital_id": "877ea63f-776d-45ec-9409-97646ba8513f",
            "department_id": "fc646b31-f471-466c-8620-5ecb77bd2a3e",
            "department_code": "PATHOLOGY",
            "role": DepartmentRole.Role.DOCTOR,
        }
        for key, value in claims.items():
            refresh[key] = value

        access = refresh.access_token
        for key, value in claims.items():
            with self.subTest(claim=key):
                self.assertEqual(refresh[key], value)
                self.assertEqual(access[key], value)
