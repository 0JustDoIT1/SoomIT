# patient_app

A new Flutter project.

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Learn Flutter](https://docs.flutter.dev/get-started/learn-flutter)
- [Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Flutter learning resources](https://docs.flutter.dev/reference/learning-resources)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.

## 주변 약국 조회 (Android)

로그인 화면의 **테스트 기능 → 내 주변 약국 찾기**에서 현재 기기 위치를
기준으로 가까운 약국 목록을 확인할 수 있습니다. 앱은 백엔드의 공개 조회
API에 좌표만 전달하며, 공공데이터 인증키는 앱에 포함하지 않습니다.

백엔드의 `.env`에는 공공데이터 인증키를 설정합니다:

```properties
PUBLIC_DATA_SERVICE_KEY=your_public_data_service_key
```

약국 위치는 네이버 Mobile Dynamic Map에 마커로 표시됩니다. 네이버 클라우드
Application의 Android 서비스 환경에는 패키지 이름 `com.soomit.patient`을
등록해야 합니다. 지도 SDK는 Client ID만 사용하며 Client Secret은 앱에 넣지
않습니다.

에뮬레이터에서는 약국 화면을 열기 전에 Extended controls에서 테스트 GPS
좌표를 설정합니다.
