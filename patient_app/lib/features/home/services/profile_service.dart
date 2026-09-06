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

  Future<PatientProfile> updatePhoneNumber(
    String phoneNumber,
  ) async {
    final response = await DioClient.instance.patch(
      '/api/patients/profile/',
      data: {
        'phone_number': phoneNumber,
      },
    );

    return PatientProfile.fromJson(
      response.data as Map<String, dynamic>,
    );
  }
}