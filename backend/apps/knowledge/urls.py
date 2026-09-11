from django.urls import path

from .views import AskKnowledgeAPIView

app_name = "knowledge"

urlpatterns = [
    path("ask/", AskKnowledgeAPIView.as_view(), name="ask"),
]
