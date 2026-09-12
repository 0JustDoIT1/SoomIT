from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/system-admin/", include("apps.accounts.system_admin_urls")),
    path("api/hospital-admin/", include("apps.accounts.hospital_admin_urls")),
    path("api/patients/", include("apps.patients.urls")),
    path("api/patient/", include("apps.patients.chat_urls")),
    path("api/pathology/", include("apps.pathology.urls")),
    path("api/radiology/", include("apps.radiology.urls")),
    path("api/cases/", include("apps.cases.urls")),
    path("api/appointments/",include("apps.patients.appointment_urls")),
    path("api/clinical/",include("apps.clinical.urls"),),
    path("api/doctor/cases/", include("apps.cases.doctor_urls")),
    path("api/knowledge/", include("apps.knowledge.urls")),
    path("api/ai/", include("apps.knowledge.ai_urls")),
]
