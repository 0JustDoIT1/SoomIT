from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.views import TokenRefreshView

from .serializers import (
    StaffLoginResponseSerializer,
    StaffLoginSerializer,
    StaffProfileSerializer,
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


class StaffTokenRefreshAPIView(TokenRefreshView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["의료진 인증"],
        request=TokenRefreshSerializer,
        responses={200: TokenRefreshSerializer},
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)
