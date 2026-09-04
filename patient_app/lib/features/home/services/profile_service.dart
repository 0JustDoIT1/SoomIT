import '../../../core/network/dio_client.dart';
import '../models/patient_profile.dart';

class ProfileService {
  Future<PatientProfile> getProfile() async {
    final response = await DioClient.instance.get(
      '/api/patients/profile/',
    );

    return PatientProfile.fromJson(
      response.data as Map<String, dynamic>,
    );
  }
}