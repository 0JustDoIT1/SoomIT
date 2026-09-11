from django.urls import path

from .chat_views import PatientChatAPIView


app_name = "patient-chat"

urlpatterns = [
    path("chat/", PatientChatAPIView.as_view(), name="chat"),
]
