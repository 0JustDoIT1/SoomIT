from celery import shared_task


@shared_task
def celery_health_check():
    """Return a simple result without accessing external services."""
    return "ok"
