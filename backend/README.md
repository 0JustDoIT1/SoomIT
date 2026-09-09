# 숨잇(SUM-IT) Backend — DB 스키마 v1.6 (58개 테이블, 약물처방 파트 반영)

Django backend는 기존 GCP VM PostgreSQL을 사용합니다. 공통 Redis·Orthanc는 프로젝트 루트의 `infra/docker-compose.yml`에서 관리합니다. PostgreSQL은 Compose 관리 대상이 아닙니다.

## 구조

```
backend/
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

### 1. 기존 DB 및 공통 Orthanc 연결

프로젝트 루트에서 시작합니다. 기존 `backend/.env`가 있으면 덮어쓰지 말고 연결 값을 확인합니다.

```bash
cp -n backend/.env.example backend/.env
cd backend
```

### 2. Python 가상환경 + 패키지 설치

```bash
python -m venv .venv
source .venv/bin/activate   # Windows(WSL)면 동일, PowerShell이면 .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. 연결 설정 확인

`config/settings.py`가 `backend/.env`를 읽습니다. `POSTGRES_*`는 기존 VM DB 연결 값을 유지하고, `ORTHANC_BASE_URL`은 VM에서 접근 가능한 주소 또는 SSH 터널 주소로 지정합니다. Orthanc 사용자·비밀번호는 VM의 `infra/.env`와 일치시킵니다. 공통 인프라 전환을 위해 DB 초기화나 migration을 실행하지 않습니다.

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
- 위 Django 검증 내역은 과거 기록입니다. 공통 인프라 변경에서는 기존 VM PostgreSQL에 대한 migration을 수행하지 않습니다.

## 공통 VM 인프라 운영

프로젝트 루트의 `infra/docker-compose.yml`이 유일한 Compose입니다. Redis·Orthanc와 Celery Worker·Beat 정의를 포함합니다. 현재는 코드 구성과 정적 검증 단계이며, 아래 실행 명령은 향후 VM 배포 단계에서 사용합니다.

```bash
# VM의 프로젝트 루트에서 실행. 기존 .env를 덮어쓰지 않습니다.
cp -n infra/.env.example infra/.env
# infra/.env에 실제 VM DB 주소와 인증정보를 설정한 후:
# Worker/Beat의 환경변수는 infra/.env에서 명시적으로 전달합니다.
docker compose --env-file infra/.env -f infra/docker-compose.yml config --quiet
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --build
docker compose --env-file infra/.env -f infra/docker-compose.yml ps
```

배포 전에 기존 컨테이너의 6379·8042·4242 포트 점유를 확인합니다. 기존 VM 컨테이너·volume 정리는 별도 배포 작업이며, PostgreSQL과 그 저장소는 유지합니다. Compose 파일 삭제는 실행 중인 기존 컨테이너를 정리하지 않습니다.

코드 검증만 하려면 프로젝트 루트에서 `docker compose --env-file infra/.env.example -f infra/docker-compose.yml config`를 사용합니다. 실제 비밀번호가 들어 있는 환경에서는 config 전체 출력을 공유하지 말고 `config --quiet`를 사용합니다.

### 네트워크와 접근

- Redis는 `127.0.0.1:6379:6379`로 게시합니다. VM host process는 `redis://127.0.0.1:6379/0`, 같은 Docker network의 향후 Worker는 `redis://redis:6379/0`으로 접근합니다. 별도 Redis 인증은 현재 설정하지 않았으며 신뢰하는 VM process와 Docker network만 접근하도록 합니다.
- Docker 기본 network는 `soomit-infra_default`입니다. 향후 같은 Compose의 Worker·Beat가 사용할 수 있습니다. 다른 network의 컨테이너는 자동 연결되지 않습니다.
- Orthanc HTTP 8042는 REST·DICOMweb·WSI API와 웹 접근용입니다. Basic 인증이 필수이며 기본 바인딩은 loopback입니다.
- DICOM 4242는 DICOM 송신 시스템의 전송용입니다. HTTP 사용자 인증은 DICOM 포트를 보호하지 않습니다. 기본은 loopback이며 실제 외부 송신이 필요할 때만 별도로 개방합니다.
- 팀원 접근은 SSH 터널을 우선합니다. 예: `ssh -N -L 8042:127.0.0.1:8042 USER@VM_HOST`. 로컬 backend의 `ORTHANC_BASE_URL=http://127.0.0.1:8042`로 접속하고 VM Orthanc 인증정보를 사용합니다. 로컬 8042가 사용 중이면 터널의 로컬 포트와 backend URL을 함께 바꿉니다.
- Redis가 로컬에서 필요하면 같은 방식으로 `ssh -N -L 6379:127.0.0.1:6379 USER@VM_HOST`를 사용할 수 있습니다. VPN·특정 IP 방화벽 허용을 통한 직접 연결은 별도 네트워크 설계 대상입니다. 방화벽 허용만으로 loopback 바인딩에 원격 접속할 수는 없습니다.
- Orthanc 직접 연결이 필요하면 `ORTHANC_HTTP_BIND_ADDRESS` 또는 `ORTHANC_DICOM_BIND_ADDRESS`를 해당 VM 인터페이스 주소로 변경하고, 해당 포트에 필요한 송신 IP만 GCP 방화벽에서 허용합니다. Basic 인증을 평문 인터넷 HTTP로 사용하지 않도록 현재 단계에서는 SSH 터널·VPN을 사용합니다. 방화벽·Nginx·TLS 설정은 이번 구성에 포함하지 않습니다.

### 환경변수와 데이터

`infra/.env`는 VM Docker 실행용이고 `backend/.env`는 로컬 Django 개발용입니다. 루트 `.gitignore`가 실제 `.env`를 제외하며 `.env.example`만 커밋합니다.

`ORTHANC_USERNAME`, `ORTHANC_PASSWORD`, `ORTHANC_PUBLIC_URL`은 infra에서 필수입니다. `ORTHANC_PUBLIC_URL`은 WSI 공개 URL이며 실제 접근 경로에 맞추고 마지막 `/`를 포함합니다. `ORTHANC_BASE_URL`과 `ORTHANC_TIMEOUT_SECONDS`는 backend client 설정으로 유지합니다. JSON 안에 치환되는 infra 값에는 따옴표·역슬래시·줄바꿈을 넣지 않습니다. 긴 무작위 hex 비밀번호를 사용하면 JSON 및 dotenv 이스케이프 문제를 피할 수 있습니다.

새 저장소는 `soomit_infra_orthanc_storage`와 `soomit_infra_redis_data`입니다. 기존 Orthanc volume은 재사용하지 않습니다. Redis는 `/data` volume과 이미지 기본 persistence 동작을 사용하며 AOF 등 별도 정책은 아직 추가하지 않았습니다. 새 Orthanc에는 CT·WSI를 추후 다시 등록해야 하며, 기존 DB의 Orthanc ID가 새 서버에서도 유효하다고 가정하지 않습니다. 재등록 후 ID 연결은 별도 작업이고 이번 구성은 DB를 수정하지 않습니다.

### 배포 환경변수 확정

| 구분 | 변수 | 정책 |
|---|---|---|
| 필수 | `POSTGRES_HOST`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | 기존 VM DB의 실제 연결 값 |
| 필수 | `DJANGO_SECRET_KEY` | 개발용 기본값 대신 운영용 secret |
| 필수 | `ORTHANC_USERNAME`, `ORTHANC_PASSWORD` | 배포용 인증정보 |
| 필수 | `ORTHANC_PUBLIC_URL` | 현재 Compose가 필수로 요구. VM 내부 단계에서는 `http://127.0.0.1:8042/` 가능 |
| 선택 | `POSTGRES_PORT` | 기본 `5432` |
| 선택 | `ORTHANC_TIMEOUT_SECONDS` | 기본 `30` |
| 선택 | `ORTHANC_HTTP_BIND_ADDRESS`, `ORTHANC_DICOM_BIND_ADDRESS` | 기본 `127.0.0.1` |

예시 파일의 `example-*`, `change-in-deployment`, `YOUR_VM_INTERNAL_DB_ADDRESS`, `example.invalid`는 placeholder입니다. Compose config 성공은 문법·치환 확인이며, placeholder가 실제 배포에 적합하다는 의미가 아닙니다.

아래는 VM `infra/.env`의 구조 설명용 예시입니다. 실제 secret은 commit하지 않으며, 이 문서 작업에서 환경 파일을 생성하지 않습니다.

```dotenv
POSTGRES_HOST=YOUR_VM_INTERNAL_DB_ADDRESS
POSTGRES_PORT=5432
POSTGRES_DB=example-db
POSTGRES_USER=example-db-user
POSTGRES_PASSWORD=change-in-deployment
DJANGO_SECRET_KEY=change-in-deployment
ORTHANC_USERNAME=example-orthanc-user
ORTHANC_PASSWORD=change-in-deployment
ORTHANC_TIMEOUT_SECONDS=30
ORTHANC_PUBLIC_URL=http://127.0.0.1:8042/
ORTHANC_HTTP_BIND_ADDRESS=127.0.0.1
ORTHANC_DICOM_BIND_ADDRESS=127.0.0.1
```

Orthanc 주소의 역할은 서로 다릅니다.

- `ORTHANC_BASE_URL`: Django/Worker가 REST 요청을 보낼 주소. VM host Django는 loopback, Worker는 `http://orthanc:8042`를 사용합니다.
- `ORTHANC_PUBLIC_URL`: WSI/IIIF 등의 공개 URL 기준. VM 내부 개발에서는 loopback을 사용할 수 있고, 향후 프록시 경로와 연동해 `https://example.invalid/orthanc/` 같은 외부 URL로 바꿀 수 있습니다. URL 변경만으로 포트가 개방되거나 프록시가 설정되지는 않습니다.
- `ORTHANC_HTTP_BIND_ADDRESS` / `ORTHANC_DICOM_BIND_ADDRESS`: Docker가 VM의 어느 인터페이스에 포트를 게시할지 결정합니다. 현재 loopback을 유지하며 외부 접근은 방화벽·Nginx·PACS 연동 단계에서 별도로 결정합니다.

배포 전 및 첫 실행 체크리스트입니다. 아래 실행·연결 검증은 아직 수행하지 않았습니다.

- [ ] 기존 PostgreSQL 위치와 수신 주소·포트 확인
- [ ] 컨테이너에서 접근 가능한 DB 주소·접근 권한 확인
- [ ] 기존 PostgreSQL 계정·비밀번호 확인
- [ ] VM `infra/.env` 생성 및 모든 placeholder 교체
- [ ] 운영용 Django secret 및 Orthanc 인증정보 설정
- [ ] Redis/Orthanc 포트·컨테이너 이름 충돌 확인
- [ ] 실제 환경 파일로 `docker compose config --quiet` 검증
- [ ] backend 이미지 build
- [ ] 서비스 실행 및 Redis·Orthanc health 확인
- [ ] Celery health task 큐 왕복 확인

### Celery 환경변수 전달

환경변수 원본의 역할은 다음과 같습니다.

- `backend/.env`: 로컬 Django 개발용. 기존 DB와 필요 시 SSH 터널을 사용합니다.
- `infra/.env`: VM Docker 서비스용. DB·인증·바인딩 값을 보관합니다.
- GitHub Repository/Environment Secrets: 향후 배포에서 VM의 `infra/.env`를 생성·주입할 원본입니다. workflow 및 실제 Secrets 등록은 아직 하지 않습니다.

Secrets 후보는 `POSTGRES_PASSWORD`, `DJANGO_SECRET_KEY`, `ORTHANC_PASSWORD`입니다. Variables 후보는 `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `ORTHANC_USERNAME`, `ORTHANC_PUBLIC_URL`, `ORTHANC_TIMEOUT_SECONDS`와 HTTP·DICOM 바인딩 주소입니다. 사용자명은 조직 정책에 따라 Secrets로 관리할 수 있습니다. 향후 흐름은 Secrets/Variables → VM `infra/.env` 생성 → Compose 검증 → 실행입니다. 생성 과정에서 비밀값을 로그에 출력하지 않습니다.

Worker와 Beat의 공통 environment는 `POSTGRES_*`, `DJANGO_SECRET_KEY`, Celery URL 두 개입니다. Worker만 Orthanc URL·사용자·비밀번호·timeout을 추가로 받습니다. Django settings import 자체는 기본 secret으로도 가능하지만 VM에서 개발용 기본값을 사용하지 않도록 Compose는 `DJANGO_SECRET_KEY`를 필수로 요구합니다. 현재 task에는 웹 인증·AI 설정이 필요하지 않아 추가 전달하지 않습니다.

`--env-file`의 모든 항목이 자동으로 컨테이너에 들어가는 것은 아닙니다. `${VARIABLE}` 치환 후 `environment`에 선언한 항목만 전달됩니다. 같은 이름의 shell 환경변수는 `--env-file` 값보다 우선하므로 배포 shell에 오래된 값이 남지 않았는지 확인합니다. 고정된 Redis·Orthanc 내부 URL은 이 치환 대상이 아닙니다. [Docker Compose 환경변수 문서](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)

환경 예시의 DB 호스트는 `YOUR_VM_INTERNAL_DB_ADDRESS` placeholder이며 settings 기본값은 `localhost`입니다. Django host process와 Celery container가 반드시 같은 `POSTGRES_HOST`를 쓸 필요는 없습니다. VM의 `infra/.env`에는 기존 PostgreSQL의 **컨테이너에서 접근 가능한 실제 주소**를 넣어야 합니다. 배포 시 VM 내부 IP 또는 host gateway 경로를 확인한 뒤 확정합니다. 현재 Compose에는 host gateway 매핑이 없으므로 해당 방식을 선택하면 별도 매핑이 필요합니다. `127.0.0.1`·`localhost`는 Celery 컨테이너 자신이므로 VM DB 주소로 사용하지 않습니다. 실제 DB 연결 검증과 네트워크·DB 접근 권한 확인은 배포 단계에서 수행합니다.

Celery application은 `config/celery.py`, 부작용 없는 확인용 task는 `apps/common/tasks.py`의 `celery_health_check`입니다. task는 `"ok"`만 반환하며 DB·AI·Orthanc·파일에 접근하지 않습니다. `config/__init__.py`가 application을 로드하므로 기존 backend 환경에서도 갱신된 requirements 설치가 필요합니다.

Worker·Beat는 `backend/Dockerfile`로 만든 동일한 `soomit-backend:local` 이미지를 사용합니다. Python 3.12 기반으로 dependencies와 소스를 포함하고 일반 사용자로 실행합니다. `.dockerignore`는 실제 환경 파일과 로컬 가상환경을 이미지에서 제외합니다. 기본 CMD는 개발용 Django 실행이며 Gunicorn/Nginx production 배포는 포함하지 않습니다.

Compose는 `--env-file infra/.env`를 치환 입력으로 사용하고 각 서비스의 `environment`에 명시한 값만 컨테이너에 전달합니다. 로컬 Django 환경 파일 전체를 읽거나 mount하지 않습니다. 실제 환경 파일은 Git과 이미지에 포함하지 않습니다.

| 설정 | 로컬 Django / VM host process | Compose Worker / Beat |
|---|---|---|
| Broker | `redis://127.0.0.1:6379/0` | `redis://redis:6379/0` |
| Result backend | `redis://127.0.0.1:6379/1` | `redis://redis:6379/1` |
| Orthanc | `http://127.0.0.1:8042` (로컬 또는 SSH 터널) | Worker: `http://orthanc:8042`, Beat: 미사용 |
| PostgreSQL | 로컬 환경의 기존 `POSTGRES_*` | infra 환경의 명시적 `POSTGRES_*` |

Compose가 Redis·Orthanc 내부 URL을 고정합니다. Worker의 Orthanc 인증정보는 서버와 동일한 infra 환경변수에서, `ORTHANC_TIMEOUT_SECONDS`는 infra 값(기본 30)에서 전달됩니다. Beat는 현재 Orthanc를 사용하지 않으므로 Orthanc 인증정보를 받지 않습니다. PostgreSQL의 `localhost`는 컨테이너 자신을 의미하므로 기존 VM DB의 컨테이너에서 접근 가능한 주소·권한은 배포 전에 확인해야 합니다. 이번 구성은 PostgreSQL 설정이나 DB를 변경하지 않습니다.

두 프로세스는 Redis healthcheck 통과 후 시작하며 `unless-stopped`를 사용합니다. JSON 직렬화만 허용하고 timezone은 Django `TIME_ZONE`과 같습니다. Beat는 한 인스턴스만 운영하며 기본 파일 scheduler의 상태를 `soomit_infra_celery_beat_data` volume에 저장합니다. 사용자 periodic task와 `django-celery-beat`·`django-celery-results`는 추가하지 않았습니다.

현재 검증 범위는 Django check, Celery import·task 자동 탐색, Compose config입니다. VM 접속, 이미지 build, Worker·Beat 실행, Redis·Orthanc 연결 검증은 아직 하지 않았습니다. 실제 배포 전에 이미지 build, VM 포트·접속 조건, 실제 환경변수 준비 및 health task의 큐 왕복 검증이 필요합니다.

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
