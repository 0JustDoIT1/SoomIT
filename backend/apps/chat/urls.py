from django.urls import path

from .views import (
    CaseChatRecipientListAPIView,
    CaseChatMessageReadAPIView,
    CaseChatUnreadCountAPIView,
    CaseChatMessageListAPIView,
    InternalCaseChatAccessAPIView,
    InternalCaseChatMessageCreateAPIView,
)


app_name = "chat"

urlpatterns = [
    path(
        "cases/<uuid:case_id>/recipients/",
        CaseChatRecipientListAPIView.as_view(),
        name="case-chat-recipient-list",
    ),
    path(
        "cases/<uuid:case_id>/messages/",
        CaseChatMessageListAPIView.as_view(),
        name="case-message-list",
    ),
    path(
        "cases/<uuid:case_id>/messages/read/",
        CaseChatMessageReadAPIView.as_view(),
        name="case-message-read",
    ),
    path(
        "cases/<uuid:case_id>/messages/unread-count/",
        CaseChatUnreadCountAPIView.as_view(),
        name="case-message-unread-count",
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
