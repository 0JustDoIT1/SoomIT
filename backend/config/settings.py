import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-change-me")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",")

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

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

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
PDL1_FEATURE_MAX_UPLOAD_BYTES = int(
    os.environ.get("PDL1_FEATURE_MAX_UPLOAD_BYTES", str(64 * 1024 * 1024)),
)

ORTHANC_BASE_URL = os.environ[
    "ORTHANC_BASE_URL"
].rstrip("/")
ORTHANC_USERNAME = os.environ.get("ORTHANC_USERNAME", "orthanc")
ORTHANC_PASSWORD = os.environ.get("ORTHANC_PASSWORD", "change-me")
ORTHANC_TIMEOUT_SECONDS = float(os.environ.get("ORTHANC_TIMEOUT_SECONDS", "30"))

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

#CORS_ALLOWED_ORIGINS = [
#    "http://localhost:3000",
#]
# Flutter Web 로컬 개발용
CORS_ALLOW_ALL_ORIGINS = True
