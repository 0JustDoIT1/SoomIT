"""Read-only checks for the existing Compose deployment; no GCS/AI requests."""
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import DatabaseError, connection
from django.db.migrations.executor import MigrationExecutor
from redis import Redis
from redis.exceptions import RedisError


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Command(BaseCommand):
    help = "Check production configuration, database/migrations, Redis and optionally the running Django HTTP service."

    def add_arguments(self, parser):
        parser.add_argument("--http", action="store_true", help="Also require HTTP 200 from the running local Django service.")

    def handle(self, *args, **options):
        if not settings.IS_PRODUCTION or settings.DEBUG:
            raise CommandError("Release deployment requires DJANGO_ENV=production and DEBUG=False.")
        if settings.CORS_ALLOW_ALL_ORIGINS or not settings.CORS_ALLOWED_ORIGINS:
            raise CommandError("Release deployment requires an explicit CORS allowlist.")
        hosts = [host for host in settings.ALLOWED_HOSTS if host and host != "*" and not host.startswith(".")]
        if not hosts or "*" in settings.ALLOWED_HOSTS:
            raise CommandError("Release deployment requires explicit DJANGO_ALLOWED_HOSTS.")
        # Genkit may be disabled, but a supplied endpoint must be a valid service URL.
        if settings.GENKIT_SERVICE_URL:
            url = urlsplit(settings.GENKIT_SERVICE_URL)
            if url.scheme not in {"http", "https"} or not url.netloc or url.username or url.password:
                raise CommandError("GENKIT_SERVICE_URL must be an HTTP(S) service URL without credentials.")

        connection.settings_dict.setdefault("OPTIONS", {}).setdefault("connect_timeout", 5)
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                if cursor.fetchone() != (1,):
                    raise CommandError("Database readiness query failed.")
            executor = MigrationExecutor(connection)
            if executor.migration_plan(executor.loader.graph.leaf_nodes()):
                raise CommandError("Unapplied database migrations remain.")
        except DatabaseError:
            raise CommandError("Database readiness check failed.") from None

        for name in ("CELERY_BROKER_URL", "CELERY_RESULT_BACKEND"):
            url = getattr(settings, name)
            if urlsplit(url).scheme not in {"redis", "rediss"}:
                raise CommandError(f"{name} must configure the existing Redis service.")
            try:
                client = Redis.from_url(url, socket_connect_timeout=5, socket_timeout=5)
                try:
                    if not client.ping():
                        raise CommandError(f"{name} readiness check failed.")
                finally:
                    client.close()
            except (RedisError, ValueError, OSError):
                raise CommandError(f"{name} readiness check failed.") from None

        if options["http"]:
            request = Request(
                "http://127.0.0.1:8000/django-admin/login/",
                headers={"Host": hosts[0], "X-Forwarded-Proto": "https"},
            )
            try:
                with build_opener(NoRedirect()).open(request, timeout=5) as response:
                    if response.status != 200:
                        raise CommandError("Django readiness requires HTTP 200; redirects are not ready.")
            except (URLError, OSError):
                raise CommandError("Django HTTP readiness check failed.") from None

        self.stdout.write(self.style.SUCCESS("Release readiness checks passed."))
