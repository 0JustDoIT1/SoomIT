import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("config")
# Beat reads logging and scheduler settings while its CLI is still starting.
# Load Django's Celery configuration eagerly so Celery's built-in defaults are
# present before those options are evaluated.
app.config_from_object("django.conf:settings", namespace="CELERY", force=True)
app.autodiscover_tasks()
