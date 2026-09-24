from datetime import date
from uuid import uuid4

from django.test import SimpleTestCase, TestCase
from django.urls import resolve, reverse
from rest_framework import serializers
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.annotations.models import ImageAnnotation
from apps.annotations.serializers import ImageAnnotationSerializer
from apps.cases.models import CaseImageAsset, LungCancerCase, WorkflowStage
from apps.clinical.models import ClinicalResult
from apps.patients.models import Patient


def annotation_data(series_uid, *, points=None, text=None, tool_name="LengthTool"):
    data = {
        "series_instance_uid": series_uid,
        "sop_instance_uid": "1.2.840.10008.1",
        "tool_name": tool_name,
        "world_points": (
            points if points is not None else [[0.0, 0.0, 0.0], [1.0, 1.0, 1.0]]
        ),
        "cached_stats": {"length": 1.73},
    }
    if text is not None:
        data["text"] = text
    return data


class ImageAnnotationPayloadValidationTests(SimpleTestCase):
    def setUp(self):
        self.asset = CaseImageAsset(
            id=uuid4(),
            case_id=uuid4(),
            image_type=CaseImageAsset.ImageType.CT,
            series_instance_uid="1.2.3.4",
        )

    def validate(self, annotation_type, data):
        serializer = ImageAnnotationSerializer()
        serializer.validate_annotation_data(data)
        return serializer.validate({
            "image_asset": self.asset,
            "annotation_type": annotation_type,
            "annotation_data": data,
        })

    def assert_invalid(self, annotation_type, data):
        with self.assertRaises(serializers.ValidationError):
            self.validate(annotation_type, data)

    def test_accepts_supported_geometry_shapes(self):
        valid_payloads = {
            ImageAnnotation.AnnotationType.LENGTH: [[0, 0, 0], [1, 1, 1]],
            ImageAnnotation.AnnotationType.POINT: [[0, 0, 0]],
            ImageAnnotation.AnnotationType.BOUNDING_BOX: [
                [0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0],
            ],
            ImageAnnotation.AnnotationType.POLYGON: [
                [0, 0, 0], [2, 0, 0], [1, 2, 0],
            ],
            ImageAnnotation.AnnotationType.FREEHAND: [[0, 0, 0], [1, 1, 0]],
            ImageAnnotation.AnnotationType.TEXT: [[0, 0, 0]],
        }
        for annotation_type, points in valid_payloads.items():
            with self.subTest(annotation_type=annotation_type):
                data = annotation_data(
                    self.asset.series_instance_uid,
                    points=points,
                    text="review note" if annotation_type == ImageAnnotation.AnnotationType.TEXT else None,
                )
                self.assertEqual(self.validate(annotation_type, data)["annotation_data"], data)

    def test_rejects_missing_common_dicom_identity(self):
        for key in ("series_instance_uid", "sop_instance_uid", "tool_name"):
            with self.subTest(key=key):
                data = annotation_data(self.asset.series_instance_uid)
                data[key] = " "
                self.assert_invalid(ImageAnnotation.AnnotationType.LENGTH, data)

    def test_rejects_length_with_empty_or_wrong_point_count(self):
        for points in ([], [[0, 0, 0]], [[0, 0, 0], [1, 1, 1], [2, 2, 2]]):
            with self.subTest(points=points):
                self.assert_invalid(
                    ImageAnnotation.AnnotationType.LENGTH,
                    annotation_data(self.asset.series_instance_uid, points=points),
                )

    def test_rejects_malformed_or_non_finite_coordinates(self):
        for points in (
            [[0, 0], [1, 1]],
            [[0, 0, 0], [1, "bad", 1]],
            [[0, 0, 0], [1, float("nan"), 1]],
            [[0, 0, 0], [True, 1, 1]],
        ):
            with self.subTest(points=points):
                self.assert_invalid(
                    ImageAnnotation.AnnotationType.LENGTH,
                    annotation_data(self.asset.series_instance_uid, points=points),
                )

    def test_rejects_invalid_roi_polygon_and_freehand_geometry(self):
        cases = (
            (ImageAnnotation.AnnotationType.BOUNDING_BOX, [[0, 0, 0], [1, 1, 1]]),
            (ImageAnnotation.AnnotationType.POLYGON, [[0, 0, 0], [1, 1, 1]]),
            (ImageAnnotation.AnnotationType.FREEHAND, [[0, 0, 0]]),
        )
        for annotation_type, points in cases:
            with self.subTest(annotation_type=annotation_type):
                self.assert_invalid(
                    annotation_type,
                    annotation_data(self.asset.series_instance_uid, points=points),
                )

    def test_rejects_text_without_geometry_or_non_empty_text(self):
        for points, text in (([], "note"), ([[0, 0, 0]], None), ([[0, 0, 0]], "  ")):
            with self.subTest(points=points, text=text):
                self.assert_invalid(
                    ImageAnnotation.AnnotationType.TEXT,
                    annotation_data(self.asset.series_instance_uid, points=points, text=text),
                )

    def test_rejects_series_uid_that_does_not_match_asset(self):
        self.assert_invalid(
            ImageAnnotation.AnnotationType.LENGTH,
            annotation_data("9.9.9.9"),
        )

    def test_rejects_asset_without_a_series_uid(self):
        self.asset.series_instance_uid = None
        self.assert_invalid(
            ImageAnnotation.AnnotationType.LENGTH,
            annotation_data("1.2.3.4"),
        )

    def test_rejects_unsupported_modality(self):
        self.asset.image_type = CaseImageAsset.ImageType.XRAY
        self.assert_invalid(
            ImageAnnotation.AnnotationType.LENGTH,
            annotation_data(self.asset.series_instance_uid),
        )


class DoctorImageAnnotationAPITests(TestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(name="Annotation Hospital", code="ANNOTATION-HOSP")
        self.department = Department.objects.create(
            hospital=self.hospital, code="PULMONOLOGY", name="Pulmonology"
        )
        self.role = DepartmentRole.objects.create(
            department=self.department,
            role=DepartmentRole.Role.DOCTOR,
            display_name="Doctor",
        )
        self.doctor = self.create_user("annotation-doctor", self.role)
        self.other_doctor = self.create_user("other-annotation-doctor", self.role)
        self.case = self.create_case("ANNOTATION-CASE", "ANNOTATION-PATIENT", self.doctor, self.hospital)
        self.other_case = self.create_case(
            "OTHER-ANNOTATION-CASE", "OTHER-ANNOTATION-PATIENT", self.doctor, self.hospital
        )
        self.other_doctor_case = self.create_case(
            "OTHER-DOCTOR-CASE", "OTHER-DOCTOR-PATIENT", self.other_doctor, self.hospital
        )
        other_hospital = Hospital.objects.create(name="Other Annotation Hospital", code="OTHER-ANNOTATION-HOSP")
        self.other_hospital_case = self.create_case(
            "OTHER-HOSPITAL-CASE", "OTHER-HOSPITAL-PATIENT", self.doctor, other_hospital
        )
        self.ct = self.create_asset(self.case, CaseImageAsset.ImageType.CT, "1.2.3.ct")
        self.pet = self.create_asset(self.case, CaseImageAsset.ImageType.PET, "1.2.3.pet")
        self.xray = self.create_asset(self.case, CaseImageAsset.ImageType.XRAY, "1.2.3.xray")
        self.mri = self.create_asset(self.case, CaseImageAsset.ImageType.MRI, "1.2.3.mri")
        self.wsi = self.create_asset(self.case, CaseImageAsset.ImageType.WSI, "1.2.3.wsi")
        self.other_case_ct = self.create_asset(
            self.other_case, CaseImageAsset.ImageType.CT, self.ct.series_instance_uid
        )
        self.clinical_result = ClinicalResult.objects.create(
            case=self.case,
            workflow_stage=WorkflowStage.CT,
            source_image_asset=self.ct,
        )
        self.client = APIClient()
        self.authenticate(self.doctor)
        self.list_url = reverse(
            "doctor-case-image-annotation-list-create", kwargs={"case_id": self.case.id}
        )

    @staticmethod
    def create_user(login_id, role):
        return User.objects.create_user(
            login_id=login_id,
            password="test",
            name=login_id,
            department_role=role,
            account_status=User.AccountStatus.ACTIVE,
        )

    @staticmethod
    def create_case(case_code, patient_code, doctor, hospital):
        patient = Patient.objects.create(
            hospital=hospital,
            patient_code=patient_code,
            name=patient_code,
            birth_date=date(1970, 1, 1),
            sex=Patient.Sex.UNKNOWN,
            phone_number=f"010-{uuid4().hex[:4]}-{uuid4().hex[:4]}",
            phone_number_hash=uuid4().hex,
        )
        return LungCancerCase.objects.create(
            patient=patient,
            case_code=case_code,
            primary_doctor=doctor,
            current_stage=WorkflowStage.CT,
        )

    @staticmethod
    def create_asset(case, image_type, series_uid):
        return CaseImageAsset.objects.create(
            case=case,
            workflow_stage=WorkflowStage.CT,
            image_type=image_type,
            storage_type=CaseImageAsset.StorageType.ORTHANC,
            storage_uri=f"orthanc://series/{uuid4()}",
            file_format="DICOM",
            series_instance_uid=series_uid,
            status=CaseImageAsset.Status.READY,
        )

    def authenticate(self, user, *, hospital_id=None):
        token = RefreshToken.for_user(user)
        token["hospital_id"] = str(hospital_id or user.department_role.department.hospital_id)
        token["department_id"] = str(user.department_role.department_id)
        token["department_code"] = user.department_role.department.code
        token["role"] = user.department_role.role
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")

    def payload(self, asset=None, annotation_type=ImageAnnotation.AnnotationType.LENGTH, data=None):
        asset = asset or self.ct
        return {
            "image_asset": str(asset.id),
            "clinical_result": str(self.clinical_result.id),
            "annotation_type": annotation_type,
            "annotation_data": data or annotation_data(asset.series_instance_uid),
            "note": "initial annotation",
        }

    def create_annotation(self, asset=None, annotation_type=ImageAnnotation.AnnotationType.LENGTH, data=None):
        response = self.client.post(
            self.list_url,
            self.payload(asset, annotation_type, data),
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        return response, ImageAnnotation.objects.get(id=response.data["id"])

    def detail_url(self, annotation, case=None):
        return reverse(
            "doctor-case-image-annotation-detail",
            kwargs={"case_id": (case or self.case).id, "annotation_id": annotation.id},
        )

    def test_routes_map_to_distinct_list_and_detail_endpoints(self):
        self.assertEqual(resolve(self.list_url).url_name, "doctor-case-image-annotation-list-create")
        detail = reverse(
            "doctor-case-image-annotation-detail",
            kwargs={"case_id": self.case.id, "annotation_id": uuid4()},
        )
        self.assertEqual(resolve(detail).url_name, "doctor-case-image-annotation-detail")

    def test_create_persists_ct_annotation_and_response(self):
        response, saved = self.create_annotation()

        self.assertEqual(saved.image_asset, self.ct)
        self.assertEqual(saved.clinical_result, self.clinical_result)
        self.assertEqual(saved.annotation_type, ImageAnnotation.AnnotationType.LENGTH)
        self.assertEqual(saved.annotation_data, response.data["annotation_data"])
        self.assertEqual(saved.created_by_user, self.doctor)
        self.assertEqual(response.data["created_by_user_name"], self.doctor.name)

    def test_list_is_empty_then_scoped_to_requested_ct_or_pet_asset(self):
        empty = self.client.get(self.list_url, {"image_asset_id": self.ct.id})
        self.assertEqual(empty.status_code, 200)
        self.assertEqual(empty.data, [])

        _, ct_annotation = self.create_annotation()
        second_ct_response, _ = self.create_annotation(
            data=annotation_data(
                self.ct.series_instance_uid,
                points=[[3, 3, 3]],
                text="second CT note",
                tool_name="ArrowAnnotateTool",
            ),
            annotation_type=ImageAnnotation.AnnotationType.TEXT,
        )
        pet_data = annotation_data(
            self.pet.series_instance_uid,
            points=[[0, 0, 0]],
            text="PET note",
            tool_name="ArrowAnnotateTool",
        )
        _, pet_annotation = self.create_annotation(
            self.pet, ImageAnnotation.AnnotationType.TEXT, pet_data
        )
        ImageAnnotation.objects.create(
            image_asset=self.other_case_ct,
            annotation_type=ImageAnnotation.AnnotationType.LENGTH,
            annotation_data=annotation_data(self.other_case_ct.series_instance_uid),
            created_by_user=self.doctor,
        )

        ct_response = self.client.get(self.list_url, {"image_asset_id": self.ct.id})
        pet_response = self.client.get(self.list_url, {"image_asset_id": self.pet.id})
        self.assertEqual(
            [row["id"] for row in ct_response.data],
            [str(ct_annotation.id), second_ct_response.data["id"]],
        )
        self.assertEqual([row["id"] for row in pet_response.data], [str(pet_annotation.id)])

    def test_update_changes_geometry_text_and_length_value(self):
        _, length_annotation = self.create_annotation()
        updated_data = annotation_data(
            self.ct.series_instance_uid,
            points=[[2, 2, 2], [5, 6, 7]],
        )
        updated_data["cached_stats"] = {"length": 9.5}
        response = self.client.patch(
            self.detail_url(length_annotation),
            {"annotation_data": updated_data, "note": "updated length"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        length_annotation.refresh_from_db()
        self.assertEqual(length_annotation.annotation_data, updated_data)
        self.assertEqual(length_annotation.note, "updated length")

        text_data = annotation_data(
            self.ct.series_instance_uid,
            points=[[0, 0, 0]],
            text="before",
            tool_name="ArrowAnnotateTool",
        )
        _, text_annotation = self.create_annotation(
            annotation_type=ImageAnnotation.AnnotationType.TEXT,
            data=text_data,
        )
        text_data["text"] = "after"
        text_response = self.client.patch(
            self.detail_url(text_annotation), {"annotation_data": text_data}, format="json"
        )
        self.assertEqual(text_response.status_code, 200, text_response.data)
        text_annotation.refresh_from_db()
        self.assertEqual(text_annotation.annotation_data["text"], "after")

    def test_update_cannot_reassign_asset_result_or_annotation_type(self):
        _, annotation = self.create_annotation()
        other_result = ClinicalResult.objects.create(
            case=self.other_case, workflow_stage=WorkflowStage.CT
        )
        attempts = (
            {"image_asset": str(self.pet.id)},
            {"clinical_result": str(other_result.id)},
            {"annotation_type": ImageAnnotation.AnnotationType.TEXT},
        )
        for body in attempts:
            with self.subTest(body=body):
                response = self.client.patch(self.detail_url(annotation), body, format="json")
                self.assertEqual(response.status_code, 400)
        annotation.refresh_from_db()
        self.assertEqual(annotation.image_asset, self.ct)
        self.assertEqual(annotation.clinical_result, self.clinical_result)
        self.assertEqual(annotation.annotation_type, ImageAnnotation.AnnotationType.LENGTH)

    def test_delete_removes_annotation_and_repeated_delete_is_not_found(self):
        _, annotation = self.create_annotation()
        url = self.detail_url(annotation)
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertFalse(ImageAnnotation.objects.filter(id=annotation.id).exists())
        self.assertEqual(self.client.delete(url).status_code, 404)
        self.assertEqual(
            self.client.get(self.list_url, {"image_asset_id": self.ct.id}).data,
            [],
        )

    def test_requires_image_asset_query_parameter(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, 400)

    def test_denies_unauthenticated_and_non_pulmonology_user(self):
        self.client.credentials()
        self.assertIn(self.client.get(self.list_url).status_code, (401, 403))

        radiology = Department.objects.create(
            hospital=self.hospital, code="RADIOLOGY", name="Radiology"
        )
        technologist_role = DepartmentRole.objects.create(
            department=radiology,
            role=DepartmentRole.Role.TECHNOLOGIST,
            display_name="Technologist",
        )
        technologist = self.create_user("annotation-technologist", technologist_role)
        self.authenticate(technologist)
        self.assertEqual(self.client.get(self.list_url).status_code, 403)

    def test_other_doctor_and_other_hospital_case_are_not_found(self):
        self.authenticate(self.doctor)
        _, annotation = self.create_annotation()

        self.authenticate(self.other_doctor)
        requests = (
            self.client.get(self.list_url, {"image_asset_id": self.ct.id}),
            self.client.post(self.list_url, self.payload(), format="json"),
            self.client.patch(self.detail_url(annotation), {"note": "forbidden"}, format="json"),
            self.client.delete(self.detail_url(annotation)),
        )
        self.assertEqual([response.status_code for response in requests], [404, 404, 404, 404])
        self.assertTrue(ImageAnnotation.objects.filter(id=annotation.id).exists())

        self.authenticate(self.doctor)
        other_hospital_url = reverse(
            "doctor-case-image-annotation-list-create",
            kwargs={"case_id": self.other_hospital_case.id},
        )
        self.assertEqual(self.client.get(other_hospital_url, {"image_asset_id": self.ct.id}).status_code, 404)

    def test_cross_case_asset_and_annotation_id_are_blocked_even_with_same_series_uid(self):
        cross_asset_response = self.client.post(
            self.list_url,
            self.payload(self.other_case_ct, data=annotation_data(self.other_case_ct.series_instance_uid)),
            format="json",
        )
        self.assertEqual(cross_asset_response.status_code, 400)

        foreign_annotation = ImageAnnotation.objects.create(
            image_asset=self.other_case_ct,
            annotation_type=ImageAnnotation.AnnotationType.LENGTH,
            annotation_data=annotation_data(self.other_case_ct.series_instance_uid),
            created_by_user=self.doctor,
        )
        wrong_url = self.detail_url(foreign_annotation)
        self.assertEqual(self.client.patch(wrong_url, {"note": "IDOR"}, format="json").status_code, 404)
        self.assertEqual(self.client.delete(wrong_url).status_code, 404)

    def test_rejects_xray_mri_wsi_and_series_uid_mismatch(self):
        for asset in (self.xray, self.mri, self.wsi):
            with self.subTest(image_type=asset.image_type):
                response = self.client.post(
                    self.list_url,
                    self.payload(asset, data=annotation_data(asset.series_instance_uid)),
                    format="json",
                )
                self.assertEqual(response.status_code, 400)
                self.assertEqual(
                    self.client.get(self.list_url, {"image_asset_id": asset.id}).status_code,
                    404,
                )

        mismatch = self.client.post(
            self.list_url,
            self.payload(data=annotation_data("9.9.9.9")),
            format="json",
        )
        self.assertEqual(mismatch.status_code, 400)

    def test_rejects_clinical_result_from_another_case(self):
        other_result = ClinicalResult.objects.create(
            case=self.other_case, workflow_stage=WorkflowStage.CT
        )
        payload = self.payload()
        payload["clinical_result"] = str(other_result.id)
        response = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(response.status_code, 400)
