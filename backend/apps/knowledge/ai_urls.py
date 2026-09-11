from django.urls import path

from .views import AskKnowledgeAIAPIView, SearchKnowledgeAIAPIView

app_name = "ai-knowledge"

urlpatterns = [
    path("knowledge/ask/", AskKnowledgeAIAPIView.as_view(), name="ask"),
    path("knowledge/search/", SearchKnowledgeAIAPIView.as_view(), name="search"),
]
