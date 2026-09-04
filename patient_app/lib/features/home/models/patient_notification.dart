class PatientNotification {
  final String id;
  final String notificationType;
  final String channel;
  final String title;
  final String message;
  final Map<String, dynamic>? payload;
  final String deliveryStatus;
  final DateTime? sentAt;
  final DateTime? readAt;
  final bool isRead;
  final DateTime createdAt;

  const PatientNotification({
    required this.id,
    required this.notificationType,
    required this.channel,
    required this.title,
    required this.message,
    required this.payload,
    required this.deliveryStatus,
    required this.sentAt,
    required this.readAt,
    required this.isRead,
    required this.createdAt,
  });

  factory PatientNotification.fromJson(Map<String, dynamic> json) {
    return PatientNotification(
      id: json['id'] as String,
      notificationType: json['notification_type'] as String,
      channel: json['channel'] as String,
      title: json['title'] as String,
      message: json['message'] as String,
      payload: json['payload'] == null
          ? null
          : Map<String, dynamic>.from(json['payload'] as Map),
      deliveryStatus: json['delivery_status'] as String,
      sentAt: json['sent_at'] == null
          ? null
          : DateTime.parse(json['sent_at'] as String),
      readAt: json['read_at'] == null
          ? null
          : DateTime.parse(json['read_at'] as String),
      isRead: json['is_read'] as bool,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }
}