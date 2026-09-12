# CT nodule detection service

This service wraps the supplied CPMNetv2 + HN25 checkpoint and its validated
preprocessing, crop inference, final 3D NMS, and coordinate conversion pipeline.
It excludes malignancy classification and malignancy patch extraction.

The vendored CPMNetv2 source is pinned to commit:

    5d433717f2d615f20bd1a8ce379c59bdf6b6153d

## Model artifact

The container downloads the supplied checkpoint from:

    gs://soomit-bucket/models/ct-detection/cpmnetv2-hn25-v1.0.0/best_val_loss.pt

It stores the file at `/models/best_val_loss.pt` for the lifetime of the
container. For local development, either set `MODEL_GCS_URI` and use Application
Default Credentials, or place the checkpoint at `models/best_val_loss.pt`.

Expected SHA-256:

    4d1036ba7bdb7aec132d13ce8d0b760d277146e48511d459e6379c0651d1a009

The checkpoint is excluded by the repository-wide Git ignore rules. Verify a
local copy with:

    (Get-FileHash models/best_val_loss.pt -Algorithm SHA256).Hash.ToLower()

## API

    GET  /health
    POST /v1/detect?filename=scan.nii.gz
    POST /v1/detect?filename=dicom.zip&series_uid=<optional-series-uid>
    POST /v1/detect/orthanc

The source CT remains in Orthanc. For production, the backend sends an Orthanc
series ID and the service downloads the series archive into its request-scoped
temporary directory. The temporary archive is deleted after inference. The
legacy byte-upload endpoint remains available for NIfTI and small DICOM ZIP
inputs.

The Orthanc endpoint accepts:

    {
      "orthanc_series_id": "40-character Orthanc series ID",
      "series_instance_uid": "optional DICOM SeriesInstanceUID",
      "case_id": "optional backend case ID",
      "score_threshold": 0.9612025618553162
    }

Configure `ORTHANC_BASE_URL`, `ORTHANC_USERNAME`, `ORTHANC_PASSWORD`, and
`ORTHANC_TIMEOUT_SECONDS` on Cloud Run. Use a private VPC address for Orthanc
and Secret Manager references for its credentials.

The JSON response includes:

- final CPMNetv2 detections after 3D NMS and top-k;
- centers and boxes in resampled voxel, original voxel, and patient physical
XYZ millimeter coordinates;
- inline viewer_annotations for drawing 3D boxes on the source CT.

By default, the response includes detections at or above the validation Best-F1
score threshold (`0.9612025618553162`). Pass `score_threshold=0` to receive the
full candidate pool after NMS, or set another value between 0 and 1.

Example:

    curl --fail --request POST \
      --header "Content-Type: application/octet-stream" \
      --data-binary @scan.nii.gz \
      "http://localhost:8080/v1/detect?filename=scan.nii.gz&score_threshold=0.9612025618553162"

## Build and run

    docker build -t soomit-ct-detection:cpmnetv2-hn25-v1 .
    docker run --rm --gpus all -p 8080:8080 soomit-ct-detection:cpmnetv2-hn25-v1

Use one Uvicorn worker and container concurrency 1 so one GPU holds exactly one
model instance and processes one CT study at a time.
