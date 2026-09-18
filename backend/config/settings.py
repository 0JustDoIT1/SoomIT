import os
from datetime import timedelta
from pathlib import Path

from celery.schedules import crontab

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-change-me")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",")

# Set by infra/docker-compose.yml at deploy time to the same commit SHA
# already used as this deploy's Docker image tag - read by the system-admin
# monitoring dashboard, not a new version-tracking system.
GIT_COMMIT_SHA = os.environ.get("GIT_COMMIT_SHA", "local")
DEPLOYED_AT = os.environ.get("DEPLOYED_AT", "") or None
FRONTEND_INTERNAL_URL = os.environ.get("FRONTEND_INTERNAL_URL", "").rstrip("/")
REALTIME_INTERNAL_URL = os.environ.get("REALTIME_INTERNAL_URL", "").rstrip("/")
# Firebase 인증 파일 경로
# 상대경로는 Backend 폴더(BASE_DIR)를 기준으로 해석합니다.
FIREBASE_CREDENTIALS_PATH = (
    BASE_DIR
    / os.environ.get(
        "FIREBASE_CREDENTIALS_PATH",
        "soomit-patient-firebase-admin.json",
    )
).resolve()

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",  # ArrayField 등 Postgres 전용 필드용
    "drf_spectacular",
    # 숨잇 도메인 앱 (v1.5 스키마 51개 테이블, 카테고리 순서대로)
    "apps.common",
    "apps.accounts",
    "apps.patients",
    "apps.cases",
    "apps.pathology",
    "apps.radiology",
    "apps.ai_results",
    "apps.clinical",
    "apps.scheduling",
    "apps.annotations",
    "apps.notifications",
    "apps.audit",
    "apps.knowledge",
    "apps.chat",
    "rest_framework",
    "corsheaders",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Existing VM PostgreSQL connection
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "sumit"),
        "USER": os.environ.get("POSTGRES_USER", "sumit"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "sumit_local_pw"),
        "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
    }
}

# ── 커스텀 User 모델 ─────────────────────────────────────────────
AUTH_USER_MODEL = "accounts.User"

LANGUAGE_CODE = "ko-kr"
TIME_ZONE = "Asia/Seoul"
USE_I18N = True
USE_TZ = True

CELERY_BROKER_URL = os.environ["CELERY_BROKER_URL"]
CELERY_RESULT_BACKEND = os.environ["CELERY_RESULT_BACKEND"]
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_BEAT_SCHEDULER = "celery.beat:PersistentScheduler"
CELERY_BEAT_SCHEDULE = {
    "send-medication-reminders-every-minute": {
        "task": (
            "apps.notifications.tasks."
            "send_due_medication_reminders"
        ),
        "schedule": 60.0,
    },
    "send-examination-reminders-daily": {
        "task": (
            "apps.notifications.tasks."
            "send_upcoming_examination_reminders"
        ),
        "schedule": crontab(
            hour=9,
            minute=0,
        ),
    },
}

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

# Staff (radiology/pathology/etc.) JWT via rest_framework_simplejwt. The default
# 5-minute access token lifetime is too short for large CT series uploads, which
# can take several minutes to fully transfer before the server validates auth.
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
}

# ── 환자앱 소셜 로그인/JWT ───────────────────────────────────────
PATIENT_JWT_SIGNING_KEY = os.environ.get(
    "PATIENT_JWT_SIGNING_KEY",
    "",
)
PATIENT_JWT_ALGORITHM = "HS256"
PATIENT_JWT_ISSUER = "soom-it-patient-api"
PATIENT_JWT_AUDIENCE = "soom-it-patient-app"

PATIENT_ACCESS_TOKEN_MINUTES = int(
    os.environ.get(
        "PATIENT_ACCESS_TOKEN_MINUTES",
        "15",
    )
)
PATIENT_REFRESH_TOKEN_DAYS = int(
    os.environ.get(
        "PATIENT_REFRESH_TOKEN_DAYS",
        "14",
    )
)

PATIENT_GOOGLE_CLIENT_ID = os.environ.get(
    "PATIENT_GOOGLE_CLIENT_ID",
    "",
)

SPECTACULAR_SETTINGS = {
    'TITLE': 'Soom-it API',
    'VERSION': '1.6.0',
}

PDL1_INFERENCE_SERVICE_URL = os.environ[
    "PDL1_INFERENCE_SERVICE_URL"
].rstrip("/")
PDL1_INFERENCE_TIMEOUT_SECONDS = float(
    os.environ.get("PDL1_INFERENCE_TIMEOUT_SECONDS", "60"),
)
PDL1_INFERENCE_SERVICE_USE_ID_TOKEN = (
    os.environ.get("PDL1_INFERENCE_SERVICE_USE_ID_TOKEN", "0") == "1"
)
PDL1_ANNOTATION_MAX_UPLOAD_BYTES = int(
    os.environ.get("PDL1_ANNOTATION_MAX_UPLOAD_BYTES", str(8 * 1024 * 1024)),
)
PDL1_GCS_BUCKET = os.environ.get("PDL1_GCS_BUCKET", "")
PATHOLOGY_GCS_BUCKET = os.environ.get("PATHOLOGY_GCS_BUCKET", "")

# X-ray Cloud Run inference is optional until the service is configured.
XRAY_SERVICE_URL = os.environ.get("XRAY_SERVICE_URL", "").rstrip("/")
XRAY_SERVICE_TIMEOUT_SECONDS = float(
    os.environ.get("XRAY_SERVICE_TIMEOUT_SECONDS", "300"),
)
XRAY_SERVICE_USE_ID_TOKEN = os.environ.get("XRAY_SERVICE_USE_ID_TOKEN", "0") == "1"
XRAY_GCS_BUCKET = os.environ.get("XRAY_GCS_BUCKET", "")

DOCTOR_PROFILE_GCS_BUCKET = os.environ.get("DOCTOR_PROFILE_GCS_BUCKET", "")
DOCTOR_PROFILE_IMAGE_MAX_UPLOAD_BYTES = int(
    os.environ.get("DOCTOR_PROFILE_IMAGE_MAX_UPLOAD_BYTES", str(8 * 1024 * 1024)),
)

CT_ANALYSIS_PHASE1_SERVICE_URL = os.environ.get(
    "CT_ANALYSIS_PHASE1_SERVICE_URL", ""
).rstrip("/")
CT_ANALYSIS_PHASE1_TIMEOUT_SECONDS = float(
    os.environ.get("CT_ANALYSIS_PHASE1_TIMEOUT_SECONDS", "3600")
)
CT_ANALYSIS_PHASE1_SERVICE_USE_ID_TOKEN = (
    os.environ.get("CT_ANALYSIS_PHASE1_SERVICE_USE_ID_TOKEN", "0") == "1"
)
CT_ANALYSIS_OUTPUT_GCS_PREFIX = os.environ.get(
    "CT_ANALYSIS_OUTPUT_GCS_PREFIX", "gs://soomit-bucket/ct-analysis"
).rstrip("/")
CT_ANALYSIS_PHASE2_SERVICE_URL = os.environ.get(
    "CT_ANALYSIS_PHASE2_SERVICE_URL", ""
).rstrip("/")
CT_ANALYSIS_PHASE2_TIMEOUT_SECONDS = float(
    os.environ.get("CT_ANALYSIS_PHASE2_TIMEOUT_SECONDS", "900")
)
CT_ANALYSIS_PHASE2_SERVICE_USE_ID_TOKEN = (
    os.environ.get("CT_ANALYSIS_PHASE2_SERVICE_USE_ID_TOKEN", "0") == "1"
)

TNM_T_SERVICE_URL = os.environ.get("TNM_T_SERVICE_URL", "").rstrip("/")
TNM_T_SERVICE_TIMEOUT_SECONDS = float(os.environ.get("TNM_T_SERVICE_TIMEOUT_SECONDS", "3600"))
TNM_T_SERVICE_USE_ID_TOKEN = os.environ.get("TNM_T_SERVICE_USE_ID_TOKEN", "0") == "1"
TNM_M_SERVICE_URL = os.environ.get("TNM_M_SERVICE_URL", "").rstrip("/")
TNM_M_SERVICE_TIMEOUT_SECONDS = float(os.environ.get("TNM_M_SERVICE_TIMEOUT_SECONDS", "3600"))
TNM_M_SERVICE_USE_ID_TOKEN = os.environ.get("TNM_M_SERVICE_USE_ID_TOKEN", "0") == "1"
TNM_OUTPUT_GCS_PREFIX = os.environ.get(
    "TNM_OUTPUT_GCS_PREFIX", "gs://soomit-bucket/tnm"
).rstrip("/")
TNM_SERVICE_URL = os.environ.get("TNM_SERVICE_URL", "").rstrip("/")
TNM_SERVICE_TIMEOUT_SECONDS = float(os.environ.get("TNM_SERVICE_TIMEOUT_SECONDS", "900"))
TNM_SERVICE_USE_ID_TOKEN = os.environ.get("TNM_SERVICE_USE_ID_TOKEN", "0") == "1"

PATHOLOGY_ANALYSIS_SERVICE_URL = os.environ.get(
    "PATHOLOGY_ANALYSIS_SERVICE_URL", ""
).rstrip("/")
PATHOLOGY_ANALYSIS_TIMEOUT_SECONDS = float(
    os.environ.get("PATHOLOGY_ANALYSIS_TIMEOUT_SECONDS", "3600")
)
PATHOLOGY_ANALYSIS_SERVICE_USE_ID_TOKEN = (
    os.environ.get("PATHOLOGY_ANALYSIS_SERVICE_USE_ID_TOKEN", "0") == "1"
)

ORTHANC_BASE_URL = os.environ[
    "ORTHANC_BASE_URL"
].rstrip("/")
ORTHANC_USERNAME = os.environ.get("ORTHANC_USERNAME", "orthanc")
ORTHANC_PASSWORD = os.environ.get("ORTHANC_PASSWORD", "change-me")
ORTHANC_TIMEOUT_SECONDS = float(os.environ.get("ORTHANC_TIMEOUT_SECONDS", "30"))

CT_SERIES_MAX_FILE_COUNT = int(os.environ.get("CT_SERIES_MAX_FILE_COUNT", "4000"))
CT_SERIES_MAX_UPLOAD_BYTES = int(
    os.environ.get("CT_SERIES_MAX_UPLOAD_BYTES", str(2 * 1024 * 1024 * 1024)),
)
CT_SERIES_MIN_SLICE_COUNT = int(os.environ.get("CT_SERIES_MIN_SLICE_COUNT", "10"))

# A CT series upload is a single multipart request with hundreds of file fields
# and a large total payload, well above Django's small defaults (2.5MB / 1000 fields /
# 100 files - DATA_UPLOAD_MAX_NUMBER_FILES is a distinct limit from _FIELDS).
DATA_UPLOAD_MAX_MEMORY_SIZE = CT_SERIES_MAX_UPLOAD_BYTES
FILE_UPLOAD_MAX_MEMORY_SIZE = CT_SERIES_MAX_UPLOAD_BYTES
DATA_UPLOAD_MAX_NUMBER_FIELDS = CT_SERIES_MAX_FILE_COUNT + 100
DATA_UPLOAD_MAX_NUMBER_FILES = CT_SERIES_MAX_FILE_COUNT + 100

# ai-services/embedding (intfloat/multilingual-e5-base). Cloud Run 배포판은
# IAM 인증이 필요하므로, 로컬처럼 인증 없는 서비스일 때만 EMBEDDING_SERVICE_USE_ID_TOKEN=0으로 끈다.
EMBEDDING_SERVICE_URL = os.environ[
    "EMBEDDING_SERVICE_URL"
].rstrip("/")
EMBEDDING_SERVICE_TIMEOUT_SECONDS = float(os.environ.get("EMBEDDING_SERVICE_TIMEOUT_SECONDS", "120"))
EMBEDDING_SERVICE_USE_ID_TOKEN = os.environ.get("EMBEDDING_SERVICE_USE_ID_TOKEN", "0") == "1"
EMBEDDING_SERVICE_BATCH_SIZE = 8  # ai-services/embedding의 texts 배열 최대 길이와 일치

# ai-services/medgemma. RAG 검색 결과를 컨텍스트로 넣어 이 서비스에 답변을 요청한다.
MEDGEMMA_SERVICE_URL = os.environ[
    "MEDGEMMA_SERVICE_URL"
].rstrip("/")
MEDGEMMA_SERVICE_TIMEOUT_SECONDS = float(os.environ.get("MEDGEMMA_SERVICE_TIMEOUT_SECONDS", "120"))
MEDGEMMA_SERVICE_USE_ID_TOKEN = os.environ.get("MEDGEMMA_SERVICE_USE_ID_TOKEN", "0") == "1"

# Shared only by Django and trusted AI orchestrators such as Genkit.
AI_SERVICE_TOKEN = os.environ.get("AI_SERVICE_TOKEN", "")

MEDICAL_BACKEND_URL = os.environ.get(
    "MEDICAL_BACKEND_URL",
    "",
).rstrip("/")

MEDICAL_BACKEND_TIMEOUT_SECONDS = float(
    os.environ.get(
        "MEDICAL_BACKEND_TIMEOUT_SECONDS",
        "5",
    )
)

PATIENT_APP_SERVICE_TOKEN = os.environ.get(
    "PATIENT_APP_SERVICE_TOKEN",
    "",
)

# Private Genkit Cloud Run service. Empty until the service is deployed.
GENKIT_SERVICE_URL = os.environ.get("GENKIT_SERVICE_URL", "").rstrip("/")
GENKIT_SERVICE_TIMEOUT_SECONDS = float(
    os.environ.get("GENKIT_SERVICE_TIMEOUT_SECONDS", "300")
)
GENKIT_SERVICE_USE_ID_TOKEN = os.environ.get("GENKIT_SERVICE_USE_ID_TOKEN", "0") == "1"
# Optional: a service account key file used only for minting the genkit-serve
# ID token, for when that Cloud Run service's invoker is a different account
# than GOOGLE_APPLICATION_CREDENTIALS (used for GCS elsewhere in the app).
# Leave unset to fall back to the default application credentials.
GENKIT_SERVICE_ACCOUNT_FILE = os.environ.get("GENKIT_SERVICE_ACCOUNT_FILE", "")

#CORS_ALLOWED_ORIGINS = [
#    "http://localhost:3000",
#]
# Flutter Web 로컬 개발용
CORS_ALLOW_ALL_ORIGINS = True
