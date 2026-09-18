import '../../../core/network/dio_client.dart';
import '../models/exam_result.dart';

class ExamResultService {
  Future<List<ExamResult>> getExamResults() async {
    final response = await DioClient.instance.get(
      '/api/clinical/results/',
    );

    final List<dynamic> data = response.data as List<dynamic>;

    final results = data
        .map(
          (json) => ExamResult.fromJson(
            json as Map<String, dynamic>,
          ),
        )
        .toList();

    return _mergePathologyResults(results);
  }

  List<ExamResult> _mergePathologyResults(
    List<ExamResult> results,
  ) {
    final normalResults = results
        .where((result) => !result.isPathologyGroup)
        .toList();

    final pathologyResults = results
        .where((result) => result.isPathologyGroup)
        .toList();

    if (pathologyResults.isEmpty) {
      return normalResults;
    }

    // API가 최신 결과 순으로 내려오므로
    // 가장 최근 조직/유전자 계열 결과를 기준으로 사용한다.
    pathologyResults.sort(
      (a, b) => b.resultDate.compareTo(a.resultDate),
    );

    final base = pathologyResults.first;

    final sections = <ExamResultSection>[];

    for (final result in pathologyResults) {
      for (final section in result.resultSections) {
        final alreadyExists = sections.any(
          (item) => item.type == section.type,
        );

        if (!alreadyExists) {
          sections.add(section);
        }
      }
    }

    const sectionOrder = {
      'PATHOLOGY': 0,
      'GENE': 1,
      'PDL1': 2,
    };

    sections.sort(
      (a, b) => (sectionOrder[a.type] ?? 99)
          .compareTo(sectionOrder[b.type] ?? 99),
    );

    final sectionLabels = sections
        .map((section) => section.label)
        .where((label) => label.isNotEmpty)
        .join(' · ');

    final merged = ExamResult(
      id: base.id,
      examType: 'PATHOLOGY_GENE',
      examName: '조직(유전자)검사',
      resultStatus: base.resultStatus,
      resultStatusLabel: base.resultStatusLabel,
      resultDate: base.resultDate,
      resultSummary: sectionLabels.isNotEmpty
          ? '$sectionLabels 결과를 확인할 수 있습니다.'
          : '조직(유전자)검사 결과가 등록되어 있습니다.',
      resultSections: sections,
    );

    final mergedResults = [
      ...normalResults,
      merged,
    ];

    mergedResults.sort(
      (a, b) => b.resultDate.compareTo(a.resultDate),
    );

    return mergedResults;
  }
}
