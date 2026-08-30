from django.contrib import admin

from .models import PatientNotificationSetting, UserNotificationSetting, NotificationLog


@admin.register(NotificationLog)
class NotificationLogAdmin(admin.ModelAdmin):
    list_display = ("title", "channel", "delivery_status", "recipient_user", "recipient_patient_account", "sent_at")
    list_filter = ("channel", "delivery_status")


admin.site.register(PatientNotificationSetting)
admin.site.register(UserNotificationSetting)