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

  Future<PatientProfile> updateProfile({
    required String phoneNumber,
    required String postalCode,
    required String address,
    required String addressDetail,
  }) async {
    final response = await DioClient.instance.patch(
      '/api/patients/profile/',
      data: {
        'phone_number': phoneNumber,
        'postal_code': postalCode,
        'address': address,
        'address_detail': addressDetail,
      },
    );

    return PatientProfile.fromJson(
      response.data as Map<String, dynamic>,
    );
  }
}
