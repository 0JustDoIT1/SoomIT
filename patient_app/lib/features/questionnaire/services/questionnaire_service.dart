import '../../../core/network/dio_client.dart';
import '../models/questionnaire.dart';

class QuestionnaireService {
  Future<List<Questionnaire>> getQuestionnaires() async {
    final response = await DioClient.instance.get(
      '/api/patients/questionnaires/',
    );

    final List<dynamic> data = response.data as List<dynamic>;

    return data
        .map(
          (json) => Questionnaire.fromJson(
            json as Map<String, dynamic>,
          ),
        )
        .toList();
  }

  Future<Questionnaire> createQuestionnaire({
    required Map<String, dynamic> responses,
    bool isCompleted = false,
  }) async {
    final response = await DioClient.instance.post(
      '/api/patients/questionnaires/',
      data: {
        'questionnaire_type': 'PRE_VISIT',
        'questionnaire_version': '1.0',
        'responses': responses,
        'is_completed': isCompleted,
      },
    );

    return Questionnaire.fromJson(
      response.data as Map<String, dynamic>,
    );
  }

  Future<Questionnaire> updateQuestionnaire({
    required String questionnaireId,
    Map<String, dynamic>? responses,
    bool? isCompleted,
  }) async {
    final data = <String, dynamic>{};

    if (responses != null) {
      data['responses'] = responses;
    }

    if (isCompleted != null) {
      data['is_completed'] = isCompleted;
    }

    final response = await DioClient.instance.patch(
      '/api/patients/questionnaires/$questionnaireId/',
      data: data,
    );

    return Questionnaire.fromJson(
      response.data as Map<String, dynamic>,
    );
  }
}