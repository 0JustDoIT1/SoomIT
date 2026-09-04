class ExamSchedule {
  final String id;
  final DateTime scheduledAt;

  final String examType;
  final String examName;

  final String appointmentStatus;
  final String appointmentStatusLabel;

  final String visitStatus;
  final String visitStatusLabel;

  final String? hospitalName;
  final String? doctorName;
  final String? preparationGuide;

  const ExamSchedule({
    required this.id,
    required this.scheduledAt,
    required this.examType,
    required this.examName,
    required this.appointmentStatus,
    required this.appointmentStatusLabel,
    required this.visitStatus,
    required this.visitStatusLabel,
    this.hospitalName,
    this.doctorName,
    this.preparationGuide,
  });

  factory ExamSchedule.fromJson(Map<String, dynamic> json) {
    return ExamSchedule(
      id: json['id'] as String,
      scheduledAt: DateTime.parse(
        json['scheduled_at'] as String,
      ),
      examType: json['exam_type'] as String,
      examName: json['exam_name'] as String,
      appointmentStatus: json['appointment_status'] as String,
      appointmentStatusLabel:
          json['appointment_status_label'] as String,
      visitStatus: json['visit_status'] as String,
      visitStatusLabel:
          json['visit_status_label'] as String,
      hospitalName: json['hospital_name'] as String?,
      doctorName: json['doctor_name'] as String?,
      preparationGuide:
          json['preparation_guide'] as String?,
    );
  }
}