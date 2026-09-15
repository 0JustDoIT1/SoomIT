import 'medication_schedule.dart';

class MedicationIntakeLog {
  final String id;
  final String medicationScheduleId;
  final String reminderTime;
  final DateTime scheduledAt;
  final DateTime? takenAt;
  final String status;
  final String statusLabel;
  final List<MedicationItem> items;
  final DateTime createdAt;
  final DateTime updatedAt;

  const MedicationIntakeLog({
    required this.id,
    required this.medicationScheduleId,
    required this.reminderTime,
    required this.scheduledAt,
    required this.takenAt,
    required this.status,
    required this.statusLabel,
    required this.items,
    required this.createdAt,
    required this.updatedAt,
  });

  factory MedicationIntakeLog.fromJson(
    Map<String, dynamic> json,
  ) {
    return MedicationIntakeLog(
      id: json['id'] as String,
      medicationScheduleId:
          json['medication_schedule_id'] as String,
      reminderTime: json['reminder_time'] as String,
      scheduledAt: DateTime.parse(
        json['scheduled_at'] as String,
      ),
      takenAt: json['taken_at'] == null
          ? null
          : DateTime.parse(
              json['taken_at'] as String,
            ),
      status: json['status'] as String,
      statusLabel: json['status_label'] as String,
      items: (json['items'] as List<dynamic>)
          .map(
            (item) => MedicationItem.fromJson(
              item as Map<String, dynamic>,
            ),
          )
          .toList(),
      createdAt: DateTime.parse(
        json['created_at'] as String,
      ),
      updatedAt: DateTime.parse(
        json['updated_at'] as String,
      ),
    );
  }

  String get medicineTitle {
    if (items.isEmpty) {
      return '처방약';
    }

    final firstDrugName = items.first.drugName;
    final remainingCount = items.length - 1;

    if (remainingCount == 0) {
      return firstDrugName;
    }

    return '$firstDrugName 외 $remainingCount개';
  }
}