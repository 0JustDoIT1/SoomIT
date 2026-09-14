# PD-L1 AI Cloud Run

`pdl1-serve`는 PD-L1 IHC WSI와 HALO 종양 ROI annotation을 입력받아 TPS 구간을 3개 클래스로 분류합니다.

## 입력 파이프라인

```text
GCS의 PD-L1 IHC WSI (.svs)
+ HALO annotation (.annotations)
+ ROI layer (Tumor 또는 Tumor-JS)
  → 0.5 MPP, 224×224 종양 ROI patch (최대 5,000개)
  → paige-ai/Virchow2 2,560차원 feature
  → AMD-MIL
  → TPS <1% / 1-49% / >=50%
```

WSI는 요청 본문에 업로드하지 않습니다. Django가 DB에 저장된 WSI의 `gs://` 또는 `gcs://` URI를 전달하고 Cloud Run 서비스 계정이 GCS에서 직접 내려받습니다. Annotation은 크기가 작으므로 요청 JSON에 base64로 전달합니다.

## API

`GET /health`

`POST /v1/predict`

```json
{
  "wsi_gcs_uri": "gs://bucket/path/slide.svs",
  "annotation_base64": "PEFubm90YXRpb25zPi4uLjwvQW5ub3RhdGlvbnM+",
  "roi_layer": "Tumor",
  "main_index": "patient-id",
  "pdl1_image_id": "wsi-id"
}
```

응답에는 모델 revision/SHA, patch 수, TPS class/range, confidence, 세 클래스 확률과 적용된 전처리 값이 포함됩니다.

## 모델 아티팩트

- AMD-MIL: `gs://soomit-bucket/models/pdl1/final_model/final_model.pth`
- 모델 리포트: `gs://soomit-bucket/models/pdl1/final_model/model_report.json`
- AMD-MIL SHA-256: `db0e812ab9b38c77b9bbf3725f9d92482b774e2a18cb5361147c793913b7a376`
- Virchow2: `paige-ai/Virchow2` (Hugging Face gated model)

Virchow2는 콜드 스타트마다 다운로드하지 않도록 컨테이너 빌드 시 Hugging Face cache를 이미지에 포함합니다. 빌드 계정에는 해당 gated repository에 접근 가능한 토큰이 필요합니다.

## Django 환경 변수

```env
PDL1_INFERENCE_SERVICE_URL=https://pdl1-serve-461462459694.asia-southeast1.run.app
PDL1_INFERENCE_SERVICE_USE_ID_TOKEN=1
PDL1_INFERENCE_TIMEOUT_SECONDS=1800
PDL1_ANNOTATION_MAX_UPLOAD_BYTES=8388608
```
