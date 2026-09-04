//class ExamResult {
//  final String id;
//  final String examType;
//  final String examName;
//
//  
//  final DateTime scheduledAt;
//  final String status;
//  final String department;
//  final String preparationGuide;
//  final bool hasResult;
//  final String? resultSummary;
//
//  const ExamResult({
//    required this.id,
//    required this.examType,
//    required this.examName,
//    required this.scheduledAt,
//    required this.status,
//    required this.department,
//    required this.preparationGuide,
//    required this.hasResult,
//    this.resultSummary,
//  });
//}

class ExamResult {
  final String id;
  final String examType;
  final String examName;

  // 검사 결과 상태
  final String resultStatus;
  final String resultStatusLabel;

  // 결과 등록/확정 날짜
  final DateTime resultDate;

  // 검사 결과 요약
  final String resultSummary;

  const ExamResult({
    required this.id,
    required this.examType,
    required this.examName,
    required this.resultStatus,
    required this.resultStatusLabel,
    required this.resultDate,
    required this.resultSummary,
  });

  factory ExamResult.fromJson(Map<String, dynamic> json) {
    return ExamResult(
      id: json['id'] as String,
      examType: json['exam_type'] as String,
      examName: json['exam_name'] as String,
      resultStatus: json['result_status'] as String,
      resultStatusLabel: json['result_status_label'] as String,
      resultDate: DateTime.parse(
        json['result_date'] as String,
      ),
      resultSummary: json['result_summary'] as String? ??
          '검사 결과가 등록되어 있습니다.',
    );
  }

  bool get isConfirmed => resultStatus == 'CONFIRMED';
}