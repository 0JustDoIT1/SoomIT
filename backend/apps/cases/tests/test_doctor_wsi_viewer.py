from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.test import SimpleTestCase

from apps.cases.views import DoctorSlideTileAPIView, DoctorSlideViewerAPIView
from apps.pathology.services.orthanc import OrthancBinaryResponse, OrthancError


class DoctorWsiViewerMetadataTests(SimpleTestCase):
    pyramid = {
        "Resolutions": [1, 4, 12],
        "Sizes": [[4608, 2304], [1024, 512], [384, 192]],
        "TotalWidth": 4608,
        "TotalHeight": 2304,
        "TileWidth": 512,
        "TileHeight": 512,
    }

    @patch("apps.cases.views.get_wsi_pyramid")
    @patch("apps.cases.views._doctor_slide_or_404")
    def test_returns_actual_orthanc_level_sizes_for_irregular_pyramid(
        self, slide_or_404, get_pyramid
    ):
        slide = SimpleNamespace(
            id=uuid4(), orthanc_series_id="orthanc-pdl1-series", mpp="0.25"
        )
        slide_or_404.return_value = slide
        get_pyramid.return_value = self.pyramid

        response = DoctorSlideViewerAPIView().get(SimpleNamespace(), slide.id)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["max_level"], 2)
        self.assertEqual(
            response.data["sizes"],
            [[4608, 2304], [1024, 512], [384, 192]],
        )
        self.assertEqual(response.data["resolutions"], [1, 4, 12])
        self.assertEqual(
            response.data["tile_counts"],
            [
                {"columns": 9, "rows": 5},
                {"columns": 2, "rows": 1},
                {"columns": 1, "rows": 1},
            ],
        )
        self.assertIn(str(slide.id), response.data["tile_url_template"])
        get_pyramid.assert_called_once_with("orthanc-pdl1-series")

    @patch("apps.cases.views.get_wsi_tile")
    @patch("apps.cases.views.get_wsi_pyramid")
    @patch("apps.cases.views._doctor_slide_or_404")
    def test_valid_pdl1_tile_is_returned(self, slide_or_404, get_pyramid, get_tile):
        slide = SimpleNamespace(id=uuid4(), orthanc_series_id="orthanc-pdl1-series")
        slide_or_404.return_value = slide
        get_pyramid.return_value = self.pyramid
        get_tile.return_value = OrthancBinaryResponse(b"jpeg", "image/jpeg")

        response = DoctorSlideTileAPIView().get(
            SimpleNamespace(), slide.id, level=0, x=8, y=4
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"jpeg")
        get_tile.assert_called_once_with("orthanc-pdl1-series", 0, 8, 4)

    @patch("apps.cases.views.get_wsi_tile")
    @patch("apps.cases.views.get_wsi_pyramid")
    @patch("apps.cases.views._doctor_slide_or_404")
    def test_invalid_tile_level_or_coordinates_return_404_without_upstream_tile_call(
        self, slide_or_404, get_pyramid, get_tile
    ):
        slide = SimpleNamespace(id=uuid4(), orthanc_series_id="orthanc-he-series")
        slide_or_404.return_value = slide
        get_pyramid.return_value = self.pyramid

        requests = ((3, 0, 0), (0, 9, 0), (0, 0, 5), (0, -1, 0))
        for level, x, y in requests:
            with self.subTest(level=level, x=x, y=y):
                response = DoctorSlideTileAPIView().get(
                    SimpleNamespace(), slide.id, level=level, x=x, y=y
                )
                self.assertEqual(response.status_code, 404)
        get_tile.assert_not_called()

    @patch("apps.cases.views.get_wsi_pyramid")
    @patch("apps.cases.views._doctor_slide_or_404")
    def test_missing_series_preserves_upstream_404(self, slide_or_404, get_pyramid):
        slide = SimpleNamespace(id=uuid4(), orthanc_series_id="missing-series", mpp=None)
        slide_or_404.return_value = slide
        get_pyramid.side_effect = OrthancError(
            "Orthanc에서 해당 WSI를 찾을 수 없습니다.",
            upstream_status=404,
            reason="not_found",
        )

        response = DoctorSlideViewerAPIView().get(SimpleNamespace(), slide.id)

        self.assertEqual(response.status_code, 404)

    @patch("apps.cases.views.get_wsi_pyramid")
    @patch("apps.cases.views._doctor_slide_or_404")
    def test_orthanc_connection_failure_remains_502(self, slide_or_404, get_pyramid):
        slide = SimpleNamespace(id=uuid4(), orthanc_series_id="unreachable", mpp=None)
        slide_or_404.return_value = slide
        get_pyramid.side_effect = OrthancError(
            "Orthanc에 연결할 수 없습니다.", reason="connection_error"
        )

        response = DoctorSlideViewerAPIView().get(SimpleNamespace(), slide.id)

        self.assertEqual(response.status_code, 502)

    @patch("apps.cases.views.get_wsi_pyramid")
    @patch("apps.cases.views._doctor_slide_or_404")
    def test_upstream_conflict_is_preserved_as_409(self, slide_or_404, get_pyramid):
        slide = SimpleNamespace(id=uuid4(), orthanc_series_id="processing", mpp=None)
        slide_or_404.return_value = slide
        get_pyramid.side_effect = OrthancError(
            "WSI pyramid is not ready.", upstream_status=409
        )

        response = DoctorSlideViewerAPIView().get(SimpleNamespace(), slide.id)

        self.assertEqual(response.status_code, 409)
