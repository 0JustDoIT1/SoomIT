import '../../../core/network/dio_client.dart';
import '../models/medication_schedule.dart';

class MedicationService {
  Future<List<MedicationSchedule>> getMedicationSchedules() async {
    final response = await DioClient.instance.get(
      '/api/patients/medications/',
    );

    final data = response.data;

    if (data is! List) {
      throw Exception('복약 일정 응답 형식이 올바르지 않습니다.');
    }

    return data
        .map(
          (json) => MedicationSchedule.fromJson(
            json as Map<String, dynamic>,
          ),
        )
        .toList();
  }

  Future<void> markAsTaken({
    required String medicationScheduleId,
    required DateTime scheduledAt,
  }) async {
    await DioClient.instance.post(
      '/api/patients/medications/intake/taken/',
      data: {
        'medication_schedule_id': medicationScheduleId,
        'scheduled_at': scheduledAt.toIso8601String(),
      },
    );
  }
}