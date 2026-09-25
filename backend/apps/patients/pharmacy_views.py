from django.core.exceptions import ImproperlyConfigured
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .patient_authentication import PatientJWTAuthentication
from .services.nearby_pharmacy import (
    NearbyPharmacyServiceError,
    find_nearby_pharmacies,
)


class NearbyPharmacyQuerySerializer(serializers.Serializer):
    latitude = serializers.FloatField(
        min_value=-90,
        max_value=90,
    )
    longitude = serializers.FloatField(
        min_value=-180,
        max_value=180,
    )
    limit = serializers.IntegerField(
        min_value=1,
        max_value=50,
        default=50,
    )


@extend_schema(
    tags=["환자 앱 - 부가기능"],
    summary="현재 위치 주변 약국 조회",
    parameters=[NearbyPharmacyQuerySerializer],
    responses={
        200: inline_serializer(
            name="NearbyPharmacyResponse",
            fields={
                "count": serializers.IntegerField(),
                "pharmacies": serializers.ListField(
                    child=serializers.DictField()
                ),
            },
        ),
        401: inline_serializer(
            name="NearbyPharmacyUnauthorizedResponse",
            fields={
                "detail": serializers.CharField(),
            },
        ),
        502: inline_serializer(
            name="NearbyPharmacyApiErrorResponse",
            fields={
                "code": serializers.CharField(),
                "detail": serializers.CharField(),
            },
        ),
        503: inline_serializer(
            name="NearbyPharmacyNotConfiguredResponse",
            fields={
                "code": serializers.CharField(),
                "detail": serializers.CharField(),
            },
        ),
    },
)
class NearbyPharmacyAPIView(APIView):
    authentication_classes = [
        PatientJWTAuthentication,
    ]
    permission_classes = [
        IsAuthenticated,
    ]

    def get(self, request):
        serializer = NearbyPharmacyQuerySerializer(
            data=request.query_params
        )
        serializer.is_valid(raise_exception=True)

        params = serializer.validated_data

        try:
            pharmacies = find_nearby_pharmacies(
                latitude=params["latitude"],
                longitude=params["longitude"],
                limit=params["limit"],
            )

        except ImproperlyConfigured:
            return Response(
                {
                    "code": "pharmacy_api_not_configured",
                    "detail": "약국 조회 API 인증키가 설정되지 않았습니다.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        except NearbyPharmacyServiceError as exc:
            return Response(
                {
                    "code": "pharmacy_api_error",
                    "detail": str(exc),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(
            {
                "count": len(pharmacies),
                "pharmacies": pharmacies,
            },
            status=status.HTTP_200_OK,
        )