import '../../../core/network/dio_client.dart';
import '../models/patient_questionnaire.dart';

class QuestionnaireService {
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
}