class AppointmentAvailabilityDate {
  final DateTime date;
  final List<DateTime> slots;

  const AppointmentAvailabilityDate({required this.date, required this.slots});

  factory AppointmentAvailabilityDate.fromJson(Map<String, dynamic> json) {
    return AppointmentAvailabilityDate(
      date: DateTime.parse(json['date'] as String),
      slots: (json['slots'] as List<dynamic>)
          .where((slot) {
            final data = slot as Map<String, dynamic>;
            return (data['remaining_count'] as int? ?? 0) > 0;
          })
          .map((slot) {
            final data = slot as Map<String, dynamic>;
            return DateTime.parse(
              data['start_at'] as String,
            ).toLocal();
          })
          .toList(),
    );
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
