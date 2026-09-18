from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Department, DepartmentRole, DoctorProfile, HospitalAdmin, User


HOSPITAL_ADMIN_AUTHENTICATION_ERROR = "입력한 인증 정보를 확인해주세요."


class HospitalAdminProfileSerializer(serializers.Serializer):
    id = serializers.UUIDField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.login_id", read_only=True)
    name = serializers.CharField(source="user.name", read_only=True)
    hospital = serializers.SerializerMethodField()

    def get_hospital(self, obj):
        return {"id": str(obj.hospital_id), "code": obj.hospital.code, "name": obj.hospital.name}


class HospitalAdminLoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=50)
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    default_error_messages = {"invalid_credentials": HOSPITAL_ADMIN_AUTHENTICATION_ERROR}

    def validate(self, attrs):
        try:
            user = User.objects.select_related("hospital_admin__hospital").get(
                login_id=attrs["username"],
            )
        except User.DoesNotExist:
            User().set_password(attrs["password"])
            self.fail("invalid_credentials")

        if not user.check_password(attrs["password"]):
            self.fail("invalid_credentials")

        try:
            hospital_admin = user.hospital_admin
        except HospitalAdmin.DoesNotExist:
            self.fail("invalid_credentials")

        if (
            not user.is_active
            or user.account_status != User.AccountStatus.ACTIVE
        ):
            self.fail("invalid_credentials")

        attrs["hospital_admin"] = hospital_admin
        return attrs


class HospitalAdminLoginResponseSerializer(serializers.Serializer):
    access = serializers.CharField(read_only=True)
    refresh = serializers.CharField(read_only=True)
    user = HospitalAdminProfileSerializer(read_only=True)

    @classmethod
    def for_hospital_admin(cls, hospital_admin):
        refresh = RefreshToken.for_user(hospital_admin.user)
        refresh["hospital_id"] = str(hospital_admin.hospital_id)
        return {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": HospitalAdminProfileSerializer(hospital_admin).data,
        }


class HospitalAdminRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = DepartmentRole
        fields = ["id", "role", "display_name"]
        read_only_fields = fields


class HospitalAdminDepartmentSerializer(serializers.ModelSerializer):
    roles = HospitalAdminRoleSerializer(many=True, read_only=True)

    class Meta:
        model = Department
        fields = ["id", "code", "name", "roles"]
        read_only_fields = fields


class HospitalAdminStaffSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    login_id = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)
    account_status = serializers.CharField(read_only=True)
    department = serializers.SerializerMethodField()
    role = serializers.CharField(source="department_role.role", read_only=True)
    role_display_name = serializers.CharField(source="department_role.display_name", read_only=True)

    def get_department(self, obj):
        department = obj.department_role.department
        return {"id": str(department.id), "code": department.code, "name": department.name}


class HospitalAdminStaffCreateSerializer(serializers.Serializer):
    login_id = serializers.CharField(max_length=50)
    name = serializers.CharField(max_length=100)
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    department_role_id = serializers.UUIDField()
    # Only required for a DOCTOR department_role - enforced in the view once
    # department_role is resolved, since the role isn't known here yet. When
    # provided, a DoctorProfile is created together with the account so a
    # doctor never has to fill this in themselves before e.g. uploading a
    # profile photo.
    license_number = serializers.CharField(max_length=50, required=False, allow_blank=True)

    def validate_login_id(self, value):
        if User.objects.filter(login_id=value).exists():
            raise serializers.ValidationError("이미 사용 중인 로그인 식별값입니다.")
        return value

    def validate_license_number(self, value):
        if value and DoctorProfile.objects.filter(license_number=value).exists():
            raise serializers.ValidationError("이미 사용 중인 의사 면허번호입니다.")
        return value
