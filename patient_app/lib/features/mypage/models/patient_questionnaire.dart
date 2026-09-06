class PatientQuestionnaire {
  final String id;
  final String questionnaireType;
  final String questionnaireVersion;
  final Map<String, dynamic> responses;
  final bool isCompleted;
  final DateTime? completedAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  const PatientQuestionnaire({
    required this.id,
    required this.questionnaireType,
    required this.questionnaireVersion,
    required this.responses,
    required this.isCompleted,
    required this.completedAt,
    required this.createdAt,
    required this.updatedAt,
  });

  factory PatientQuestionnaire.fromJson(
    Map<String, dynamic> json,
  ) {
    return PatientQuestionnaire(
      id: json['id'] as String,
      questionnaireType: json['questionnaire_type'] as String,
      questionnaireVersion: json['questionnaire_version'] as String,
      responses: Map<String, dynamic>.from(
        json['responses'] as Map,
      ),
      isCompleted: json['is_completed'] as bool,
      completedAt: json['completed_at'] != null
          ? DateTime.parse(json['completed_at'] as String)
          : null,
      createdAt: DateTime.parse(
        json['created_at'] as String,
      ),
      updatedAt: DateTime.parse(
        json['updated_at'] as String,
      ),
    );
  }
}