# 숨잇(SUM-IT) Backend — DB 스키마 v1.6 (58개 테이블, 약물처방 파트 반영)

Django ORM으로 옮긴 v1.5 스키마 + 로컬 개발용 docker-compose.

## 구조

```
sumit-backend/
├─ docker-compose.yml        # Postgres 16 + Redis 7 (로컬 개발용)
├─ .env.example              # 환경변수 예시 (복사해서 .env로 사용)
├─ requirements.txt
├─ manage.py
├─ config/
│  ├─ settings.py            # DB 연결, INSTALLED_APPS
│  ├─ urls.py
│  └─ wsgi.py
└─ apps/
   ├─ common/       # 추상 베이스 모델 (UUID PK, 타임스탬프) — 테이블 없음
   ├─ accounts/     # 1. hospitals~system_admins (7)
   ├─ patients/     # 2. patients~symptom_logs (9)
   ├─ cases/        # 3. lung_cancer_cases~case_image_assets (4)
   ├─ ai_results/   # 4. ai_analyses~treatment_ai_results + model_versions (11)
   ├─ clinical/     # 5~6. clinical_results~case_final_results(12) + 약물처방 6종(Drug/Regimen/RegimenDrug/TreatmentRule/Prescription/PrescriptionItem/SafetyCheckResult) = 19
   ├─ scheduling/   # 7. doctor_schedules (1)
   ├─ annotations/  # 8. image_annotations, case_bookmarks (2)
   ├─ notifications/# 9. 알림 3종 (3)
   └─ audit/        # 10-2. audit_logs (1)
```

총 58개 모델 = 58개 테이블. (`model_versions`은 문서상 10-1이지만 `ai_analyses`가 바로 참조해서 `ai_results` 앱에 같이 뒀습니다.)

## v1.6 변경사항 (약물처방 파트)

- `clinical` 앱에 6개 신규: `Drug`, `Regimen`, `RegimenDrug`, `TreatmentRule`, `PrescriptionItem`, `SafetyCheckResult`
- `clinical.Prescription`: 기존 "약물 1행" 구조 → **Regimen/Cycle 처방 Header**로 전면 개편 (`regimen`, `cycle_number`, `phase`, `cycle_start_date`, `prescription_status`(DRAFT/VALIDATED/FINAL/COMPLETED/CANCELLED) 필드로 교체)
- `patients` 앱에 `MedicationScheduleItem` 신규 — `medication_schedules`(복약 알림, Cycle 단위)와 `prescription_items`(실제 약물)를 연결하는 다대다 중간테이블. IV 등 병원 투여 전용 약물은 여기 연결하지 않음(Service Layer에서 검증, DB 제약 아님)

## 로컬 실행

### 1. DB/Redis 띄우기

```bash
cd sumit-backend
cp .env.example .env
docker compose up -d
```

### 2. Python 가상환경 + 패키지 설치

```bash
python -m venv .venv
source .venv/bin/activate   # Windows(WSL)면 동일, PowerShell이면 .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. 마이그레이션

```bash
# .env를 읽으려면 python-dotenv 사용하거나 export로 환경변수 직접 지정
export $(cat .env | xargs)   # 간단히 쓰는 방법 (프로덕션에선 python-dotenv 권장)

python manage.py makemigrations
python manage.py migrate
```

### 4. 관리자 계정 생성 (선택)

```bash
python manage.py createsuperuser
```

`AUTH_USER_MODEL = accounts.User`라서 `createsuperuser`가 `login_id`/`name`을 물어봅니다.

### 5. 서버 실행

```bash
python manage.py runserver 0.0.0.0:8000
```

## 검증 완료된 것

- `python manage.py check` — 모델 정의/관계 오류 없음
- `python manage.py makemigrations` — 51개 테이블 전체 마이그레이션 그래프 정상 생성 확인 (순환참조는 Django가 자동으로 2단계 마이그레이션으로 분리)
- 실제 Postgres 컨테이너에 대고 `migrate`까지는 **미검증** — `docker compose up -d` 후 로컬에서 직접 확인 필요

## 설계 시 참고한 원칙 (v1.5 스펙 그대로 반영)

- 모든 PK는 UUID (`gen_random_uuid()` 대신 Python `uuid.uuid4` 기본값 — Django가 INSERT 시점에 생성)
- AI 원본결과(`ai_results` 계열)와 의료진 확정결과(`clinical_results` 계열)는 완전히 분리된 1:1 상세테이블 구조
- ENUM은 Postgres 네이티브 ENUM 대신 `CharField + TextChoices`로 구현 (마이그레이션 단순화 목적 — 필요하면 나중에 `django-enumfields` 등으로 교체 가능)
- CHECK 제약조건(0~1, 0~100 범위 등)은 `models.CheckConstraint`로 반영
- 부분 UNIQUE 제약(`WHERE case_status='ACTIVE'` 등)은 `UniqueConstraint(condition=Q(...))`로 반영

## 아직 안 한 것 (다음 단계)

- Django Admin에 모델 등록 (`admin.py`) — 지금은 비어있어서 관리자 페이지에서 아무것도 안 보임
- DRF(Django REST Framework) 붙여서 API 서빙 — 지금은 모델만 있고 API 레이어 없음
- `data_규칙` 섹션의 조건부 로직(예: `decision_type=PROCEED_NEXT_STAGE`면 `target_stage` 필수) — DB 제약조건만으로 표현 안 되는 부분은 Django `clean()`/serializer validation에서 별도 구현 필요
