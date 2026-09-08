class SymptomLog {
  final String id;
  final String symptomType;
  final String? symptomDescription;
  final int severity;
  final String riskLevel;
  final String riskLevelLabel;
  final DateTime loggedAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  SymptomLog({
    required this.id,
    required this.symptomType,
    this.symptomDescription,
    required this.severity,
    required this.riskLevel,
    required this.riskLevelLabel,
    required this.loggedAt,
    required this.createdAt,
    required this.updatedAt,
  });

  factory SymptomLog.fromJson(Map<String, dynamic> json) {
    return SymptomLog(
      id: json['id'] as String,
      symptomType: json['symptom_type'] as String,
      symptomDescription: json['symptom_description'] as String?,
      severity: json['severity'] as int,
      riskLevel: json['risk_level'] as String,
      riskLevelLabel: json['risk_level_label'] as String,
      loggedAt: DateTime.parse(json['logged_at'] as String),
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
    );
  }
}