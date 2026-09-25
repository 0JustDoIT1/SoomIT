import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/appointment/models/appointment_availability.dart';

void main() {
  test('a five-person slot stays selectable until its capacity is exhausted', () {
    for (var bookedCount = 0; bookedCount <= 5; bookedCount += 1) {
      final slot = AppointmentAvailabilitySlot.fromJson({
        'start_at': '2026-09-21T09:00:00+09:00',
        'capacity': 5,
        'booked_count': bookedCount,
        'remaining_count': 5 - bookedCount,
      });

      expect(slot.capacity, 5);
      expect(slot.bookedCount, bookedCount);
      expect(slot.remainingCount, 5 - bookedCount);
      expect(slot.isAvailable, bookedCount < 5);
      expect(slot.isFull, bookedCount == 5);
    }
  });

  test('date slots expose only entries with remaining capacity as selectable', () {
    final date = AppointmentAvailabilityDate.fromJson({
      'date': '2026-09-21',
      'slots': [
        {
          'start_at': '2026-09-21T09:00:00+09:00',
          'capacity': 5,
          'booked_count': 4,
          'remaining_count': 1,
        },
        {
          'start_at': '2026-09-21T09:30:00+09:00',
          'capacity': 5,
          'booked_count': 5,
          'remaining_count': 0,
        },
      ],
    });

    expect(date.allSlots, hasLength(2));
    expect(date.slots, hasLength(1));
    expect(date.slots.single.hour, 9);
  });
}
