import '../../../core/network/dio_client.dart';
import '../models/symptom_log.dart';

class SymptomService {
  /// 증상 기록 목록 조회
  Future<List<SymptomLog>> getSymptomLogs() async {
    final response = await DioClient.instance.get(
      '/api/patients/symptoms/',
    );

    final data = response.data;

    if (data is! List) {
      throw Exception('증상 기록 응답 형식이 올바르지 않습니다.');
    }

    return data
        .map(
          (json) => SymptomLog.fromJson(
            json as Map<String, dynamic>,
          ),
        )
        .toList();
  }

  /// 새 증상 기록 등록
  Future<SymptomLog> createSymptomLog({
    required String symptomType,
    String? symptomDescription,
    required int severity,
  }) async {
    final response = await DioClient.instance.post(
      '/api/patients/symptoms/',
      data: {
        'symptom_type': symptomType,
        'symptom_description': symptomDescription,
        'severity': severity,
        'logged_at': DateTime.now().toIso8601String(),
      },
    );

    return SymptomLog.fromJson(
      response.data as Map<String, dynamic>,
    );
  }
}