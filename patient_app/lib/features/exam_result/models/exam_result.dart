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
      type: json['type']?.toString() ?? '',
      label: json['label']?.toString() ?? '',
      summary: json['summary']?.toString() ?? '',
    );
  }
}

class ExamResult {
  final String id;

  /// XRAY
  /// CT
  /// PET_CT_TNM
  /// PATHOLOGY_GENE
  /// PDL1
  final String examType;

  final String examName;

  /// CONFIRMED 등
  final String resultStatus;
  final String resultStatusLabel;

  /// 결과 확정일
  final DateTime resultDate;

  /// 결과 목록에서 보여줄 요약
  final String resultSummary;

  /// 검사별 상세 결과
  final List<ExamResultSection> resultSections;

  // =========================================================
  // 기존 화면 / mock 호환 필드
  // =========================================================
  final String? hospitalName;
  final String? departmentName;
  final String? doctorName;

  const ExamResult({
    required this.id,
    required this.examType,
    required this.examName,
    required this.resultStatus,
    required this.resultStatusLabel,
    required this.resultDate,
    required this.resultSummary,

    this.resultSections = const [],

    // 기존 코드 호환
    this.hospitalName,
    this.departmentName,
    this.doctorName,
  });

  factory ExamResult.fromJson(
    Map<String, dynamic> json,
  ) {
    // =======================================================
    // 상세 결과 sections
    // =======================================================
    final rawSections =
        json['result_sections'];

    final List<ExamResultSection> sections;

    if (rawSections is List) {
      sections = rawSections
          .whereType<Map>()
          .map(
            (item) => ExamResultSection.fromJson(
              Map<String, dynamic>.from(item),
            ),
          )
          .toList();
    } else {
      sections = const [];
    }

    // =======================================================
    // 날짜
    // =======================================================
    final rawDate =
        json['result_date']?.toString();

    final parsedDate =
        rawDate != null
            ? DateTime.tryParse(rawDate)
            : null;

    return ExamResult(
      id: json['id']?.toString() ?? '',

      // 현재 backend는 workflow_stage 사용
      // 예전 exam_type 응답도 호환
      examType:
          json['workflow_stage']?.toString() ??
          json['exam_type']?.toString() ??
          '',

      examName:
          json['exam_name']?.toString() ??
          '검사',

      resultStatus:
          json['result_status']?.toString() ??
          '',

      resultStatusLabel:
          json['result_status_label']?.toString() ??
          '',

      resultDate:
          parsedDate ?? DateTime.now(),

      resultSummary:
          json['result_summary']?.toString() ??
          '검사 결과가 확인되었습니다.',

      resultSections: sections,

      // 기존 정보가 API에 내려올 경우 사용
      hospitalName:
          json['hospital_name']?.toString(),

      departmentName:
          json['department_name']?.toString(),

      doctorName:
          json['doctor_name']?.toString(),
    );
  }

  // =========================================================
  // 확정 결과 여부
  // =========================================================
  bool get isConfirmed =>
      resultStatus == 'CONFIRMED';

  // =========================================================
  // 병리 계열 검사 여부
  //
  // 기존 ExamResultService에서 사용 중
  // PATHOLOGY_GENE + PDL1을 병리 계열로 처리
  // =========================================================
  bool get isPathologyGroup =>
      examType == 'PATHOLOGY_GENE' ||
      examType == 'PDL1';

  // =========================================================
  // 영상 계열
  // 나중에 필터링 등에 사용 가능
  // =========================================================
  bool get isImagingGroup =>
      examType == 'XRAY' ||
      examType == 'CT' ||
      examType == 'PET_CT_TNM';
}