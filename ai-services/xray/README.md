# X-ray inference service

One private Cloud Run service loads the supplied Swin classifier and Faster R-CNN detector once at startup. `POST /v1/predict` accepts PNG or JPEG bytes with `Content-Type: application/octet-stream` (or the matching image media type).

## Local model files

Place these files under `models/` before building. The repository-wide `.gitignore` excludes `*.pth` files.

- `models/detector_final_model.pth`
- `models/classification_final_model.pth`

## API

```text
GET  /health
POST /v1/predict?score_threshold=0.30
```

The response contains the three-class screening result, suspicious-lung-cancer probability, and all detections at or above the requested threshold. The service only accepts image formats supported by Pillow; convert DICOM studies before calling it.

## Build and deploy

```bash
docker build -t gcr.io/soomit-506909/xray-serve:xray-v1 .
docker push gcr.io/soomit-506909/xray-serve:xray-v1

gcloud run deploy xray-serve \
  --image=gcr.io/soomit-506909/xray-serve:xray-v1 \
  --region=asia-southeast1 \
  --project=soomit-506909 \
  --port=8080 \
  --gpu=1 \
  --gpu-type=nvidia-l4 \
  --no-gpu-zonal-redundancy \
  --memory=16Gi \
  --cpu=4 \
  --no-cpu-throttling \
  --concurrency=1 \
  --min-instances=0 \
  --max-instances=1 \
  --timeout=300 \
  --no-allow-unauthenticated
```

Cloud Run injects `PORT`; the container listens on `0.0.0.0` as required.
