from django.urls import path

from .views import (
    CaseChatMessageListAPIView,
    InternalCaseChatAccessAPIView,
    InternalCaseChatMessageCreateAPIView,
)


app_name = "chat"

urlpatterns = [
    path(
        "cases/<uuid:case_id>/messages/",
        CaseChatMessageListAPIView.as_view(),
        name="case-message-list",
    ),
    path(
        "internal/cases/<uuid:case_id>/access/",
        InternalCaseChatAccessAPIView.as_view(),
        name="internal-case-access",
    ),
    path(
        "internal/cases/<uuid:case_id>/messages/",
        InternalCaseChatMessageCreateAPIView.as_view(),
        name="internal-case-message-create",
    ),
]
