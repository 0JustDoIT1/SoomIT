from django.urls import path

from .views import RadiologyWorklistAPIView


app_name = "radiology"

urlpatterns = [
    path("worklist/", RadiologyWorklistAPIView.as_view(), name="worklist"),
]
