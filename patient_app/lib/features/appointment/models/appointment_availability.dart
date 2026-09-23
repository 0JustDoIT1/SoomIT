class AppointmentAvailabilitySlot {
  final DateTime startAt;
  final int capacity;
  final int bookedCount;
  final int remainingCount;

  const AppointmentAvailabilitySlot({
    required this.startAt,
    required this.capacity,
    required this.bookedCount,
    required this.remainingCount,
  });

  factory AppointmentAvailabilitySlot.fromJson(Map<String, dynamic> json) {
    return AppointmentAvailabilitySlot(
      startAt: DateTime.parse(json['start_at'] as String).toLocal(),
      capacity: json['capacity'] as int? ?? 0,
      bookedCount: json['booked_count'] as int? ?? 0,
      remainingCount: json['remaining_count'] as int? ?? 0,
    );
  }

  bool get isAvailable => remainingCount > 0;

  bool get isFull => remainingCount <= 0;
}

class AppointmentAvailabilityDate {
  final DateTime date;

  /// 서버에서 내려온 전체 진료 슬롯.
  /// 예약 마감된 시간도 포함한다.
  final List<AppointmentAvailabilitySlot> allSlots;

  const AppointmentAvailabilityDate({
    required this.date,
    required this.allSlots,
  });

  factory AppointmentAvailabilityDate.fromJson(Map<String, dynamic> json) {
    final parsedSlots =
        (json['slots'] as List<dynamic>)
            .map(
              (slot) => AppointmentAvailabilitySlot.fromJson(
                slot as Map<String, dynamic>,
              ),
            )
            .toList()
          ..sort((a, b) => a.startAt.compareTo(b.startAt));

    return AppointmentAvailabilityDate(
      date: DateTime.parse(json['date'] as String),
      allSlots: parsedSlots,
    );
  }

  /// 기존 코드 호환용:
  /// 실제 선택 가능한 시간만 반환한다.
  List<DateTime> get slots {
    return allSlots
        .where((slot) => slot.isAvailable)
        .map((slot) => slot.startAt)
        .toList();
  }

  bool get hasSlots => allSlots.isNotEmpty;

  bool get hasAvailableSlots {
    return allSlots.any((slot) => slot.isAvailable);
  }
}

class AppointmentAvailability {
  final String doctorId;
  final int slotMinutes;
  final List<AppointmentAvailabilityDate> dates;

  const AppointmentAvailability({
    required this.doctorId,
    required this.slotMinutes,
    required this.dates,
  });

  factory AppointmentAvailability.fromJson(Map<String, dynamic> json) {
    return AppointmentAvailability(
      doctorId: json['doctor_id'] as String,
      slotMinutes: json['slot_minutes'] as int,
      dates: (json['dates'] as List<dynamic>)
          .map(
            (item) => AppointmentAvailabilityDate.fromJson(
              item as Map<String, dynamic>,
            ),
          )
          .toList(),
    );
  }

  AppointmentAvailabilityDate? findDate(DateTime target) {
    for (final item in dates) {
      if (item.date.year == target.year &&
          item.date.month == target.month &&
          item.date.day == target.day) {
        return item;
      }
    }

    return null;
  }
}
