from django.contrib import admin

from .models import ImageAnnotation, CaseBookmark

admin.site.register(ImageAnnotation)
admin.site.register(CaseBookmark)