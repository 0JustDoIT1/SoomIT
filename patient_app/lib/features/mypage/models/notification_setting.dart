class NotificationSetting {
  final String notificationType;
  final String notificationTypeLabel;
  final bool enabled;
  final DateTime updatedAt;

  const NotificationSetting({
    required this.notificationType,
    required this.notificationTypeLabel,
    required this.enabled,
    required this.updatedAt,
  });

  factory NotificationSetting.fromJson(
    Map<String, dynamic> json,
  ) {
    return NotificationSetting(
      notificationType:
          json['notification_type'] as String,
      notificationTypeLabel:
          json['notification_type_label'] as String,
      enabled: json['enabled'] as bool,
      updatedAt: DateTime.parse(
        json['updated_at'] as String,
      ),
    );
  }
}