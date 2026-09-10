from unittest.mock import patch

from django.db import IntegrityError
from django.test import TestCase

from apps.accounts.constants import DEFAULT_DEPARTMENT_TEMPLATES
from apps.accounts.models import Department, DepartmentRole, Hospital
from apps.accounts.services.hospital_provisioning import provision_hospital


class HospitalProvisioningServiceTestCase(TestCase):
    def test_provisions_default_departments_and_roles(self):
        hospital = provision_hospital(name="숨잇병원", code="SOOMIT")

        self.assertEqual(hospital.departments.count(), len(DEFAULT_DEPARTMENT_TEMPLATES))
        for template in DEFAULT_DEPARTMENT_TEMPLATES:
            department = Department.objects.get(hospital=hospital, code=template.code)
            self.assertEqual(department.name, template.name)
            actual_roles = set(
                department.roles.values_list("role", "display_name"),
            )
            expected_roles = {
                (role.role, role.display_name)
                for role in template.roles
            }
            self.assertEqual(actual_roles, expected_roles)

    @patch("apps.accounts.services.hospital_provisioning.Department.objects.create")
    def test_department_failure_rolls_back_hospital(self, create_department):
        create_department.side_effect = IntegrityError("department failure")

        with self.assertRaises(IntegrityError):
            provision_hospital(name="실패병원", code="FAILED")

        self.assertFalse(Hospital.objects.filter(code="FAILED").exists())

    @patch("apps.accounts.services.hospital_provisioning.DepartmentRole.objects.create")
    def test_role_failure_rolls_back_hospital_and_departments(self, create_role):
        create_role.side_effect = IntegrityError("role failure")

        with self.assertRaises(IntegrityError):
            provision_hospital(name="실패병원", code="FAILED")

        self.assertFalse(Hospital.objects.filter(code="FAILED").exists())
        self.assertEqual(Department.objects.count(), 0)
        self.assertEqual(DepartmentRole.objects.count(), 0)
