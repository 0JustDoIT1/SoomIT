import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.contrib.postgres.fields import ArrayField
from django.db import models

from apps.common.models import TimestampedUUIDModel, UUIDModel


# ── 1-1. hospitals ──────────────────────────────────────────────
class Hospital(TimestampedUUIDModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=30, unique=True)
    address = models.CharField(max_length=255, null=True, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    phone = models.CharField(max_length=20, null=True, blank=True)

    class Meta:
        db_table = "hospitals"

    def __str__(self):
        return self.name


# ── 1-2. departments ────────────────────────────────────────────
class Department(TimestampedUUIDModel):
    hospital = models.ForeignKey(Hospital, on_delete=models.PROTECT, related_name="departments")
    code = models.CharField(max_length=30)
    name = models.CharField(max_length=100)

    class Meta:
        db_table = "departments"
        constraints = [
            models.UniqueConstraint(fields=["hospital", "code"], name="uq_department_hospital_code"),
        ]

    def __str__(self):
        return f"{self.hospital.code}/{self.code}"


# ── 1-3. department_roles ───────────────────────────────────────
class DepartmentRole(TimestampedUUIDModel):
    class Role(models.TextChoices):
        DOCTOR = "DOCTOR", "의사"
        NURSE = "NURSE", "간호사"
        TECHNOLOGIST = "TECHNOLOGIST", "방사선/임상병리사"
        MEDICAL_STAFF = "MEDICAL_STAFF", "의료행정직"

    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name="roles")
    role = models.CharField(max_length=20, choices=Role.choices)
    display_name = models.CharField(max_length=100)

    class Meta:
        db_table = "department_roles"
        constraints = [
            models.UniqueConstraint(fields=["department", "role"], name="uq_department_role"),
        ]

    def __str__(self):
        return f"{self.department}/{self.role}"


class UserManager(BaseUserManager):
    def create_user(self, login_id, password=None, **extra_fields):
        if not login_id:
            raise ValueError("login_id는 필수입니다.")
        user = self.model(login_id=login_id, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, login_id, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(login_id, password, **extra_fields)


# ── 1-4. users ───────────────────────────────────────────────────
class User(AbstractBaseUser, PermissionsMixin, UUIDModel):
    class AccountStatus(models.TextChoices):
        INVITED = "INVITED", "초대됨"
        ACTIVE = "ACTIVE", "활성"
        DISABLED = "DISABLED", "비활성화"

    department_role = models.ForeignKey(
        DepartmentRole, on_delete=models.PROTECT, null=True, blank=True, related_name="users"
    )
    login_id = models.CharField(max_length=50, unique=True)
    # password 필드는 AbstractBaseUser가 이미 제공 (Django 해시 저장)
    name = models.CharField(max_length=100)
    account_status = models.CharField(
        max_length=20, choices=AccountStatus.choices, default=AccountStatus.INVITED
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Django auth 연동용 (department_role 없으면 admin 계열)
    is_staff = models.BooleanField(default=False)

    USERNAME_FIELD = "login_id"
    REQUIRED_FIELDS = ["name"]

    objects = UserManager()

    class Meta:
        db_table = "users"

    def __str__(self):
        return f"{self.name}({self.login_id})"


# ── 1-5. doctor_profiles ────────────────────────────────────────
class DoctorProfile(models.Model):
    class Gender(models.TextChoices):
        MALE = "MALE", "남"
        FEMALE = "FEMALE", "여"
        OTHER = "OTHER", "기타"
        UNSPECIFIED = "UNSPECIFIED", "미기재"

    user = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True, related_name="doctor_profile")
    license_number = models.CharField(max_length=50, unique=True)
    birth_date = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=20, choices=Gender.choices, null=True, blank=True)
    profile_image_uri = models.CharField(max_length=500, null=True, blank=True)
    tags = ArrayField(models.CharField(max_length=50), default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "doctor_profiles"

    def __str__(self):
        return f"Dr. {self.user.name}"


# ── 1-6. hospital_admins ────────────────────────────────────────
class HospitalAdmin(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True, related_name="hospital_admin")
    hospital = models.ForeignKey(Hospital, on_delete=models.PROTECT, related_name="admins")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hospital_admins"


# ── 1-7. system_admins ──────────────────────────────────────────
class SystemAdmin(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True, related_name="system_admin")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "system_admins"
