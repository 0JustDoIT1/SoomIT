# PD-L1 AI Cloud Run

Virchow2로 미리 추출한 패치 특징을 AMD-MIL로 분류해 PD-L1 TPS 구간을 반환합니다. 이 서비스는 WSI 원본에서 패치를 추출하거나 TPS 숫자를 회귀하지 않습니다.

## 배포 상태

| 항목 | 값 |
|---|---|
| GCP 프로젝트 | `soomit-506909` |
| 리전 | `asia-southeast1` |
| Cloud Run 서비스 | `pdl1-serve` |
| URL | `https://pdl1-serve-461462459694.asia-southeast1.run.app` |
| 이미지 | `gcr.io/soomit-506909/pdl1-serve:final_model` |
| 리비전 | `pdl1-serve-00001-9md` |
| GPU | NVIDIA L4 1개 |
| CPU / 메모리 | 4 CPU / 16Gi |
| 인스턴스 | 최소 0, 최대 1 |
| 동시 요청 | 1 |
| 인증 | 비공개, Google ID Token 필요 |

`sumit-gcs-sa@soomit-506909.iam.gserviceaccount.com`에 `roles/run.invoker`가 부여돼 있습니다. `min-instances=0`이므로 첫 요청에는 콜드 스타트가 발생할 수 있습니다.

## 모델 파일

```text
gs://soomit-bucket/models/pdl1/final_model/
├── final_model.pth
├── model_report.json
└── model_manifest.json
```

컨테이너 시작 시 `final_model.pth`를 GCS에서 `/models/final_model.pth`로 내려받고 SHA-256을 검사한 뒤 한 번만 로드합니다.

```text
db0e812ab9b38c77b9bbf3725f9d92482b774e2a18cb5361147c793913b7a376
```

## 입력

`POST /v1/predict`의 본문으로 PyTorch `.pt` 파일 바이트를 전송합니다.

```python
{
    "features": torch.Tensor,   # 필수, shape [N, 2560]
    "main_index": "patient-1", # 선택
    "pdl1_image_id": "slide-1" # 선택
}
```

- `N`: 1~5000개 패치
- `2560`: Virchow2 특징 차원
- `features`: 유한한 부동소수점 텐서
- 최대 요청 크기: 64MiB
- 입력은 `torch.load(..., weights_only=True)`로 읽습니다.

Django는 사용자에게 `feature_file`과 `wsi_id`를 받고, `.pt`의 원본 바이트를 이 서비스로 전달합니다. WSI 원본은 이 Cloud Run의 직접 입력이 아닙니다.

WSI 읽기, 종양 ROI 결정, 패치 추출, Virchow2 특징 추출은 AMD-MIL 분류 모델의 기능이나 이 서비스의 누락 기능이 아닙니다. WSI에서 새 `.pt` 입력을 생성할 때 필요한 별도 상위 전처리 단계이며, 입력 특징은 학습 때와 같은 ROI·MPP·패치·Virchow2 조건으로 만들어져야 합니다.

## 출력

| 클래스 | TPS 구간 | 코드 |
|---|---|---|
| 0 | `<1%` | `LT_1` |
| 1 | `1–49%` | `FROM_1_TO_49` |
| 2 | `≥50%` | `GE_50` |

```json
{
  "model_revision": "final_model",
  "model_sha256": "db0e812ab9b38c77b9bbf3725f9d92482b774e2a18cb5361147c793913b7a376",
  "main_index": "P-0031112",
  "pdl1_image_id": "679967",
  "patch_count": 99,
  "predicted_class": 2,
  "predicted_tps_range": "GE_50",
  "predicted_tps_range_label": "≥50%",
  "confidence": 0.9886972904205322,
  "probabilities": {
    "class_0": 0.0001871330023277551,
    "class_1": 0.011115523055195808,
    "class_2": 0.9886972904205322
  }
}
```

## API

```http
GET /health
Authorization: Bearer <Google ID Token>
```

```http
POST /v1/predict
Authorization: Bearer <Google ID Token>
Content-Type: application/octet-stream

<PT feature file bytes>
```

## Django 설정

VM의 `infra/.env`에 다음 값을 둡니다.

```dotenv
PDL1_INFERENCE_SERVICE_URL=https://pdl1-serve-461462459694.asia-southeast1.run.app
PDL1_INFERENCE_SERVICE_USE_ID_TOKEN=1
PDL1_INFERENCE_TIMEOUT_SECONDS=60
PDL1_FEATURE_MAX_UPLOAD_BYTES=67108864
```

## 빌드와 배포

```bash
gcloud builds submit ai-services/pd-l1 \
  --project=soomit-506909 \
  --tag=gcr.io/soomit-506909/pdl1-serve:final_model

gcloud run deploy pdl1-serve \
  --image=gcr.io/soomit-506909/pdl1-serve:final_model \
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
  --service-account=sumit-gcs-sa@soomit-506909.iam.gserviceaccount.com \
  --no-allow-unauthenticated
```

## 검증 결과

- GCS 다운로드와 SHA-256 검사 성공
- `strict=True` 체크포인트 로드 성공
- NVIDIA L4 CUDA 로드 성공
- 클래스별 Drive 샘플 3개 실제 추론 성공
- class 0: `0.973389`, class 1: `0.999579`, class 2: `0.988697`
