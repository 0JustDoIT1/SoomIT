# PD-L1 inference service

Virchow2로 미리 추출한 `[N, 2560]` `.pt` feature를 AMD-MIL로 분류하는 별도 HTTP 서비스입니다. 프로세스가 시작될 때 체크포인트를 한 번만 로드합니다.

이 서비스는 정확한 TPS 수치를 만들지 않습니다. 반환 범위는 `LT_1` (`<1%`), `FROM_1_TO_49` (`1–49%`), `GE_50` (`≥50%`)뿐입니다.

## 실행

모델 체크포인트와 전달받은 `MIL_BASELINE` 경로를 환경변수로 지정합니다. 모델 자료는 저장소에 커밋하지 않습니다.

```powershell
$env:PDL1_CHECKPOINT_PATH="C:\models\pdl1\final_model.pth"
$env:PDL1_MIL_BASELINE_PATH="C:\models\pdl1\MIL_BASELINE"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8100
```

명령은 이 디렉터리에서 실행합니다. 운영 환경에서는 Django와 서비스 사이에 내부망 접근 제한 또는 서비스 인증을 추가해야 합니다.

## API

- `GET /health`: 모델 로드 및 사용 장치 확인
- `POST /v1/predict`: body에 `.pt` 파일 bytes를 `application/octet-stream`으로 전송

```powershell
curl.exe -X POST http://127.0.0.1:8100/v1/predict `
  -H "Content-Type: application/octet-stream" `
  --data-binary "@C:\features\sample.pt"
```

입력은 `features` tensor가 포함된 PyTorch 객체여야 합니다. 기본 제한은 64 MiB, 1~5000 patches이며 tensor shape과 NaN/Inf를 검사합니다. 역직렬화는 `weights_only=True`를 사용합니다.
