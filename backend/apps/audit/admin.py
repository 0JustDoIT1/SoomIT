from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("action_type", "target_table", "user", "case", "created_at")
    list_filter = ("action_type", "target_table")
    date_hierarchy = "created_at"