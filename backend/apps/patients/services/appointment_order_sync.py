from apps.cases.models import ExaminationOrder

from ..models import Appointment


ACTIVE_APPOINTMENT_STATUSES = [
    Appointment.AppointmentStatus.REQUESTED,
    Appointment.AppointmentStatus.CONFIRMED,
]


def mark_linked_order_scheduled(appointment):
    """Move an ordered examination into scheduled when its booking is confirmed."""
    if appointment.examination_order_id is None:
        return

    ExaminationOrder.objects.filter(
        id=appointment.examination_order_id,
        status=ExaminationOrder.Status.ORDERED,
    ).update(status=ExaminationOrder.Status.SCHEDULED)


def release_linked_order_if_unused(appointment):
    """Return a scheduled order to ordered after its last active booking is removed."""
    if appointment.examination_order_id is None:
        return

    has_another_booking = Appointment.objects.filter(
        examination_order_id=appointment.examination_order_id,
        appointment_status__in=ACTIVE_APPOINTMENT_STATUSES,
    ).exclude(id=appointment.id).exists()
    if has_another_booking:
        return

    ExaminationOrder.objects.filter(
        id=appointment.examination_order_id,
        status=ExaminationOrder.Status.SCHEDULED,
    ).update(status=ExaminationOrder.Status.ORDERED)
