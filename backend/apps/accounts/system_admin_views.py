from django.db import IntegrityError
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import Department, Hospital, HospitalAdmin
from .permissions import IsSystemAdmin
from .services.hospital_admin_provisioning import provision_hospital_admin
from .services.hospital_provisioning import provision_hospital
from .system_admin_serializers import (
    HospitalAdminCreateSerializer,
    HospitalAdminListQuerySerializer,
    HospitalAdminProvisioningResponseSerializer,
    HospitalCreateSerializer,
    HospitalDetailSerializer,
    HospitalProvisioningSerializer,
    HospitalProvisioningResponseSerializer,
    SystemAdminLoginResponseSerializer,
    SystemAdminLoginSerializer,
)


class SystemAdminLoginAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["시스템 관리자 인증"],
        request=SystemAdminLoginSerializer,
        responses={200: SystemAdminLoginResponseSerializer},
    )
    def post(self, request):
        serializer = SystemAdminLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = SystemAdminLoginResponseSerializer.for_user(serializer.validated_data["user"])
        return Response(data, status=status.HTTP_200_OK)


class SystemAdminHospitalCreateAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    @extend_schema(
        tags=["시스템 관리자"],
        responses={200: HospitalProvisioningSerializer(many=True)},
    )
    def get(self, request):
        hospitals = Hospital.objects.order_by("code", "id")
        return Response(
            HospitalProvisioningSerializer(hospitals, many=True).data,
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        tags=["시스템 관리자"],
        request=HospitalCreateSerializer,
        responses={201: HospitalProvisioningResponseSerializer},
    )
    def post(self, request):
        serializer = HospitalCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            hospital = provision_hospital(**serializer.validated_data)
        except IntegrityError as exc:
            raise ValidationError({"code": "이미 사용 중인 병원 코드입니다."}) from exc

        departments = hospital.departments.prefetch_related("roles").order_by("created_at")
        data = HospitalProvisioningResponseSerializer(
            {"hospital": hospital, "departments": departments},
        ).data
        return Response(data, status=status.HTTP_201_CREATED)


class SystemAdminHospitalDetailAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    @extend_schema(
        tags=["시스템 관리자"],
        responses={200: HospitalDetailSerializer},
    )
    def get(self, request, hospital_id):
        departments = Department.objects.prefetch_related("roles").order_by("code", "id")
        hospital_admins = HospitalAdmin.objects.select_related("user", "hospital").order_by(
            "user__login_id",
        )
        hospitals = Hospital.objects.prefetch_related(
            Prefetch("departments", queryset=departments),
            Prefetch("admins", queryset=hospital_admins),
        )
        hospital = get_object_or_404(hospitals, pk=hospital_id)
        return Response(HospitalDetailSerializer(hospital).data, status=status.HTTP_200_OK)


class SystemAdminHospitalAdminCreateAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsSystemAdmin]

    @extend_schema(
        tags=["시스템 관리자"],
        parameters=[HospitalAdminListQuerySerializer],
        responses={200: HospitalAdminProvisioningResponseSerializer(many=True)},
    )
    def get(self, request):
        query_serializer = HospitalAdminListQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)

        hospital_admins = HospitalAdmin.objects.select_related("user", "hospital")
        hospital_id = query_serializer.validated_data.get("hospital_id")
        if hospital_id is not None:
            hospital = get_object_or_404(Hospital, pk=hospital_id)
            hospital_admins = hospital_admins.filter(hospital=hospital)

        hospital_admins = hospital_admins.order_by(
            "hospital__code",
            "user__login_id",
            "user_id",
        )
        return Response(
            HospitalAdminProvisioningResponseSerializer(hospital_admins, many=True).data,
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        tags=["시스템 관리자"],
        request=HospitalAdminCreateSerializer,
        responses={201: HospitalAdminProvisioningResponseSerializer},
    )
    def post(self, request):
        serializer = HospitalAdminCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        hospital = get_object_or_404(Hospital, pk=serializer.validated_data["hospital_id"])

        user_data = {
            key: value
            for key, value in serializer.validated_data.items()
            if key != "hospital_id"
        }
        try:
            user = provision_hospital_admin(hospital=hospital, **user_data)
        except IntegrityError as exc:
            raise ValidationError(
                {"login_id": "이미 사용 중인 로그인 식별값입니다."},
            ) from exc

        hospital_admin = HospitalAdmin.objects.select_related("user", "hospital").get(user=user)
        data = HospitalAdminProvisioningResponseSerializer(hospital_admin).data
        return Response(data, status=status.HTTP_201_CREATED)
