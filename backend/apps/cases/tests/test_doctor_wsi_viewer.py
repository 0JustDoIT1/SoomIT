from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.test import SimpleTestCase

from apps.cases.views import (
    DoctorSlidePreviewAPIView,
    DoctorSlideTileAPIView,
    DoctorSlideTissueHeatmapAPIView,
    DoctorSlideViewerAPIView,
    _BinaryPassthroughContentNegotiation,
)
from apps.pathology.services.orthanc import OrthancBinaryResponse, OrthancError
from apps.pathology.services.pathology_storage import PathologyStorageError


class DoctorWsiViewerMetadataTests(SimpleTestCase):
    pyramid = {
        "Resolutions": [1, 4, 12],
        "Sizes": [[4608, 2304], [1024, 512], [384, 192]],
        "TotalWidth": 4608,
        "TotalHeight": 2304,
        "TileWidth": 512,
        "TileHeight": 512,
    }

    def test_heatmap_accepts_image_binary_content_negotiation(self):
        self.assertIs(
            DoctorSlideTissueHeatmapAPIView.content_negotiation_class,
            _BinaryPassthroughContentNegotiation,
        )

    def test_viewer_and_preview_bypass_accept_header_negotiation(self):
        self.assertIs(
            DoctorSlideViewerAPIView.content_negotiation_class,
            _BinaryPassthroughContentNegotiation,
        )
        self.assertIs(
            DoctorSlidePreviewAPIView.content_negotiation_class,
            _BinaryPassthroughContentNegotiation,
        )

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

    @patch("apps.cases.views.register_wsi_with_orthanc_task.delay")
    @patch("apps.cases.views.get_wsi_pyramid")
    @patch("apps.cases.views._doctor_slide_or_404")
    def test_unlinked_series_returns_machine_readable_conflict(
        self, slide_or_404, get_pyramid, enqueue_repair
    ):
        slide = SimpleNamespace(id=uuid4(), orthanc_series_id=None, mpp=None)
        slide_or_404.return_value = slide

        response = DoctorSlideViewerAPIView().get(SimpleNamespace(), slide.id)

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data["code"], "ORTHANC_SERIES_NOT_LINKED")
        self.assertTrue(response.data["repair_requested"])
        enqueue_repair.assert_called_once_with(str(slide.id))
        get_pyramid.assert_not_called()

    @patch("apps.cases.views.register_wsi_with_orthanc_task.delay")
    @patch("apps.cases.views.get_wsi_pyramid")
    @patch("apps.cases.views._doctor_slide_or_404")
    def test_blank_series_returns_machine_readable_conflict(
        self, slide_or_404, get_pyramid, enqueue_repair
    ):
        slide = SimpleNamespace(id=uuid4(), orthanc_series_id="", mpp=None)
        slide_or_404.return_value = slide

        response = DoctorSlideViewerAPIView().get(SimpleNamespace(), slide.id)

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data["code"], "ORTHANC_SERIES_NOT_LINKED")
        enqueue_repair.assert_called_once_with(str(slide.id))
        get_pyramid.assert_not_called()

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

    @patch("apps.cases.views.download_pathology_wsi_preview")
    @patch("apps.cases.views._doctor_slide_or_404")
    def test_reads_preview_without_requiring_orthanc_link(self, slide_or_404, download):
        slide = SimpleNamespace(
            id=uuid4(),
            orthanc_series_id=None,
            image_asset=SimpleNamespace(storage_uri="gs://test-bucket/wsi.svs"),
        )
        slide_or_404.return_value = slide
        download.return_value = (b"jpeg", "image/jpeg")

        response = DoctorSlidePreviewAPIView().get(SimpleNamespace(), slide.id)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"jpeg")
        download.assert_called_once_with("gs://test-bucket/wsi.svs")

    @patch("apps.cases.views.generate_wsi_preview_task.delay")
    @patch("apps.cases.views.download_pathology_wsi_preview")
    @patch("apps.cases.views._doctor_slide_or_404")
    def test_missing_preview_queues_backfill(self, slide_or_404, download, enqueue_repair):
        slide = SimpleNamespace(
            id=uuid4(), image_asset=SimpleNamespace(storage_uri="gs://test-bucket/wsi.svs")
        )
        slide_or_404.return_value = slide
        download.side_effect = PathologyStorageError("WSI preview is not available yet.")

        response = DoctorSlidePreviewAPIView().get(SimpleNamespace(), slide.id)

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data["code"], "WSI_PREVIEW_QUEUED")
        self.assertTrue(response.data["repair_requested"])
        enqueue_repair.assert_called_once_with(str(slide.id))

        poll_response = DoctorSlidePreviewAPIView().get(
            SimpleNamespace(query_params={"repair": "0"}), slide.id
        )

        self.assertEqual(poll_response.status_code, 202)
        self.assertFalse(poll_response.data["repair_requested"])
        enqueue_repair.assert_called_once_with(str(slide.id))

    @patch("apps.cases.views.download_pathology_wsi_tissue_heatmap")
    @patch("apps.cases.views._doctor_slide_or_404")
    def test_reads_existing_heatmap_without_mutating_storage(self, slide_or_404, download):
        slide = SimpleNamespace(id=uuid4(), image_asset=SimpleNamespace(storage_uri="gs://test-bucket/wsi.svs"))
        slide_or_404.return_value = slide
        download.return_value = (b"jpeg", "image/jpeg")

        response = DoctorSlideTissueHeatmapAPIView().get(SimpleNamespace(), slide.id)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"jpeg")
        download.assert_called_once_with("gs://test-bucket/wsi.svs")

    @patch("apps.cases.views.download_pathology_wsi_tissue_heatmap")
    @patch("apps.cases.views._doctor_slide_or_404")
    def test_missing_heatmap_is_nonfatal_no_content(self, slide_or_404, download):
        slide = SimpleNamespace(id=uuid4(), image_asset=SimpleNamespace(storage_uri="gs://test-bucket/wsi.svs"))
        slide_or_404.return_value = slide
        download.side_effect = PathologyStorageError("WSI tissue heatmap is not available yet.")

        response = DoctorSlideTissueHeatmapAPIView().get(SimpleNamespace(), slide.id)

        self.assertEqual(response.status_code, 204)
