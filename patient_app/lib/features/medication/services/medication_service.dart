import '../../../core/network/dio_client.dart';
import '../models/medication_intake_log.dart';
import '../models/medication_schedule.dart';

class MedicationService {
  Future<List<MedicationSchedule>> getMedicationSchedules() async {
    final response = await DioClient.instance.get('/api/patients/medications/');

    final data = response.data;

    if (data is! List) {
      throw Exception('복약 일정 응답 형식이 올바르지 않습니다.');
    }

    return data
        .map(
          (json) => MedicationSchedule.fromJson(json as Map<String, dynamic>),
        )
        .toList();
  }

  Future<List<MedicationIntakeLog>> getMedicationIntakeLogs({
    DateTime? date,
  }) async {
    final response = await DioClient.instance.get(
      '/api/patients/medications/intake/',
      queryParameters: date == null ? null : {'date': _formatDate(date)},
    );

    final data = response.data;

    if (data is! List) {
      throw Exception('복약 기록 응답 형식이 올바르지 않습니다.');
    }

    return data
        .map(
          (json) => MedicationIntakeLog.fromJson(json as Map<String, dynamic>),
        )
        .toList();
  }

  Future<void> markAsTaken({
    required String medicationScheduleId,
    required DateTime scheduledAt,
    DateTime? takenAt,
  }) async {
    final data = <String, dynamic>{
      'medication_schedule_id': medicationScheduleId,
      'scheduled_at': scheduledAt.toUtc().toIso8601String(),
    };

    if (takenAt != null) {
      data['taken_at'] = takenAt.toUtc().toIso8601String();
    }

    await DioClient.instance.post(
      '/api/patients/medications/intake/taken/',
      data: data,
    );
  }

  String _formatDate(DateTime date) {
    final year = date.year.toString().padLeft(4, '0');
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');

    return '$year-$month-$day';
  }
}
