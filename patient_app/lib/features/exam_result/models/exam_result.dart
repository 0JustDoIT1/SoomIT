class ExamResultSection {
  final String type;
  final String label;
  final String summary;

  const ExamResultSection({
    required this.type,
    required this.label,
    required this.summary,
  });

  factory ExamResultSection.fromJson(
    Map<String, dynamic> json,
  ) {
    return ExamResultSection(
      type: json['type'] as String? ?? '',
      label: json['label'] as String? ?? '',
      summary: json['summary'] as String? ?? '',
    );
  }
}

class ExamResult {
  final String id;
  final String examType;
  final String examName;

  final String resultStatus;
  final String resultStatusLabel;

  final DateTime resultDate;

  final String resultSummary;

  final List<ExamResultSection> resultSections;

  const ExamResult({
    required this.id,
    required this.examType,
    required this.examName,
    required this.resultStatus,
    required this.resultStatusLabel,
    required this.resultDate,
    required this.resultSummary,
    this.resultSections = const [],
  });

  factory ExamResult.fromJson(Map<String, dynamic> json) {
    final rawSections = json['result_sections'];

    return ExamResult(
      id: json['id'] as String,
      examType: json['workflow_stage'] as String,
      examName: json['exam_name'] as String,
      resultStatus: json['result_status'] as String,
      resultStatusLabel:
          json['result_status_label'] as String? ??
          json['result_status'] as String,
      resultDate: DateTime.parse(
        json['result_date'] as String,
      ),
      resultSummary:
          json['result_summary'] as String? ??
          '검사 결과가 등록되어 있습니다.',
      resultSections: rawSections is List
          ? rawSections
              .whereType<Map<String, dynamic>>()
              .map(ExamResultSection.fromJson)
              .toList()
          : const [],
    );
  }

  bool get isConfirmed => resultStatus == 'CONFIRMED';

  bool get isPathologyGroup =>
      examType == 'PATHOLOGY_GENE' ||
      examType == 'PDL1';
}
