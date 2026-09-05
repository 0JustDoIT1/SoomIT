from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User


AUTHENTICATION_ERROR = "입력한 인증 정보를 확인해주세요."


class DepartmentSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    code = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)


class HospitalSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    code = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)


class StaffProfileSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    username = serializers.CharField(source="login_id", read_only=True)
    name = serializers.CharField(read_only=True)
    department = DepartmentSummarySerializer(
        source="department_role.department",
        read_only=True,
    )
    role = serializers.CharField(source="department_role.role", read_only=True)
    hospital = HospitalSummarySerializer(
        source="department_role.department.hospital",
        read_only=True,
    )


class StaffLoginSerializer(serializers.Serializer):
    hospital_code = serializers.CharField(max_length=30)
    username = serializers.CharField(max_length=50)
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    default_error_messages = {
        "invalid_credentials": AUTHENTICATION_ERROR,
    }

    def validate(self, attrs):
        try:
            user = (
                User.objects.select_related(
                    "department_role__department__hospital",
                )
                .get(login_id=attrs["username"])
            )
        except User.DoesNotExist:
            # 존재하지 않는 계정도 비밀번호 해시 연산을 수행해 응답 시간 차이를 줄인다.
            User().set_password(attrs["password"])
            self.fail("invalid_credentials")

        if not user.check_password(attrs["password"]):
            self.fail("invalid_credentials")

        if (
            not user.is_active
            or user.account_status != User.AccountStatus.ACTIVE
            or user.department_role_id is None
        ):
            self.fail("invalid_credentials")

        department = user.department_role.department
        if department is None or department.hospital_id is None:
            self.fail("invalid_credentials")

        if department.hospital.code != attrs["hospital_code"]:
            self.fail("invalid_credentials")

        attrs["user"] = user
        return attrs


class StaffLoginResponseSerializer(serializers.Serializer):
    access = serializers.CharField(read_only=True)
    refresh = serializers.CharField(read_only=True)
    user = StaffProfileSerializer(read_only=True)

    @classmethod
    def for_user(cls, user):
        refresh = RefreshToken.for_user(user)
        department = user.department_role.department
        refresh["hospital_id"] = str(department.hospital_id)
        refresh["department_id"] = str(department.id)
        refresh["department_code"] = department.code
        refresh["role"] = user.department_role.role
        return {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": StaffProfileSerializer(user).data,
        }
