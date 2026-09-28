from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from apps.cases.views import (
    DoctorCaseCtSegmentationLabelmapAPIView,
    DoctorCaseDicomWebFrameAPIView,
    _DicomPassthroughContentNegotiation,
)


class DoctorCaseDicomWebFrameAPIViewTests(SimpleTestCase):
    def test_proxies_one_frame_from_the_case_scoped_asset(self):
        request = APIRequestFactory().get("/")
        case_id = uuid4()
        asset_id = uuid4()
        asset = SimpleNamespace(
            study_instance_uid="1.2.3",
            series_instance_uid="1.2.3.4",
        )

        with (
            patch("apps.cases.views._doctor_dicom_asset_or_404", return_value=asset) as scoped_asset,
            patch(
                "apps.cases.views.retrieve_instance_frame",
                return_value=SimpleNamespace(
                    content=b"frame",
                    content_type='multipart/related; type="application/octet-stream"; boundary=test',
                ),
            ) as retrieve_frame,
        ):
            response = DoctorCaseDicomWebFrameAPIView().get(
                request,
                case_id,
                asset_id,
                "1.2.3.4.5",
                1,
            )

        scoped_asset.assert_called_once_with(request, case_id, asset_id)
        retrieve_frame.assert_called_once_with("1.2.3", "1.2.3.4", "1.2.3.4.5", 1)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"frame")
        self.assertEqual(response["Cache-Control"], "private, max-age=3600")


class DoctorCaseCtSegmentationLabelmapAPIViewTests(SimpleTestCase):
    def test_accepts_binary_labelmap_content_negotiation(self):
        self.assertIs(
            DoctorCaseCtSegmentationLabelmapAPIView.content_negotiation_class,
            _DicomPassthroughContentNegotiation,
        )
