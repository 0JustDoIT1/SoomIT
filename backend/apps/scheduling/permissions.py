import secrets

from django.conf import settings
from rest_framework.permissions import BasePermission


class IsPatientAppService(BasePermission):
    """Authenticate the trusted patient-app backend without exposing doctor writes."""

    message = "Patient app service authentication failed."

    def has_permission(self, request, view):
        expected = settings.PATIENT_APP_SERVICE_TOKEN
        supplied = request.headers.get("X-Service-Token", "")
        return bool(expected and supplied) and secrets.compare_digest(supplied, expected)
