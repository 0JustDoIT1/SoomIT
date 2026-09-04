import '../../../core/network/dio_client.dart';
import '../models/exam_schedule.dart';

class ExamScheduleService {
  Future<List<ExamSchedule>> getExamSchedules() async {
    final response = await DioClient.instance.get(
      '/api/patients/exam-schedules/',
    );

    final List<dynamic> data = response.data as List<dynamic>;

    return data
        .map(
          (json) => ExamSchedule.fromJson(
            json as Map<String, dynamic>,
          ),
        )
        .toList();
  }
}