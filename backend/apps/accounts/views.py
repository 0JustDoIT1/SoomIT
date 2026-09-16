from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.views import TokenRefreshView

from .models import DepartmentRole, DoctorProfile

from .serializers import (
    StaffLoginResponseSerializer,
    StaffLoginSerializer,
    StaffProfileSerializer,
    DoctorProfileUpdateSerializer,
)


class StaffLoginAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["의료진 인증"],
        request=StaffLoginSerializer,
        responses={200: StaffLoginResponseSerializer},
    )
    def post(self, request):
        serializer = StaffLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = StaffLoginResponseSerializer.for_user(
            serializer.validated_data["user"],
        )
        return Response(data, status=status.HTTP_200_OK)


class StaffProfileAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["의료진 인증"],
        responses={200: StaffProfileSerializer},
    )
    def get(self, request):
        user = (
            request.user.__class__.objects.select_related(
                "department_role__department__hospital",
            )
            .get(pk=request.user.pk)
        )
        return Response(StaffProfileSerializer(user).data)

    @extend_schema(tags=["직원 인증"], request=DoctorProfileUpdateSerializer, responses={200: StaffProfileSerializer})
    def patch(self, request):
        user = request.user.__class__.objects.select_related("doctor_profile", "department_role__department__hospital").get(pk=request.user.pk)
        if (
            user.department_role is None
            or user.department_role.role != DepartmentRole.Role.DOCTOR
        ):
            return Response(
                {"detail": "의사 프로필은 의사 역할 계정만 수정할 수 있습니다."},
                status=status.HTTP_403_FORBIDDEN,
            )
        profile = getattr(user, "doctor_profile", None)
        serializer = DoctorProfileUpdateSerializer(profile, data=request.data, partial=profile is not None)
        serializer.is_valid(raise_exception=True)
        if profile is None:
            license_number = serializer.validated_data.get("license_number")
            if not license_number:
                return Response({"detail": "최초 프로필 생성에는 의사 면허번호가 필요합니다."}, status=status.HTTP_400_BAD_REQUEST)
            DoctorProfile.objects.create(user=user, **serializer.validated_data)
        else:
            serializer.save()
        return Response(StaffProfileSerializer(user).data)


class StaffTokenRefreshAPIView(TokenRefreshView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["의료진 인증"],
        request=TokenRefreshSerializer,
        responses={200: TokenRefreshSerializer},
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)
