import secrets

from django.conf import settings
from rest_framework.permissions import BasePermission


class IsAIService(BasePermission):
    """Allow calls from the trusted Genkit service only."""

    message = "AI service authentication failed."

    def has_permission(self, request, view):
        expected = settings.AI_SERVICE_TOKEN
        authorization = request.headers.get("Authorization", "")

        if not expected or not authorization.startswith("Bearer "):
            return False

        supplied = authorization.removeprefix("Bearer ").strip()
        return bool(supplied) and secrets.compare_digest(supplied, expected)
