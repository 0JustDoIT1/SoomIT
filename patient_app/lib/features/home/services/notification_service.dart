import '../../../core/network/dio_client.dart';
import '../models/patient_notification.dart';

class NotificationService {
  Future<List<PatientNotification>> getNotifications() async {
    final response = await DioClient.instance.get(
      '/api/patients/notifications/',
    );

    final List<dynamic> data = response.data as List<dynamic>;

    return data
        .map(
          (json) => PatientNotification.fromJson(
            json as Map<String, dynamic>,
          ),
        )
        .toList();
  }

  Future<PatientNotification> markAsRead(String id) async {
    final response = await DioClient.instance.patch(
      '/api/patients/notifications/$id/read/',
    );

    return PatientNotification.fromJson(
      response.data as Map<String, dynamic>,
    );
  }
}
