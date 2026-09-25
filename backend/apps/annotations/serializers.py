import math

from rest_framework import serializers

from apps.cases.models import CaseImageAsset

from .models import ImageAnnotation


class ImageAnnotationSerializer(serializers.ModelSerializer):
    created_by_user_name = serializers.CharField(source="created_by_user.name", read_only=True)

    class Meta:
        model = ImageAnnotation
        fields = [
            "id", "image_asset", "clinical_result", "annotation_type", "annotation_data",
            "note", "created_by_user", "created_by_user_name", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by_user", "created_at", "updated_at"]

    def validate_annotation_data(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("annotation_data must be an object.")
        return value

    @staticmethod
    def _require_non_empty_strings(data, keys):
        for key in keys:
            if not isinstance(data.get(key), str) or not data[key].strip():
                raise serializers.ValidationError({
                    "annotation_data": {key: "This field is required."}
                })

    @staticmethod
    def _validate_world_points(annotation_type, data):
        ImageAnnotationSerializer._require_non_empty_strings(
            data, ("series_instance_uid", "sop_instance_uid", "tool_name")
        )
        points = data.get("world_points")
        if not isinstance(points, list):
            raise serializers.ValidationError({
                "annotation_data": {"world_points": "world_points must be an array."}
            })

        point_count_rules = {
            ImageAnnotation.AnnotationType.LENGTH: (2, 2),
            ImageAnnotation.AnnotationType.POINT: (1, 1),
            ImageAnnotation.AnnotationType.BOUNDING_BOX: (4, 4),
            ImageAnnotation.AnnotationType.POLYGON: (3, None),
            ImageAnnotation.AnnotationType.FREEHAND: (2, None),
            ImageAnnotation.AnnotationType.TEXT: (1, None),
        }
        minimum, maximum = point_count_rules[annotation_type]
        if len(points) < minimum or (maximum is not None and len(points) != maximum):
            expected = str(minimum) if maximum == minimum else f"at least {minimum}"
            raise serializers.ValidationError({
                "annotation_data": {
                    "world_points": f"{annotation_type} requires {expected} world point(s)."
                }
            })

        for point in points:
            if not isinstance(point, list) or len(point) != 3:
                raise serializers.ValidationError({
                    "annotation_data": {
                        "world_points": "Each world point must contain three coordinates."
                    }
                })
            if any(
                isinstance(coordinate, bool)
                or not isinstance(coordinate, (int, float))
                or not math.isfinite(coordinate)
                for coordinate in point
            ):
                raise serializers.ValidationError({
                    "annotation_data": {
                        "world_points": "World point coordinates must be finite numbers."
                    }
                })

        if annotation_type == ImageAnnotation.AnnotationType.TEXT:
            text = data.get("text")
            if not isinstance(text, str) or not text.strip():
                raise serializers.ValidationError({
                    "annotation_data": {"text": "TEXT annotations require non-empty text."}
                })

    @staticmethod
    def _validate_wsi_points(annotation_type, data, asset):
        ImageAnnotationSerializer._require_non_empty_strings(
            data, ("slide_id", "tool_name", "coordinate_space")
        )
        if data["coordinate_space"] != "WSI_IMAGE":
            raise serializers.ValidationError({
                "annotation_data": {"coordinate_space": "WSI annotations must use WSI_IMAGE coordinates."}
            })
        try:
            slide = asset.whole_slide_image
        except (AttributeError, CaseImageAsset.whole_slide_image.RelatedObjectDoesNotExist):
            slide = None
        if slide is None or str(slide.id) != data["slide_id"]:
            raise serializers.ValidationError({
                "annotation_data": {"slide_id": "Slide does not match the image asset."}
            })

        width = data.get("image_width")
        height = data.get("image_height")
        if (
            isinstance(width, bool) or not isinstance(width, (int, float)) or not math.isfinite(width) or width <= 0
            or isinstance(height, bool) or not isinstance(height, (int, float)) or not math.isfinite(height) or height <= 0
        ):
            raise serializers.ValidationError({
                "annotation_data": {"image_width": "Positive image dimensions are required."}
            })

        points = data.get("image_points")
        point_count_rules = {
            ImageAnnotation.AnnotationType.LENGTH: (2, 2),
            ImageAnnotation.AnnotationType.POINT: (1, 1),
            ImageAnnotation.AnnotationType.BOUNDING_BOX: (4, 4),
            ImageAnnotation.AnnotationType.POLYGON: (3, None),
            ImageAnnotation.AnnotationType.FREEHAND: (2, None),
            ImageAnnotation.AnnotationType.TEXT: (1, 1),
        }
        minimum, maximum = point_count_rules[annotation_type]
        if not isinstance(points, list) or len(points) < minimum or (maximum is not None and len(points) != maximum):
            expected = str(minimum) if maximum == minimum else f"at least {minimum}"
            raise serializers.ValidationError({
                "annotation_data": {"image_points": f"{annotation_type} requires {expected} image point(s)."}
            })
        for point in points:
            if not isinstance(point, list) or len(point) != 2 or any(
                isinstance(coordinate, bool)
                or not isinstance(coordinate, (int, float))
                or not math.isfinite(coordinate)
                for coordinate in point
            ):
                raise serializers.ValidationError({
                    "annotation_data": {"image_points": "Each image point must contain two finite coordinates."}
                })
            if point[0] < 0 or point[0] > width or point[1] < 0 or point[1] > height:
                raise serializers.ValidationError({
                    "annotation_data": {"image_points": "Image points must stay within the WSI bounds."}
                })
        if annotation_type == ImageAnnotation.AnnotationType.TEXT:
            text = data.get("text")
            if not isinstance(text, str) or not text.strip():
                raise serializers.ValidationError({
                    "annotation_data": {"text": "TEXT annotations require non-empty text."}
                })

    def validate(self, attrs):
        asset = attrs.get("image_asset") or getattr(self.instance, "image_asset", None)
        clinical_result = attrs.get("clinical_result", getattr(self.instance, "clinical_result", None))
        data = attrs.get("annotation_data", getattr(self.instance, "annotation_data", {}))
        annotation_type = attrs.get(
            "annotation_type", getattr(self.instance, "annotation_type", None)
        )

        if self.instance is not None:
            immutable_fields = {
                "image_asset": (
                    getattr(self.instance, "image_asset_id", None),
                    getattr(attrs.get("image_asset"), "pk", None),
                ),
                "clinical_result": (
                    getattr(self.instance, "clinical_result_id", None),
                    getattr(attrs.get("clinical_result"), "pk", None),
                ),
                "annotation_type": (
                    self.instance.annotation_type,
                    attrs.get("annotation_type"),
                ),
            }
            for field, (current_value, supplied_value) in immutable_fields.items():
                if field in attrs and current_value != supplied_value:
                    raise serializers.ValidationError({
                        field: "This field cannot be changed after annotation creation."
                    })

        if asset and asset.image_type in {CaseImageAsset.ImageType.CT, CaseImageAsset.ImageType.PET} and data.get("series_instance_uid") != asset.series_instance_uid:
            raise serializers.ValidationError({"annotation_data": "Series UID does not match the image asset."})
        if asset and asset.image_type not in {
            CaseImageAsset.ImageType.CT,
            CaseImageAsset.ImageType.PET,
            CaseImageAsset.ImageType.WSI,
        }:
            raise serializers.ValidationError({"image_asset": "Only CT/PET/WSI image assets are supported."})
        if asset and clinical_result and clinical_result.case_id != asset.case_id:
            raise serializers.ValidationError({"clinical_result": "Clinical result does not belong to the image asset Case."})
        if annotation_type and (
            self.instance is None
            or "annotation_data" in attrs
            or "annotation_type" in attrs
        ):
            if asset and asset.image_type == CaseImageAsset.ImageType.WSI:
                self._validate_wsi_points(annotation_type, data, asset)
            else:
                self._validate_world_points(annotation_type, data)
        return attrs
