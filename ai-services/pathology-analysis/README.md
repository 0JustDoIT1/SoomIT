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

## Performance measurements

The server logs `latency service=pathology_analysis` with `stage` and
`elapsed_seconds`; the prediction response is unchanged.

- `model_initialization`: startup artifact retrieval and model loading.
- `download`, `preview`, `heatmap`: download and image generation/upload.
- `inference_lock_wait`: waiting for another inference request.
- `embedding_total`: WSI preparation, patch extraction and UNI2-h features.
- `patch_read_and_transform`: actual CPU work in the prefetch worker.
- `patch_prefetch_wait`: inference waiting for prefetched batches.
- `embedding_host_to_device`: input tensor transfer.
- `embedding_gpu_inference`: model forward, float conversion and CPU result transfer.
  This is wall time, not isolated GPU kernel time; it also applies in CPU mode.
- `clam_prediction`: tissue and, for LUAD, gene CLAM analysis.
- `total`: successful request processing, including download and output generation.

Patch count, batch size and device are logged without patient identifiers.
Read/transform work overlaps inference, so these times must not be added together.
Totals also contain their detailed stages. Compare repeated warm requests with
the same WSI, patch count, batch size and heatmap option, separately from cold
startup. High prefetch wait indicates patch processing limits throughput; high
embedding inference time with low wait supports evaluating TensorRT. Output
equivalence for TensorRT still requires a separate model comparison.
