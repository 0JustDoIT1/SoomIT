from rest_framework import serializers

from .models import PathologySpecimen, PathologyWorkItem, WholeSlideImage


class WholeSlideImageSerializer(serializers.ModelSerializer):
    storage_uri = serializers.CharField(
        source="image_asset.storage_uri",
        read_only=True,
    )
    file_format = serializers.CharField(
        source="image_asset.file_format",
        read_only=True,
    )
    image_status = serializers.CharField(
        source="image_asset.status",
        read_only=True,
    )

    class Meta:
        model = WholeSlideImage
        fields = [
            "id",
            "specimen_id",
            "image_asset_id",
            "slide_code",
            "block_code",
            "version",
            "stain",
            "original_filename",
            "sha256",
            "mpp",
            "is_current",
            "storage_uri",
            "file_format",
            "image_status",
            "invalidated_at",
            "invalidation_reason",
            "created_at",
            "updated_at",
        ]


class PathologySpecimenSerializer(serializers.ModelSerializer):
    case_code = serializers.CharField(source="case.case_code", read_only=True)
    patient_id = serializers.UUIDField(source="case.patient.id", read_only=True)
    patient_code = serializers.CharField(
        source="case.patient.patient_code",
        read_only=True,
    )
    patient_name = serializers.CharField(
        source="case.patient.name",
        read_only=True,
    )
    wsi_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = PathologySpecimen
        fields = [
            "id",
            "case_id",
            "case_code",
            "patient_id",
            "patient_code",
            "patient_name",
            "examination_order_id",
            "specimen_code",
            "specimen_type",
            "body_site",
            "collected_at",
            "received_at",
            "status",
            "wsi_count",
            "created_at",
            "updated_at",
        ]


class PathologyWorkItemSerializer(serializers.ModelSerializer):
    case_code = serializers.CharField(source="case.case_code", read_only=True)
    patient_code = serializers.CharField(
        source="case.patient.patient_code",
        read_only=True,
    )
    patient_name = serializers.CharField(
        source="case.patient.name",
        read_only=True,
    )
    specimen_code = serializers.CharField(
        source="specimen.specimen_code",
        read_only=True,
        allow_null=True,
    )
    slide_code = serializers.CharField(
        source="wsi.slide_code",
        read_only=True,
        allow_null=True,
    )
    assigned_to_name = serializers.CharField(
        source="assigned_to.name",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = PathologyWorkItem
        fields = [
            "id",
            "case_id",
            "case_code",
            "patient_code",
            "patient_name",
            "specimen_id",
            "specimen_code",
            "wsi_id",
            "slide_code",
            "task_type",
            "status",
            "priority",
            "assigned_to_id",
            "assigned_to_name",
            "due_at",
            "completed_at",
            "created_at",
            "updated_at",
        ]