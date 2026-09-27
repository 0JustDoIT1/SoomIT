from contextlib import ExitStack
from io import StringIO
from unittest.mock import patch
from urllib.error import HTTPError

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import OperationalError
from django.test import TestCase, override_settings
from redis.exceptions import ConnectionError as RedisConnectionError


MODULE = "apps.common.management.commands.check_release_readiness."


@override_settings(IS_PRODUCTION=True, DEBUG=False, CORS_ALLOW_ALL_ORIGINS=False, CORS_ALLOWED_ORIGINS=["https://qa.example.test"], ALLOWED_HOSTS=["qa.example.test"], GENKIT_SERVICE_URL="", CELERY_BROKER_URL="redis://127.0.0.1:1/0", CELERY_RESULT_BACKEND="redis://127.0.0.1:1/1")
class ReleaseReadinessTests(TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.redis = self.stack.enter_context(patch(MODULE + "Redis"))
        self.redis.from_url.return_value.ping.return_value = True
        self.opener = self.stack.enter_context(patch(MODULE + "build_opener"))
        self.opener.return_value.open.return_value.__enter__.return_value.status = 200

    def check(self, **options):
        output = StringIO()
        call_command("check_release_readiness", stdout=output, **options)
        return output.getvalue()

    def test_real_test_database_and_migrations_pass(self):
        self.assertIn("passed", self.check())
        self.assertEqual(self.redis.from_url.call_count, 2)
        self.opener.assert_not_called()

    def test_nonproduction_configuration_is_not_ready(self):
        with override_settings(IS_PRODUCTION=False), self.assertRaisesMessage(CommandError, "production"):
            self.check()
        self.redis.assert_not_called()

    def test_missing_hosts_or_permissive_cors_is_not_ready(self):
        for overrides in ({"ALLOWED_HOSTS": ["*"]}, {"CORS_ALLOW_ALL_ORIGINS": True}, {"CORS_ALLOWED_ORIGINS": []}):
            with self.subTest(overrides=overrides), override_settings(**overrides), self.assertRaises(CommandError):
                self.check()

    def test_database_unavailable_is_not_ready_without_leaking_details(self):
        with patch(MODULE + "connection.cursor", side_effect=OperationalError("sensitive connection data")), self.assertRaisesMessage(CommandError, "Database readiness check failed") as error:
            self.check()
        self.assertNotIn("sensitive", str(error.exception))

    def test_pending_migrations_are_not_ready(self):
        with patch(MODULE + "MigrationExecutor") as executor, self.assertRaisesMessage(CommandError, "Unapplied"):
            executor.return_value.migration_plan.return_value = [object()]
            self.check()

    def test_redis_unavailable_is_not_ready(self):
        self.redis.from_url.return_value.ping.side_effect = RedisConnectionError("sensitive Redis URL")
        with self.assertRaisesMessage(CommandError, "CELERY_BROKER_URL readiness check failed") as error:
            self.check()
        self.assertNotIn("sensitive", str(error.exception))
        self.redis.from_url.return_value.close.assert_called_once()

    def test_invalid_optional_genkit_url_is_not_ready(self):
        with override_settings(GENKIT_SERVICE_URL="not-a-url"), self.assertRaisesMessage(CommandError, "GENKIT_SERVICE_URL"):
            self.check()

    def test_http_checks_exact_200_with_proxy_scheme(self):
        self.check(http=True)
        request = self.opener.return_value.open.call_args.args[0]
        self.assertEqual(request.get_header("X-forwarded-proto"), "https")
        self.assertEqual(request.get_header("Host"), "qa.example.test")
        self.assertEqual(request.full_url, "http://127.0.0.1:8000/django-admin/login/")

    def test_http_redirect_and_server_error_are_not_ready(self):
        for status in (301, 302, 503):
            with self.subTest(status=status), self.assertRaises(CommandError):
                self.opener.return_value.open.return_value.__enter__.return_value.status = status
                self.check(http=True)

    def test_real_redirect_handler_refuses_following_redirects(self):
        from apps.common.management.commands.check_release_readiness import NoRedirect
        self.assertIsNone(NoRedirect().redirect_request(None, None, 301, "", {}, "https://qa.example.test"))
        self.opener.return_value.open.side_effect = HTTPError("http://localhost", 301, "Redirect", {}, None)
        with self.assertRaisesMessage(CommandError, "HTTP readiness"):
            self.check(http=True)
