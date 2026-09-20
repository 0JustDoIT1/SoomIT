import '../../../core/network/dio_client.dart';
import '../models/exam_result.dart';

class ExamResultService {
  Future<List<ExamResult>> getExamResults() async {
    final response = await DioClient.instance.get(
      '/api/clinical/results/',
    );

    final List<dynamic> data =
        response.data as List<dynamic>;

    final rawResults = data
        .map(
          (json) => ExamResult.fromJson(
            json as Map<String, dynamic>,
          ),
        )
        .toList();

    return _mergeResults(rawResults);
  }

  List<ExamResult> _mergeResults(
    List<ExamResult> results,
  ) {
    final List<ExamResult> output = [];

    // =========================================================
    // 조직(유전자)검사 그룹
    //
    // PATHOLOGY_GENE + PDL1
    // → 환자앱에서는 하나로 합침
    // =========================================================
    final pathologyResults = results
        .where(
          (result) => result.isPathologyGroup,
        )
        .toList();

    if (pathologyResults.isNotEmpty) {
      output.add(
        _mergePathologyGroup(
          pathologyResults,
        ),
      );
    }

    // =========================================================
    // X-ray / CT / PET-CT
    // =========================================================
    for (final result in results) {
      if (result.isPathologyGroup) {
        continue;
      }

      output.add(
        _normalizeResult(result),
      );
    }

    // 최신 결과 먼저
    output.sort(
      (a, b) =>
          b.resultDate.compareTo(a.resultDate),
    );

    return output;
  }

  // ===========================================================
  // 조직 + 유전자 + PD-L1 합치기
  // ===========================================================
  ExamResult _mergePathologyGroup(
    List<ExamResult> items,
  ) {
    items.sort(
      (a, b) =>
          b.resultDate.compareTo(a.resultDate),
    );

    final latest = items.first;

    final List<ExamResultSection> sections = [];

    for (final item in items) {
      for (final section
          in item.resultSections) {
        if (_isExcludedSection(section)) {
          continue;
        }

        sections.add(section);
      }
    }

    return ExamResult(
      id: latest.id,

      examType: 'PATHOLOGY_GENE',

      examName: '조직(유전자)검사',

      resultStatus:
          latest.resultStatus,

      resultStatusLabel:
          latest.resultStatusLabel,

      resultDate:
          latest.resultDate,

      resultSummary:
          '조직검사, 유전자검사 및 PD-L1 결과가 확인되었습니다.',

      resultSections: sections,

      hospitalName:
          latest.hospitalName,

      departmentName:
          latest.departmentName,

      doctorName:
          latest.doctorName,
    );
  }

  // ===========================================================
  // 화면에 표시할 검사 이름 통일
  // ===========================================================
  ExamResult _normalizeResult(
    ExamResult result,
  ) {
    String examName = result.examName;

    switch (result.examType) {
      case 'XRAY':
        examName = '흉부 X-ray';
        break;

      case 'CT':
        examName = '흉부 CT';
        break;

      case 'PET_CT_TNM':
        // TNM은 PET-CT 상세 결과에 포함
        examName = 'PET-CT';
        break;
    }

    final visibleSections = result.resultSections
        .where(
          (section) =>
              !_isExcludedSection(section),
        )
        .toList();

    return ExamResult(
      id: result.id,

      examType:
          result.examType,

      examName:
          examName,

      resultStatus:
          result.resultStatus,

      resultStatusLabel:
          result.resultStatusLabel,

      resultDate:
          result.resultDate,

      resultSummary:
          result.resultSummary,

      resultSections:
          visibleSections,

      hospitalName:
          result.hospitalName,

      departmentName:
          result.departmentName,

      doctorName:
          result.doctorName,
    );
  }

  // ===========================================================
  // 환자앱에서 제외
  // ===========================================================
  bool _isExcludedSection(
    ExamResultSection section,
  ) {
    final value =
        '${section.type} ${section.label}'
            .toUpperCase();

    return value.contains(
          'DOCTOR_OPINION',
        ) ||
        value.contains(
          'MEDICAL_OPINION',
        ) ||
        value.contains(
          '의료진 소견',
        ) ||
        value.contains(
          'NEXT_PLAN',
        ) ||
        value.contains(
          'FOLLOW_UP',
        ) ||
        value.contains(
          '다음 계획',
        ) ||
        value.contains(
          'RECOMMENDATION',
        ) ||
        value.contains(
          '권고 조치',
        ) ||
        value.contains(
          'FINDING_SUMMARY',
        ) ||
        value.contains(
          '진단 요약',
        ) ||
        value.contains(
          'DIAGNOSIS_SUMMARY',
        ) ||
        value.contains(
          'INTERPRETATION',
        ) ||
        value.contains(
          '결과 해석',
        );
  }
}