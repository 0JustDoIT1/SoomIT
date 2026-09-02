# 원무과
import hashlib

from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListCreateAPIView, RetrieveAPIView

from apps.accounts.models import Hospital

from .models import Patient
from .serializers import PatientCreateSerializer, PatientSerializer


# 원무과 - 환자 목록 조회 / 신규 환자 등록
class PatientListAPIView(ListCreateAPIView):
    queryset = Patient.objects.all().order_by("-created_at")

    def get_serializer_class(self):
        # GET /api/patients/
        if self.request.method == "GET":
            return PatientSerializer

        # POST /api/patients/
        return PatientCreateSerializer

    def perform_create(self, serializer):
        # 현재 로그인/병원 연동 전이므로
        # 테스트용으로 DB의 첫 번째 병원을 사용
        hospital = Hospital.objects.first()

        if hospital is None:
            raise ValidationError(
                {"hospital": "등록된 병원 정보가 없습니다."}
            )

        # 전화번호에서 숫자만 추출
        phone_number = serializer.validated_data["phone_number"]
        normalized_phone = "".join(
            char for char in phone_number if char.isdigit()
        )

        # 전화번호 해시 자동 생성
        phone_number_hash = hashlib.sha256(
            normalized_phone.encode("utf-8")
        ).hexdigest()

        serializer.save(
            hospital=hospital,
            phone_number_hash=phone_number_hash,
        )


# 원무과 - 환자 상세 조회
class PatientDetailAPIView(RetrieveAPIView):
    queryset = Patient.objects.all()
    serializer_class = PatientSerializer
    lookup_field = "id"