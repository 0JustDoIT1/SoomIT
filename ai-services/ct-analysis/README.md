# CT analysis Cloud Run services

The integrated CT analysis package is split at the T-model boundary.

## Phase 1

`ct-analysis-phase1-serve` accepts a chest CT from Orthanc or GCS. It runs VISTA3D nodule segmentation, quantification, morphology, texture, malignancy scoring, thoracic anatomy segmentation, and generation of the nnU-Net T-model input. The complete working artifact is uploaded to GCS and the response status is `READY_FOR_T_MODEL`.

Phase 1 also converts the retained nodule, five lung-lobe, and canonical anatomy masks into independent GLB layers. The response includes `visualization_manifest_uri` and a `visualization.layers` array with private GCS mesh URIs, default colors, opacity, visibility, and supported `surface`/`wireframe` modes. Nodule components are emitted as stable size-ordered IDs (`N001`, `N002`, ...). This is visualization post-processing and does not change analytical model outputs.

Endpoints:

- `GET /health`
- `POST /v1/phase1/orthanc`
- `POST /v1/phase1/gcs`

Orthanc request body:

    {
      "orthanc_series_id": "40-character Orthanc series ID",
      "series_instance_uid": "optional DICOM SeriesInstanceUID",
      "case_id": "CASE001"
    }

The Orthanc endpoint downloads the raw DICOM series archive and runs the bundled
`code/dicom_to_nifti.py` converter before Phase 1 inference. The converted NIfTI and
`source/dicom_to_nifti_metadata.json` are retained in the uploaded GCS artifact.

GCS request body:

    {
      "ct_gcs_uri": "gs://bucket/input/CASE001_0000.nii.gz",
      "case_id": "CASE001"
    }

The `final_ct_analysis_deploy_ready` bundle's `orchestrator.py phase1` also accepts a raw CT
DICOM series directly: pass `--ct` a directory of DICOM files instead of a NIfTI path and it is
converted with `code/dicom_to_nifti.py` (pydicom-based, HU rescale + DICOM orientation handling)
before the pipeline runs.

## Phase 2

`ct-analysis-phase2-serve` accepts the Phase 1 GCS artifact and the primary-tumor mask returned by the future T model. It calculates the tumor and anatomy features and writes the canonical 34-feature N-model payload to GCS. The response status is `READY_FOR_N_MODEL`.

Endpoints:

- `GET /health`
- `POST /v1/phase2`

Request body:

    {
      "case_id": "CASE001",
      "patient_id": "PATIENT001",
      "age": 67,
      "gender": "M",
      "histology": "Adenocarcinoma",
      "phase1_artifact_uri": "gs://soomit-bucket/ct-analysis/CASE001/",
      "t_tumor_mask_uri": "gs://soomit-bucket/ct-analysis/CASE001/t/tumor_mask.nii.gz"
    }

The T and N inference models are intentionally outside these services until their final packages are delivered. Phase 1 persists every intermediate artifact needed by them.

## Model artifacts

Phase 1 downloads the four locally trained checkpoints from `gs://soomit-bucket/models/ct-analysis/` during container startup and validates the supplied SHA-256 values. Model files remain outside Git and the container image.

## Build

Run from this directory:

    gcloud builds submit --config cloudbuild-phase1.yaml .
    gcloud builds submit --config cloudbuild-phase2.yaml .

The Phase 1 container uses one CUDA runtime for VISTA3D and the three nodule models, plus an isolated Python virtual environment for TotalSegmentator. The public `total` and `lung_vessels` TotalSegmentator weights are cached in the image at build time so a cold instance does not download them during the first inference. Phase 2 is CPU-only.

VISTA3D is initialized once during Phase 1 server startup. Each request clears
VISTA3D's interactive-inference cache before and after use, then moves the
network back to CPU before the later GPU stages. This preserves the former GPU
memory profile while removing repeated checkpoint and Python-process startup.
Set `CT_ANALYSIS_KEEP_VISTA_ON_GPU=true` only after deployment memory profiling
shows VISTA3D can coexist with TotalSegmentator and the nodule models.
