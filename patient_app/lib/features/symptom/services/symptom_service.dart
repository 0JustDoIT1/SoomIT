import 'package:dio/dio.dart';

import '../../../core/network/dio_client.dart';
import '../models/symptom_log.dart';

class SymptomService {
  Future<List<SymptomLog>> getSymptomLogs() async {
    final response = await DioClient.instance.get('/api/patients/symptoms/');

    final data = response.data as List<dynamic>;

    return data
        .map((json) => SymptomLog.fromJson(json as Map<String, dynamic>))
        .toList();
  }

  Future<SymptomLog> createSymptom({
    required String symptomType,
    required int severity,
    String? description,
  }) async {
    final response = await DioClient.instance.post(
      '/api/patients/symptoms/',
      data: {
        'symptom_type': symptomType,
        'severity': severity,
        'symptom_description': ?description,
      },
    );

    return SymptomLog.fromJson(response.data as Map<String, dynamic>);
  }

  Future<SymptomLog> updateSymptom({
    required String symptomId,
    required int severity,
    String? description,
  }) async {
    final data = <String, dynamic>{'severity': severity};

    if (description != null) {
      data['symptom_description'] = description;
    }

    final response = await DioClient.instance.patch(
      '/api/patients/symptoms/$symptomId/',
      data: data,
    );

    return SymptomLog.fromJson(response.data as Map<String, dynamic>);
  }

  Future<SymptomLog> saveDailySymptom({
    required String symptomType,
    required int severity,
    String? existingRecordId,
    String? description,
  }) async {
    if (existingRecordId != null && existingRecordId.isNotEmpty) {
      return updateSymptom(
        symptomId: existingRecordId,
        severity: severity,
        description: description,
      );
    }

    try {
      return await createSymptom(
        symptomType: symptomType,
        severity: severity,
        description: description,
      );
    } on DioException catch (error) {
      if (error.response?.statusCode == 409) {
        final responseData = error.response?.data;

        if (responseData is Map) {
          final existingRecordId = responseData['existing_record_id']
              ?.toString();

          if (existingRecordId != null && existingRecordId.isNotEmpty) {
            return updateSymptom(
              symptomId: existingRecordId,
              severity: severity,
              description: description,
            );
          }
        }
      }

      rethrow;
    }
  }
}
