import os
from pathlib import Path
import runpy
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase
from django.http import HttpResponse
from django.test import RequestFactory, override_settings
from corsheaders.middleware import CorsMiddleware


class ProductionSecretTests(SimpleTestCase):
    settings_file = Path(__file__).resolve().parents[3] / "config/settings.py"
    dummy_django_key = "test-only-django-key-0123456789-abcdefghijklmnopqrstuvwxyz-ABCDEFG"
    dummy_patient_key = "test-only-patient-key-0123456789-abcdefghijklmnopqrstuvwxyz-ABCDEF"

    def load_settings(self, mode="production", **overrides):
        environment = {
            "DJANGO_ENV": mode,
            "DJANGO_CSRF_TRUSTED_ORIGINS": "https://qa.example.test",
            "CELERY_BROKER_URL": "redis://127.0.0.1:1/0",
            "CELERY_RESULT_BACKEND": "redis://127.0.0.1:1/1",
            "PDL1_INFERENCE_SERVICE_URL": "http://127.0.0.1:1",
            "ORTHANC_BASE_URL": "http://127.0.0.1:1",
            "EMBEDDING_SERVICE_URL": "http://127.0.0.1:1",
            "MEDGEMMA_SERVICE_URL": "http://127.0.0.1:1",
        }
        environment.update(overrides)
        # No local .env or real credentials participate in configuration tests.
        with patch.dict(os.environ, environment, clear=True), patch("dotenv.load_dotenv"):
            return runpy.run_path(str(self.settings_file))

    def test_development_and_test_keep_existing_fallback(self):
        for mode in ("development", "test"):
            with self.subTest(mode=mode):
                self.assertEqual(self.load_settings(mode)["SECRET_KEY"], "dev-only-change-me")

    def test_production_requires_django_secret(self):
        for mode in ("production", "prod"):
            with self.subTest(mode=mode), self.assertRaisesMessage(ImproperlyConfigured, "DJANGO_SECRET_KEY"):
                self.load_settings(mode, PATIENT_JWT_SIGNING_KEY=self.dummy_patient_key)

    def test_production_rejects_blank_and_known_development_keys(self):
        for value in ("", "   ", "dev-only-change-me", "django-insecure-dummy"):
            with self.subTest(value=value), self.assertRaisesMessage(ImproperlyConfigured, "DJANGO_SECRET_KEY"):
                self.load_settings(DJANGO_SECRET_KEY=value, PATIENT_JWT_SIGNING_KEY=self.dummy_patient_key)

    def test_production_requires_separate_patient_signing_key(self):
        with self.assertRaisesMessage(ImproperlyConfigured, "PATIENT_JWT_SIGNING_KEY"):
            self.load_settings(DJANGO_SECRET_KEY=self.dummy_django_key)

    def test_production_rejects_blank_patient_key(self):
        for value in ("", "   "):
            with self.subTest(value=value), self.assertRaisesMessage(ImproperlyConfigured, "PATIENT_JWT_SIGNING_KEY"):
                self.load_settings(DJANGO_SECRET_KEY=self.dummy_django_key, PATIENT_JWT_SIGNING_KEY=value)

    def test_production_configured_keys_and_security_flags(self):
        result = self.load_settings(DJANGO_SECRET_KEY=self.dummy_django_key, PATIENT_JWT_SIGNING_KEY=self.dummy_patient_key, DJANGO_DEBUG="true")
        self.assertEqual(result["SECRET_KEY"], self.dummy_django_key)
        self.assertEqual(result["PATIENT_JWT_SIGNING_KEY"], self.dummy_patient_key)
        self.assertFalse(result["DEBUG"])
        self.assertTrue(result["SECURE_SSL_REDIRECT"])

    def test_error_does_not_echo_rejected_secret(self):
        rejected = "django-insecure-test-sensitive-suffix"
        with self.assertRaises(ImproperlyConfigured) as caught:
            self.load_settings(DJANGO_SECRET_KEY=rejected, PATIENT_JWT_SIGNING_KEY=self.dummy_patient_key)
        self.assertNotIn(rejected, str(caught.exception))

    def production_settings(self, **overrides):
        return self.load_settings(DJANGO_SECRET_KEY=self.dummy_django_key, PATIENT_JWT_SIGNING_KEY=self.dummy_patient_key, **overrides)

    def test_production_cors_reuses_csrf_origins(self):
        result = self.production_settings()
        self.assertFalse(result["CORS_ALLOW_ALL_ORIGINS"])
        self.assertEqual(result["CORS_ALLOWED_ORIGINS"], ["https://qa.example.test"])

    def test_production_cors_accepts_separate_allowlist(self):
        result = self.production_settings(DJANGO_CORS_ALLOWED_ORIGINS="https://staff.example.test, https://web.example.test")
        self.assertEqual(result["CORS_ALLOWED_ORIGINS"], ["https://staff.example.test", "https://web.example.test"])

    def test_production_cors_rejects_missing_or_unsafe_origins(self):
        for origin in ("", "*", "https://*.example.test", "null", "https://staff.example.test/path", "https://user:password@example.test"):
            with self.subTest(origin=origin), self.assertRaises(ImproperlyConfigured):
                self.production_settings(DJANGO_CORS_ALLOWED_ORIGINS=origin)

    def test_development_cors_preserves_local_flexibility(self):
        self.assertTrue(self.load_settings("development")["CORS_ALLOW_ALL_ORIGINS"])

    def test_cors_middleware_only_echoes_configured_origin(self):
        result = self.production_settings()
        with override_settings(CORS_ALLOW_ALL_ORIGINS=result["CORS_ALLOW_ALL_ORIGINS"], CORS_ALLOWED_ORIGINS=result["CORS_ALLOWED_ORIGINS"]):
            middleware = CorsMiddleware(lambda request: HttpResponse("ok"))
            for origin, allowed in (("https://qa.example.test", True), ("https://untrusted.example.test", False), ("null", False)):
                for method in ("get", "options"):
                    with self.subTest(origin=origin, method=method):
                        request = getattr(RequestFactory(), method)("/api/patients/", HTTP_ORIGIN=origin, HTTP_ACCESS_CONTROL_REQUEST_METHOD="PATCH")
                        response = middleware(request)
                        self.assertEqual(response.get("Access-Control-Allow-Origin"), origin if allowed else None)
                        self.assertIsNone(response.get("Access-Control-Allow-Credentials"))
