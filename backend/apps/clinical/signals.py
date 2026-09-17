from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Prescription


@receiver(post_save, sender=Prescription)
def disable_medication_schedules_for_inactive_prescription(sender, instance, **kwargs):
    if instance.prescription_status in {
        Prescription.PrescriptionStatus.CANCELLED,
        Prescription.PrescriptionStatus.COMPLETED,
    }:
        instance.medication_schedules.filter(enabled=True).update(enabled=False)
