from django.contrib import admin

from .models import DoctorSchedule


@admin.register(DoctorSchedule)
class DoctorScheduleAdmin(admin.ModelAdmin):
    list_display = ("doctor", "schedule_type", "start_at", "end_at")
    list_filter = ("schedule_type",)