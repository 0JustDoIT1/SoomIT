from django.conf import settings
from django.http import HttpResponse
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.views import TokenRefreshView

from .models import DepartmentRole, DoctorProfile
from .services.doctor_profile_storage import (
    DoctorProfileStorageError,
    IMAGE_CONTENT_TYPES,
    download_doctor_profile_image_bytes,
    upload_doctor_profile_image,
)

from .serializers import (
    StaffLoginResponseSerializer,
    StaffLoginSerializer,
    StaffProfileSerializer,
    DoctorProfileUpdateSerializer,
)


def _require_doctor_role(user):
    """Shared by the profile and profile-image endpoints - both are doctor-only."""
    if user.department_role is None or user.department_role.role != DepartmentRole.Role.DOCTOR:
        return Response(
            {"detail": "의사 프로필은 의사 역할 계정만 수정할 수 있습니다."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


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


class StaffProfileImageAPIView(APIView):
    """Upload/download the logged-in doctor's own profile photo (GCS-backed)."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def _load_user(self, request):
        return (
            request.user.__class__.objects.select_related(
                "doctor_profile", "department_role__department__hospital",
            )
            .get(pk=request.user.pk)
        )

    @extend_schema(tags=["직원 인증"], responses={200: StaffProfileSerializer})
    def post(self, request):
        user = self._load_user(request)
        role_error = _require_doctor_role(user)
        if role_error:
            return role_error

        profile = getattr(user, "doctor_profile", None)
        if profile is None:
            return Response(
                {"detail": "프로필 이미지를 등록하려면 먼저 의사 면허번호로 프로필을 생성해야 합니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        image_file = request.FILES.get("image")
        if image_file is None:
            return Response({"detail": "image 파일이 필요합니다."}, status=status.HTTP_400_BAD_REQUEST)
        if image_file.content_type not in IMAGE_CONTENT_TYPES:
            return Response(
                {"detail": "jpg, png, webp 형식의 이미지만 업로드할 수 있습니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if image_file.size > settings.DOCTOR_PROFILE_IMAGE_MAX_UPLOAD_BYTES:
            return Response(
                {"detail": "이미지 용량이 너무 큽니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        hospital_id = user.department_role.department.hospital_id
        try:
            gs_uri = upload_doctor_profile_image(
                image_file.read(),
                content_type=image_file.content_type,
                hospital_id=hospital_id,
                user_id=user.pk,
            )
        except DoctorProfileStorageError:
            # Upload failed - leave the existing profile_image_uri untouched.
            return Response(
                {"detail": "이미지를 업로드하지 못했습니다. 잠시 후 다시 시도해주세요."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        profile.profile_image_uri = gs_uri
        profile.save(update_fields=["profile_image_uri", "updated_at"])
        return Response(StaffProfileSerializer(user).data)

    @extend_schema(tags=["직원 인증"])
    def get(self, request):
        user = self._load_user(request)
        profile = getattr(user, "doctor_profile", None)
        gs_uri = profile.profile_image_uri if profile else None
        if not gs_uri:
            return Response({"detail": "등록된 프로필 이미지가 없습니다."}, status=status.HTTP_404_NOT_FOUND)

        try:
            image_bytes, content_type = download_doctor_profile_image_bytes(gs_uri)
        except DoctorProfileStorageError:
            return Response(
                {"detail": "프로필 이미지를 불러오지 못했습니다."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return HttpResponse(image_bytes, content_type=content_type)


class StaffTokenRefreshAPIView(TokenRefreshView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["의료진 인증"],
        request=TokenRefreshSerializer,
        responses={200: TokenRefreshSerializer},
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)
