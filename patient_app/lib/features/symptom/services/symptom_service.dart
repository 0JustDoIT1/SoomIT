import 'package:dio/dio.dart';

import '../../../core/network/dio_client.dart';
import '../models/symptom_log.dart';

class DailySymptomDuplicateException implements Exception {
  final String detail;
  final String symptomType;
  final String recordDate;
  final String existingRecordId;

  const DailySymptomDuplicateException({
    required this.detail,
    required this.symptomType,
    required this.recordDate,
    required this.existingRecordId,
  });

  @override
  String toString() => detail;
}

class SymptomService {
  /// 증상 기록 목록 조회
  Future<List<SymptomLog>> getSymptomLogs() async {
    final response = await DioClient.instance.get('/api/patients/symptoms/');

    final data = response.data;

    if (data is! List) {
      throw Exception('증상 기록 응답 형식이 올바르지 않습니다.');
    }

    return data
        .map((json) => SymptomLog.fromJson(json as Map<String, dynamic>))
        .toList();
  }

  /// 새 증상 기록 등록
  Future<SymptomLog> createSymptomLog({
    required String symptomType,
    String? symptomDescription,
    required int severity,
  }) async {
    try {
      final response = await DioClient.instance.post(
        '/api/patients/symptoms/',
        data: {
          'symptom_type': symptomType,
          'symptom_description': symptomDescription,
          'severity': severity,
        },
      );

      return SymptomLog.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (error) {
      final data = error.response?.data;

      if (error.response?.statusCode == 409 &&
          data is Map<String, dynamic> &&
          data['code'] == 'daily_symptom_duplicate') {
        throw DailySymptomDuplicateException(
          detail: data['detail'] as String,
          symptomType: data['symptom_type'] as String,
          recordDate: data['record_date'] as String,
          existingRecordId: data['existing_record_id'] as String,
        );
      }

      rethrow;
    }
  }
}
