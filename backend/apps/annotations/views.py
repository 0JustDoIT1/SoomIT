from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.accounts.constants import PATHOLOGY_DEPARTMENT_CODE
from apps.accounts.models import DepartmentRole
from apps.accounts.permissions import IsActiveStaff, IsDoctor, IsPulmonologyStaff, get_token_hospital_id
from apps.cases.models import CaseImageAsset, LungCancerCase
from apps.pathology.models import WholeSlideImage
from .models import ImageAnnotation
from .serializers import ImageAnnotationSerializer


class _DoctorImageAnnotationBase(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]

    def get_case(self, request, case_id):
        return get_object_or_404(
            LungCancerCase, id=case_id, primary_doctor=request.user,
            patient__hospital_id=get_token_hospital_id(request),
        )


class DoctorCaseImageAnnotationListCreateAPIView(_DoctorImageAnnotationBase):
    def get(self, request, case_id):
        case = self.get_case(request, case_id)
        asset_id = request.query_params.get("image_asset_id")
        series_instance_uid = request.query_params.get("series_instance_uid", "").strip()
        slide_id = request.query_params.get("slide_id", "").strip()
        if not asset_id:
            return Response({"detail": "image_asset_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        if slide_id:
            slide = get_object_or_404(
                WholeSlideImage.objects.select_related("image_asset"),
                id=slide_id, image_asset_id=asset_id, specimen__case=case, is_current=True,
            )
            asset = slide.image_asset
        else:
            if not series_instance_uid:
                return Response({"detail": "series_instance_uid is required."}, status=status.HTTP_400_BAD_REQUEST)
            asset = get_object_or_404(
                CaseImageAsset,
                id=asset_id,
                case=case,
                series_instance_uid=series_instance_uid,
                image_type__in=[CaseImageAsset.ImageType.CT, CaseImageAsset.ImageType.PET],
            )
        annotations = ImageAnnotation.objects.filter(image_asset=asset).select_related("created_by_user", "clinical_result").order_by("created_at")
        return Response(ImageAnnotationSerializer(annotations, many=True).data)

    def post(self, request, case_id):
        case = self.get_case(request, case_id)
        serializer = ImageAnnotationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        asset = serializer.validated_data["image_asset"]
        if asset.image_type == CaseImageAsset.ImageType.WSI:
            return Response(
                {"detail": "Pulmonology staff have read-only access to WSI annotations."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if asset.case_id != case.id:
            return Response({"detail": "Image asset does not belong to this Case."}, status=status.HTTP_400_BAD_REQUEST)
        clinical_result = serializer.validated_data.get("clinical_result")
        if clinical_result and clinical_result.case_id != case.id:
            return Response({"detail": "Clinical result does not belong to this Case."}, status=status.HTTP_400_BAD_REQUEST)
        annotation = serializer.save(created_by_user=request.user)
        return Response(ImageAnnotationSerializer(annotation).data, status=status.HTTP_201_CREATED)


class DoctorCaseImageAnnotationDetailAPIView(_DoctorImageAnnotationBase):
    def get_object(self, request, case_id, annotation_id):
        case = self.get_case(request, case_id)
        return get_object_or_404(
            ImageAnnotation,
            id=annotation_id,
            image_asset__case=case,
            image_asset__image_type__in=[
                CaseImageAsset.ImageType.CT,
                CaseImageAsset.ImageType.PET,
            ],
        )

    def patch(self, request, case_id, annotation_id):
        case = self.get_case(request, case_id)
        annotation = self.get_object(request, case_id, annotation_id)
        serializer = ImageAnnotationSerializer(annotation, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        asset = serializer.validated_data.get("image_asset", annotation.image_asset)
        if asset.case_id != case.id:
            return Response({"detail": "Image asset does not belong to this Case."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ImageAnnotationSerializer(serializer.save()).data)

    def delete(self, request, case_id, annotation_id):
        annotation = self.get_object(request, case_id, annotation_id)
        annotation.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class _PathologyWsiAnnotationBase(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff]

    def _is_pathology_reader(self, request):
        role = getattr(request.user, "department_role", None)
        return bool(
            role
            and role.department.code == PATHOLOGY_DEPARTMENT_CODE
            and role.role in {DepartmentRole.Role.DOCTOR, DepartmentRole.Role.TECHNOLOGIST}
        )

    def _is_pathology_doctor(self, request):
        role = getattr(request.user, "department_role", None)
        return bool(
            role
            and role.department.code == PATHOLOGY_DEPARTMENT_CODE
            and role.role == DepartmentRole.Role.DOCTOR
        )

    def get_slide(self, request, wsi_id):
        if not self._is_pathology_reader(request):
            self.permission_denied(request)
        hospital_id = request.user.department_role.department.hospital_id
        return get_object_or_404(
            WholeSlideImage.objects.select_related("image_asset", "specimen__case__patient"),
            id=wsi_id,
            is_current=True,
            specimen__case__patient__hospital_id=hospital_id,
        )


class PathologyWsiAnnotationListCreateAPIView(_PathologyWsiAnnotationBase):
    def get(self, request, wsi_id):
        slide = self.get_slide(request, wsi_id)
        annotations = ImageAnnotation.objects.filter(image_asset=slide.image_asset).select_related("created_by_user").order_by("created_at")
        response = Response(ImageAnnotationSerializer(annotations, many=True).data)
        response["X-Annotation-Writable"] = "true" if self._is_pathology_doctor(request) else "false"
        return response

    def post(self, request, wsi_id):
        slide = self.get_slide(request, wsi_id)
        if not self._is_pathology_doctor(request):
            self.permission_denied(request)
        serializer = ImageAnnotationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data["image_asset"].id != slide.image_asset_id:
            return Response({"detail": "Image asset does not belong to this WSI."}, status=status.HTTP_400_BAD_REQUEST)
        annotation = serializer.save(created_by_user=request.user)
        return Response(ImageAnnotationSerializer(annotation).data, status=status.HTTP_201_CREATED)


class PathologyWsiAnnotationDetailAPIView(_PathologyWsiAnnotationBase):
    def get_object(self, request, wsi_id, annotation_id):
        slide = self.get_slide(request, wsi_id)
        return get_object_or_404(ImageAnnotation, id=annotation_id, image_asset=slide.image_asset)

    def patch(self, request, wsi_id, annotation_id):
        if not self._is_pathology_doctor(request):
            self.permission_denied(request)
        annotation = self.get_object(request, wsi_id, annotation_id)
        serializer = ImageAnnotationSerializer(annotation, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return Response(ImageAnnotationSerializer(serializer.save()).data)

    def delete(self, request, wsi_id, annotation_id):
        if not self._is_pathology_doctor(request):
            self.permission_denied(request)
        annotation = self.get_object(request, wsi_id, annotation_id)
        annotation.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
