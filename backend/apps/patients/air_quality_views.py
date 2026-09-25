from django.core.exceptions import ImproperlyConfigured
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .services.air_quality import AirQualityServiceError, get_current_air_quality


class AirQualityQuerySerializer(serializers.Serializer):
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)


@extend_schema(
    tags=["환자 앱 - 공개 기능"],
    summary="현재 위치 미세먼지 기반 호흡기 건강 안내",
    parameters=[AirQualityQuerySerializer],
)
class AirQualityAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        serializer = AirQualityQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        try:
            result = get_current_air_quality(**serializer.validated_data)
        except ImproperlyConfigured:
            return Response(
                {
                    "code": "air_quality_api_not_configured",
                    "detail": "대기질 조회 API 설정을 확인해주세요.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except AirQualityServiceError as exc:
            return Response(
                {"code": "air_quality_api_error", "detail": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(result)
