import 'dart:convert';

class Questionnaire {
  final String id;
  final String questionnaireType;
  final String questionnaireVersion;
  final Map<String, dynamic> responses;
  final bool isCompleted;
  final DateTime? completedAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  const Questionnaire({
    required this.id,
    required this.questionnaireType,
    required this.questionnaireVersion,
    required this.responses,
    required this.isCompleted,
    required this.completedAt,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Questionnaire.fromJson(
    Map<String, dynamic> json,
  ) {
    return Questionnaire(
      id: json['id'] as String,
      questionnaireType:
          json['questionnaire_type'] as String,
      questionnaireVersion:
          json['questionnaire_version'] as String,
      responses: _parseResponses(
        json['responses'],
      ),
      isCompleted:
          json['is_completed'] as bool? ?? false,
      completedAt:
          _parseDateTime(
        json['completed_at'],
      ),
      createdAt:
          _parseDateTime(
            json['created_at'],
          ) ??
          DateTime.now(),
      updatedAt:
          _parseDateTime(
            json['updated_at'],
          ) ??
          DateTime.now(),
    );
  }

  static Map<String, dynamic> _parseResponses(
    dynamic value,
  ) {
    if (value == null) {
      return {};
    }

    if (value is Map) {
      return Map<String, dynamic>.from(
        value,
      );
    }

    if (value is String) {
      if (value.trim().isEmpty) {
        return {};
      }

      try {
        final decoded = jsonDecode(value);

        if (decoded is Map) {
          return Map<String, dynamic>.from(
            decoded,
          );
        }
      } catch (_) {
        return {};
      }
    }

    return {};
  }

  static DateTime? _parseDateTime(
    dynamic value,
  ) {
    if (value == null) {
      return null;
    }

    if (value is! String ||
        value.isEmpty) {
      return null;
    }

    return DateTime.tryParse(
      value,
    )?.toLocal();
  }
}