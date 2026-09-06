import '../../../core/network/dio_client.dart';
import '../../mypage/models/patient_questionnaire.dart';

class QuestionnaireService {
  // 문진표 작성 내역 조회
  Future<List<PatientQuestionnaire>> getQuestionnaires() async {
    final response = await DioClient.instance.get(
      '/api/patients/questionnaires/',
    );

    final List<dynamic> data = response.data as List<dynamic>;

    return data
        .map(
          (json) => PatientQuestionnaire.fromJson(
            json as Map<String, dynamic>,
          ),
        )
        .toList();
  }

  // 문진표 작성 / 제출
  Future<void> submitQuestionnaire({
    required String questionnaireType,
    required String questionnaireVersion,
    required Map<String, dynamic> responses,
  }) async {
    await DioClient.instance.post(
      '/api/patients/questionnaires/',
      data: {
        'questionnaire_type': questionnaireType,
        'questionnaire_version': questionnaireVersion,
        'responses': responses,
      },
    );
  }
}