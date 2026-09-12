import re

from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Department, DepartmentRole, Hospital, SystemAdmin, User


ADMIN_AUTHENTICATION_ERROR = "입력한 인증 정보를 확인해주세요."
HOSPITAL_CODE_PATTERN = re.compile(r"^[A-Z0-9-]+$")


class SystemAdminProfileSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    username = serializers.CharField(source="login_id", read_only=True)
    name = serializers.CharField(read_only=True)


class SystemAdminLoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=50)
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    default_error_messages = {
        "invalid_credentials": ADMIN_AUTHENTICATION_ERROR,
    }

    def validate(self, attrs):
        try:
            user = User.objects.get(login_id=attrs["username"])
        except User.DoesNotExist:
            User().set_password(attrs["password"])
            self.fail("invalid_credentials")

        if not user.check_password(attrs["password"]):
            self.fail("invalid_credentials")

        if (
            not user.is_active
            or user.account_status != User.AccountStatus.ACTIVE
            or not SystemAdmin.objects.filter(user_id=user.pk).exists()
        ):
            self.fail("invalid_credentials")

        attrs["user"] = user
        return attrs


class SystemAdminLoginResponseSerializer(serializers.Serializer):
    access = serializers.CharField(read_only=True)
    refresh = serializers.CharField(read_only=True)
    user = SystemAdminProfileSerializer(read_only=True)

    @classmethod
    def for_user(cls, user):
        refresh = RefreshToken.for_user(user)
        return {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": SystemAdminProfileSerializer(user).data,
        }


class HospitalCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    code = serializers.CharField(max_length=30)
    address = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)
    address_detail = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    postal_code = serializers.CharField(
        max_length=10,
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    latitude = serializers.DecimalField(
        max_digits=9,
        decimal_places=6,
        required=False,
        allow_null=True,
    )
    longitude = serializers.DecimalField(
        max_digits=9,
        decimal_places=6,
        required=False,
        allow_null=True,
    )
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True)

    def validate_code(self, value):
        code = value.strip().upper()
        if not code or not HOSPITAL_CODE_PATTERN.fullmatch(code):
            raise serializers.ValidationError("병원 코드는 영문 대문자, 숫자, 하이픈만 사용할 수 있습니다.")
        if Hospital.objects.filter(code__iexact=code).exists():
            raise serializers.ValidationError("이미 사용 중인 병원 코드입니다.")
        return code


class DepartmentRoleProvisioningSerializer(serializers.ModelSerializer):
    class Meta:
        model = DepartmentRole
        fields = ["id", "role", "display_name"]
        read_only_fields = fields


class DepartmentProvisioningSerializer(serializers.ModelSerializer):
    roles = DepartmentRoleProvisioningSerializer(many=True, read_only=True)

    class Meta:
        model = Department
        fields = ["id", "code", "name", "roles"]
        read_only_fields = fields


class HospitalProvisioningSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hospital
        fields = [
            "id",
            "name",
            "code",
            "address",
            "address_detail",
            "postal_code",
            "latitude",
            "longitude",
            "phone",
        ]
        read_only_fields = fields


class HospitalProvisioningResponseSerializer(serializers.Serializer):
    hospital = HospitalProvisioningSerializer(read_only=True)
    departments = DepartmentProvisioningSerializer(many=True, read_only=True)


class SystemAdminHospitalSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Hospital
        fields = ["id", "code", "name"]
        read_only_fields = fields


class HospitalAdminCreateSerializer(serializers.Serializer):
    hospital_id = serializers.UUIDField()
    login_id = serializers.CharField(max_length=50)
    name = serializers.CharField(max_length=100)
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_login_id(self, value):
        if User.objects.filter(login_id=value).exists():
            raise serializers.ValidationError("이미 사용 중인 로그인 식별값입니다.")
        return value


class HospitalAdminProvisioningResponseSerializer(serializers.Serializer):
    id = serializers.UUIDField(source="pk", read_only=True)
    user_id = serializers.UUIDField(source="user.id", read_only=True)
    login_id = serializers.CharField(source="user.login_id", read_only=True)
    name = serializers.CharField(source="user.name", read_only=True)
    account_status = serializers.CharField(source="user.account_status", read_only=True)
    hospital = SystemAdminHospitalSummarySerializer(read_only=True)


class HospitalAdminListQuerySerializer(serializers.Serializer):
    hospital_id = serializers.UUIDField(required=False)


class HospitalDetailSerializer(HospitalProvisioningSerializer):
    departments = DepartmentProvisioningSerializer(many=True, read_only=True)
    hospital_admins = HospitalAdminProvisioningResponseSerializer(
        source="admins",
        many=True,
        read_only=True,
    )

    class Meta(HospitalProvisioningSerializer.Meta):
        fields = HospitalProvisioningSerializer.Meta.fields + [
            "created_at",
            "departments",
            "hospital_admins",
        ]
        read_only_fields = fields
