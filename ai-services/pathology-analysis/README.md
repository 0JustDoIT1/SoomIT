# Pathology and genomics Cloud Run

One private GPU service downloads a WSI from GCS, extracts one shared UNI2-h embedding, runs the official tissue CLAM head, and runs the official gene CLAM head only for a LUAD tissue prediction.

## API

`GET /health`

`POST /v1/predict`

```json
{
  "case_id": "CASE001",
  "patient_id": "PATIENT001",
  "wsi_id": "WSI001",
  "wsi_gcs_uri": "gs://soomit-bucket/pathology/CASE001/slide.svs",
  "include_heatmap": false
}
```

The WSI preprocessing contract is 0.5 MPP, 256 by 256 tiles, at least 50 percent tissue, deterministic sampling with seed 42, and at most 10,000 patches. The resulting `[N, 1536]` UNI2-h embedding is held in memory and shared by both heads.

The gene model was trained only on LUAD. Benign and LUSC tissue predictions therefore return `NOT_APPLICABLE_NON_LUAD` without gene probabilities.
