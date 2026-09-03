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
  });

  factory Appointment.fromJson(Map<String, dynamic> json) {
    return Appointment(
      id: json['id'] as String,

      scheduledAt: DateTime.parse(
        json['scheduled_at'] as String,
      ),

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
          json['exam_type'] as String?,

      displayType:
          json['display_type'] as String,
    );
  }
}