from django.urls import path

from .views import (
    CaseChatRecipientListAPIView,
    CaseChatMessageReadAPIView,
    CaseChatUnreadCountAPIView,
    CaseChatMessageListAPIView,
    InternalCaseChatAccessAPIView,
    InternalCaseChatMessageCreateAPIView,
    GlobalChatMessageListAPIView, GlobalChatMessageReadAPIView, GlobalChatUnreadCountAPIView,
    GlobalChatParticipantsAPIView, InternalGlobalChatAccessAPIView, InternalGlobalChatMessageCreateAPIView,
)


app_name = "chat"

urlpatterns = [
    path("global/messages/", GlobalChatMessageListAPIView.as_view(), name="global-message-list"),
    path("global/messages/read/", GlobalChatMessageReadAPIView.as_view(), name="global-message-read"),
    path("global/messages/unread-count/", GlobalChatUnreadCountAPIView.as_view(), name="global-message-unread-count"),
    path("global/participants/", GlobalChatParticipantsAPIView.as_view(), name="global-participants"),
    path("internal/global/access/", InternalGlobalChatAccessAPIView.as_view(), name="internal-global-access"),
    path("internal/global/messages/", InternalGlobalChatMessageCreateAPIView.as_view(), name="internal-global-message-create"),
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
