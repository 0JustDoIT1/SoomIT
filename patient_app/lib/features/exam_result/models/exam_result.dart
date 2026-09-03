class ExamResult {
  final String id;
  final String examType;
  final String examName;
  final DateTime scheduledAt;
  final String status;
  final String department;
  final String preparationGuide;
  final bool hasResult;
  final String? resultSummary;

  const ExamResult({
    required this.id,
    required this.examType,
    required this.examName,
    required this.scheduledAt,
    required this.status,
    required this.department,
    required this.preparationGuide,
    required this.hasResult,
    this.resultSummary,
  });
}