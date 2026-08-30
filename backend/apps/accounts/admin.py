from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Hospital, Department, DepartmentRole, User, DoctorProfile, HospitalAdmin, SystemAdmin


@admin.register(Hospital)
class HospitalAdminView(admin.ModelAdmin):
    list_display = ("name", "code", "phone", "created_at")
    search_fields = ("name", "code")


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "hospital")
    list_filter = ("hospital",)
    search_fields = ("name", "code")


@admin.register(DepartmentRole)
class DepartmentRoleAdmin(admin.ModelAdmin):
    list_display = ("display_name", "role", "department")
    list_filter = ("role", "department__hospital")


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    model = User
    list_display = ("login_id", "name", "account_status", "department_role", "is_staff")
    list_filter = ("account_status", "is_staff")
    search_fields = ("login_id", "name")
    ordering = ("login_id",)
    fieldsets = (
        (None, {"fields": ("login_id", "password")}),
        ("개인정보", {"fields": ("name",)}),
        ("역할/상태", {"fields": ("department_role", "account_status")}),
        ("권한", {"fields": ("is_staff", "is_active", "is_superuser", "groups", "user_permissions")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("login_id", "name", "password1", "password2")}),
    )


@admin.register(DoctorProfile)
class DoctorProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "license_number", "gender")
    search_fields = ("license_number", "user__name")


@admin.register(HospitalAdmin)
class HospitalAdminAdmin(admin.ModelAdmin):
    list_display = ("user", "hospital")


@admin.register(SystemAdmin)
class SystemAdminAdmin(admin.ModelAdmin):
    list_display = ("user",)