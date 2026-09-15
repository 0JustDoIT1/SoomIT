class AppointmentPendingRequest {
  final String requestType;
  final String status;
  final DateTime? requestedScheduledAt;
  final DateTime requestedAt;
  final String? reason;

  const AppointmentPendingRequest({
    required this.requestType,
    required this.status,
    required this.requestedScheduledAt,
    required this.requestedAt,
    required this.reason,
  });

  factory AppointmentPendingRequest.fromJson(Map<String, dynamic> json) {
    return AppointmentPendingRequest(
      requestType: json['request_type'] as String,
      status: json['status'] as String,
      requestedScheduledAt: json['requested_scheduled_at'] != null
          ? DateTime.parse(json['requested_scheduled_at'] as String).toLocal()
          : null,
      requestedAt: DateTime.parse(json['requested_at'] as String).toLocal(),
      reason: json['reason'] as String?,
    );
  }
}

class Appointment {
  final String id;
  final DateTime scheduledAt;

  final String appointmentStatus;
  final String appointmentStatusLabel;

  final String visitStatus;
  final String visitStatusLabel;

  final String createdByType;

  final String? doctorId;
  final String? doctorName;

  final String hospitalName;

  final String? examType;
  final String displayType;

  final DateTime? cancellationRequestedAt;
  final AppointmentPendingRequest? pendingRequest;

  const Appointment({
    required this.id,
    required this.scheduledAt,
    required this.appointmentStatus,
    required this.appointmentStatusLabel,
    required this.visitStatus,
    required this.visitStatusLabel,
    required this.createdByType,
    required this.doctorId,
    required this.doctorName,
    required this.hospitalName,
    required this.examType,
    required this.displayType,
    required this.cancellationRequestedAt,
    required this.pendingRequest,
  });

  factory Appointment.fromJson(Map<String, dynamic> json) {
    return Appointment(
      id: json['id'] as String,

      scheduledAt: DateTime.parse(
        json['scheduled_at'] as String,
      ).toLocal(),

      appointmentStatus:
          json['appointment_status'] as String,

      appointmentStatusLabel:
          json['appointment_status_label'] as String,

      visitStatus:
          json['visit_status'] as String,

      visitStatusLabel:
          json['visit_status_label'] as String,

      createdByType:
          json['created_by_type'] as String,

      doctorId:
          json['doctor'] as String?,

      doctorName:
          json['doctor_name'] as String?,

      hospitalName:
          json['hospital_name'] as String,

      examType:
          (json['order_type'] ?? json['exam_type']) as String?,

      displayType:
          json['display_type'] as String,

      cancellationRequestedAt:
          json['cancellation_requested_at'] != null
              ? DateTime.parse(
                  json['cancellation_requested_at'] as String,
                ).toLocal()
              : null,
      pendingRequest: json['pending_request'] != null
          ? AppointmentPendingRequest.fromJson(
              json['pending_request'] as Map<String, dynamic>,
            )
          : null,
    );
  }
}
