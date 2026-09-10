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

from .hospital_admin_serializers import (
    HospitalAdminDepartmentSerializer,
    HospitalAdminLoginResponseSerializer,
    HospitalAdminLoginSerializer,
    HospitalAdminStaffCreateSerializer,
    HospitalAdminStaffSerializer,
)
from .models import Department, DepartmentRole, User
from .permissions import IsHospitalAdmin
from .services.staff_provisioning import provision_staff


class HospitalAdminLoginAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(request=HospitalAdminLoginSerializer, responses={200: HospitalAdminLoginResponseSerializer})
    def post(self, request):
        serializer = HospitalAdminLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = HospitalAdminLoginResponseSerializer.for_hospital_admin(
            serializer.validated_data["hospital_admin"],
        )
        return Response(data, status=status.HTTP_200_OK)


class HospitalAdminDepartmentListAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsHospitalAdmin]

    def get(self, request):
        roles = DepartmentRole.objects.order_by("role", "id")
        departments = Department.objects.filter(
            hospital_id=request.hospital_admin.hospital_id,
        ).prefetch_related(Prefetch("roles", queryset=roles)).order_by("code", "id")
        return Response(HospitalAdminDepartmentSerializer(departments, many=True).data)


class HospitalAdminStaffListCreateAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsHospitalAdmin]

    def get(self, request):
        staff = User.objects.filter(
            department_role__department__hospital_id=request.hospital_admin.hospital_id,
        ).select_related("department_role__department").order_by("name", "login_id", "id")
        return Response(HospitalAdminStaffSerializer(staff, many=True).data)

    @extend_schema(request=HospitalAdminStaffCreateSerializer, responses={201: HospitalAdminStaffSerializer})
    def post(self, request):
        serializer = HospitalAdminStaffCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        department_role = get_object_or_404(
            DepartmentRole.objects.select_related("department"),
            pk=serializer.validated_data["department_role_id"],
            department__hospital_id=request.hospital_admin.hospital_id,
        )
        user_data = {
            key: value
            for key, value in serializer.validated_data.items()
            if key != "department_role_id"
        }
        try:
            user = provision_staff(department_role=department_role, **user_data)
        except IntegrityError as exc:
            raise ValidationError({"login_id": "이미 사용 중인 로그인 식별값입니다."}) from exc
        user = User.objects.select_related("department_role__department").get(pk=user.pk)
        return Response(HospitalAdminStaffSerializer(user).data, status=status.HTTP_201_CREATED)
