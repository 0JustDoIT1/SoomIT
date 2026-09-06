import '../../../core/network/dio_client.dart';
import '../models/notification_setting.dart';

class NotificationSettingService {
  Future<List<NotificationSetting>>
      getNotificationSettings() async {
    final response = await DioClient.instance.get(
      '/api/patients/notification-settings/',
    );

    final List<dynamic> data = response.data;

    return data
        .map(
          (json) => NotificationSetting.fromJson(
            json as Map<String, dynamic>,
          ),
        )
        .toList();
  }

  Future<NotificationSetting> updateNotificationSetting({
    required String notificationType,
    required bool enabled,
  }) async {
    final response = await DioClient.instance.patch(
      '/api/patients/notification-settings/'
      '$notificationType/',
      data: {
        'enabled': enabled,
      },
    );

    return NotificationSetting.fromJson(
      response.data as Map<String, dynamic>,
    );
  }
}