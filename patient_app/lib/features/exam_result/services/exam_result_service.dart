import '../../../core/network/dio_client.dart';
import '../models/exam_result.dart';

class ExamResultService {
  Future<List<ExamResult>> getExamResults() async {
    final response = await DioClient.instance.get(
      '/api/clinical/results/',
    );

    final List<dynamic> data = response.data as List<dynamic>;

    return data
        .map(
          (json) => ExamResult.fromJson(
            json as Map<String, dynamic>,
          ),
        )
        .toList();
  }
}