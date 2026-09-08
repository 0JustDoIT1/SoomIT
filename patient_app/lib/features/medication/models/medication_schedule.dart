class MedicationSchedule {
  final String id;
  final String reminderTime;
  final bool enabled;
  final List<MedicationItem> items;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String todayStatus;

  MedicationSchedule({
    required this.id,
    required this.reminderTime,
    required this.enabled,
    required this.items,
    required this.createdAt,
    required this.updatedAt,
    required this.todayStatus,
  });

  factory MedicationSchedule.fromJson(Map<String, dynamic> json) {
    return MedicationSchedule(
      id: json['id'] as String,
      reminderTime: json['reminder_time'] as String,
      enabled: json['enabled'] as bool,
      todayStatus: json['today_status'] as String,
      items: (json['items'] as List<dynamic>)
          .map(
            (item) => MedicationItem.fromJson(
              item as Map<String, dynamic>,
            ),
          )
          .toList(),
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
    );
  }
}

class MedicationItem {
  final String id;
  final String drugName;
  final String ingredientName;
  final String? dose;
  final String unit;
  final String route;
  final String? frequency;
  final String? instructions;

  MedicationItem({
    required this.id,
    required this.drugName,
    required this.ingredientName,
    required this.dose,
    required this.unit,
    required this.route,
    required this.frequency,
    required this.instructions,
  });

  factory MedicationItem.fromJson(Map<String, dynamic> json) {
    return MedicationItem(
      id: json['id'] as String,
      drugName: json['drug_name'] as String,
      ingredientName: json['ingredient_name'] as String,
      dose: json['dose']?.toString(),
      unit: json['unit'] as String,
      route: json['route'] as String,
      frequency: json['frequency'] as String?,
      instructions: json['instructions'] as String?,
    );
  }
}