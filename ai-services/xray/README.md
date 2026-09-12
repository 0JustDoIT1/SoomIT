# X-ray AI Cloud Run 구축 정리

## 1. 현재 배포 상태

X-ray 3종 분류 모델과 객체 탐지 모델을 하나의 비공개 Cloud Run 서비스로 운영합니다.

| 항목 | 내용 |
| --- | --- |
| GCP 프로젝트 | `soomit-506909` |
| 리전 | `asia-southeast1` |
| Cloud Run 서비스 | `xray-serve` |
| 서비스 URL | `https://xray-serve-461462459694.asia-southeast1.run.app` |
| 컨테이너 이미지 | `gcr.io/soomit-506909/xray-serve:xray-v1` |
| 이미지 digest | `sha256:e98bf50480d4101a0b4edc1168b86ef02421b61f46bbbdec24397bba0629cd91` |
| Cloud Run 리비전 | `xray-serve-00002-b6q` |
| GPU | NVIDIA L4 1개 |
| CPU / 메모리 | 4 CPU / 16Gi |
| 인스턴스 | 최소 0, 최대 1 |
| 동시 요청 | 1 |
| 요청 제한 시간 | 300초 |
| 인증 | 비공개, Google ID Token 필요 |
| 호출 권한 | `sumit-gcs-sa`에 `roles/run.invoker` 부여 |

`min-instances=0`이므로 유휴 상태에서는 인스턴스가 내려가고 첫 요청에 콜드스타트가 발생할 수 있습니다.

콜드스타트 시 서비스는 다음 순서로 준비됩니다.

1. GCS에서 분류·탐지 체크포인트를 다운로드합니다.
2. 각 파일의 SHA-256을 검증합니다.
3. 두 모델을 GPU에 한 번만 로드하고 `eval()` 모드로 전환합니다.
4. 모델 로딩이 끝난 후 HTTP 요청을 받습니다.

## 2. 영상과 모델 저장 위치

X-ray 원본 영상은 Orthanc에 저장합니다. 백엔드가 대상 영상을 Orthanc에서 읽고 PNG 또는 JPEG로 변환한 뒤 `xray-serve`에 바이트로 전달합니다.

직접 학습한 모델과 추론 설정은 다음 GCS 경로에서 관리합니다.

```text
gs://soomit-bucket/models/xray/xray-v1/
├── detector_final_model.pth
├── classification_final_model.pth
├── inference_config.json
└── model_manifest.json
```

| 파일 | 크기 | SHA-256 |
| --- | ---: | --- |
| `detector_final_model.pth` | 173,656,989 bytes | `bf80f1d0052e745f477bc4d92a0de52c05c30090449df7875d90093505d1f3c2` |
| `classification_final_model.pth` | 347,118,369 bytes | `7f3cec7f00860cebb9497a956dc46b1b1645f8c2ff8676754041db4e716bd5b1` |

체크포인트는 Docker 이미지와 Git에 포함하지 않습니다. Cloud Run 서비스 계정에는 `soomit-bucket`의 `roles/storage.objectViewer` 권한이 부여되어 있습니다.

## 3. 탑재 모델

### X-ray 분류 모델

- 구조: `swin_base_patch4_window7_224`
- RGB 변환
- Resize: 256
- CenterCrop: 224
- ImageNet mean/std 정규화
- 체크포인트 로딩: `strict=True`

| 분류 클래스 | Django 판정값 |
| --- | --- |
| `Normal` | `NEGATIVE` |
| `Other Lung Disease` | `INDETERMINATE` |
| `Suspicious Lung Cancer` | `SUSPICIOUS` |

### X-ray 객체 탐지 모델

- 구조: `fasterrcnn_resnet50_fpn_v2`
- 최소 입력 크기: 1200
- 최대 입력 크기: 1333
- 기본 탐지 임계값: 0.30
- 체크포인트 로딩: `strict=True`

탐지 클래스는 다음과 같습니다.

- Atelectasis
- Calcification
- Cardiomegaly
- Consolidation
- Diffuse Nodule
- Effusion
- Emphysema
- Fibrosis
- Fracture
- Mass
- Nodule
- Pleural Thickening
- Pneumothorax

## 4. 지원 범위

```text
Orthanc X-ray 원본
  → 백엔드 PNG/JPEG 변환
  → xray-serve
      ├── 3종 분류
      ├── 클래스별 확률
      ├── 폐암 의심 점수
      └── 병변 탐지
          ├── 병변 종류
          ├── 신뢰도
          └── 원본 이미지 픽셀 바운딩박스
```

세그멘테이션은 지원하지 않으므로 픽셀 마스크, 병변 면적·직경, 폐 영역 분할 및 마스크 결과 이미지는 반환하지 않습니다.

## 5. API

### 상태 확인

```http
GET /health
Authorization: Bearer <Google ID Token>
```

```json
{
  "status": "ok",
  "device": "cuda",
  "model_revision": "xray-v1"
}
```

### X-ray 추론

```http
POST /v1/predict?score_threshold=0.30
Authorization: Bearer <Google ID Token>
Content-Type: image/png

<PNG 또는 JPEG 원본 바이트>
```

```json
{
  "model_revision": "xray-v1",
  "image": {
    "width": 2048,
    "height": 2048
  },
  "classification": {
    "prediction": "Suspicious Lung Cancer",
    "class_index": 2,
    "assessment": "SUSPICIOUS",
    "suspicion_score": 0.8721,
    "probabilities": {
      "Normal": 0.0521,
      "Other Lung Disease": 0.0758,
      "Suspicious Lung Cancer": 0.8721
    }
  },
  "detections": [
    {
      "class_id": 11,
      "class_name": "Nodule",
      "score": 0.8614,
      "bbox_xyxy": [320.4, 510.2, 615.8, 790.1]
    }
  ]
}
```

`bbox_xyxy`는 원본 이미지 기준 `[x1, y1, x2, y2]` 픽셀 좌표입니다. 별도의 결과 이미지 파일은 생성하지 않으며 프론트엔드가 이 좌표로 박스를 그립니다.

## 6. 빌드와 배포

```bash
gcloud builds submit ai-services/xray \
  --project=soomit-506909 \
  --tag=gcr.io/soomit-506909/xray-serve:xray-v1

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

## 7. 구현 위치와 검증 상태

```text
ai-services/xray/
├── Dockerfile
├── .dockerignore
├── .gcloudignore
├── artifact.py
├── inference.py
├── server.py
├── requirements.txt
├── config/
│   ├── inference_config.json
│   └── model_manifest.json
└── models/                  # 로컬 개발용, Git/Cloud Build 제외
```

현재 리비전에서 확인한 항목은 다음과 같습니다.

- Cloud Run Ready 상태
- GCS 체크포인트 다운로드 및 SHA-256 검증
- NVIDIA L4 CUDA 모델 로딩
- `/health` 정상 응답
- 실제 PNG 요청의 분류 및 탐지 응답 생성

마지막 검증은 API 실행 경로를 확인하기 위한 비의료 이미지 스모크 테스트입니다. 임상 성능을 검증한 결과로 사용하지 않습니다.
