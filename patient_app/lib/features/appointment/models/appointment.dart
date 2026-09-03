class Appointment {
  final String id;
  final DateTime scheduledAt;
  final String type;
  final String hospital;
  final String doctor;
  final String status;

  const Appointment({
    required this.id,
    required this.scheduledAt,
    required this.type,
    required this.hospital,
    required this.doctor,
    required this.status,
  });
}