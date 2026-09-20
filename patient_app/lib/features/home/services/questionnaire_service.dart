import '../../../core/network/dio_client.dart';
import '../../mypage/models/patient_questionnaire.dart';

class QuestionnaireService {
  // =========================================================
  // 문진표 작성 내역 조회
  // =========================================================

  Future<List<PatientQuestionnaire>> getQuestionnaires() async {
    final response = await DioClient.instance.get(
      '/api/patients/questionnaires/',
    );

    final List<dynamic> data = response.data as List<dynamic>;

    return data
        .map(
          (json) => PatientQuestionnaire.fromJson(json as Map<String, dynamic>),
        )
        .toList();
  }

  // =========================================================
  // 신규 문진표 제출
  // =========================================================

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

        // 제출 버튼으로 저장하므로 완료 상태
        'is_completed': true,
      },
    );
  }

  // =========================================================
  // 기존 문진표 수정
  // =========================================================

  Future<void> updateQuestionnaire({
    required String questionnaireId,
    required Map<String, dynamic> responses,
  }) async {
    await DioClient.instance.patch(
      '/api/patients/questionnaires/$questionnaireId/',
      data: {
        'responses': responses,

        // 수정 후에도 작성 완료 상태 유지
        'is_completed': true,
      },
    );
  }
}
