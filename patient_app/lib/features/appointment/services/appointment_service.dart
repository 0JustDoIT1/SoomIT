import '../../../core/network/dio_client.dart';
import '../models/appointment.dart';
import '../models/appointment_availability.dart';
import '../models/appointment_doctor.dart';

class AppointmentService {
  Future<List<Appointment>> getAppointments() async {
    final response = await DioClient.instance.get(
      '/api/patients/appointments/',
    );

    final List<dynamic> data = response.data as List<dynamic>;

    return data
        .map((json) => Appointment.fromJson(json as Map<String, dynamic>))
        .toList();
  }

  Future<Appointment> getAppointment(String appointmentId) async {
    final appointments = await getAppointments();

    return appointments.firstWhere(
      (appointment) => appointment.id == appointmentId,
      orElse: () => throw StateError('Appointment not found.'),
    );
  }

  Future<List<AppointmentDoctor>> getAppointmentDoctors() async {
    final response = await DioClient.instance.get(
      '/api/patients/appointments/doctors/',
    );

    final data = response.data as List<dynamic>;

    return data
        .map((json) => AppointmentDoctor.fromJson(json as Map<String, dynamic>))
        .toList();
  }

  Future<AppointmentAvailability> getAppointmentAvailability({
    required String doctorId,
    required DateTime start,
    required DateTime end,
  }) async {
    final response = await DioClient.instance.get(
      '/api/patients/appointments/availability/',
      queryParameters: {
        'doctor_id': doctorId,
        'start': _formatDate(start),
        'end': _formatDate(end),
      },
    );

    return AppointmentAvailability.fromJson(
      response.data as Map<String, dynamic>,
    );
  }

  Future<Appointment> requestAppointment({
    required String doctorId,
    required DateTime scheduledAt,
  }) async {
    final response = await DioClient.instance.post(
      '/api/patients/appointments/request/',
      data: {
        'doctor_id': doctorId,
        'scheduled_at': scheduledAt.toUtc().toIso8601String(),
      },
    );

    return Appointment.fromJson(response.data as Map<String, dynamic>);
  }

  Future<Appointment> requestCancellation({
    required String appointmentId,
    required String cancellationReason,
  }) async {
    final response = await DioClient.instance.post(
      '/api/patients/appointments/'
      '$appointmentId/cancel-request/',
      data: {'cancellation_reason': cancellationReason},
    );

    return Appointment.fromJson(response.data as Map<String, dynamic>);
  }

  Future<Appointment> requestChange({
    required String appointmentId,
    required DateTime newScheduledAt,
    required String reason,
  }) async {
    final response = await DioClient.instance.post(
      '/api/patients/appointments/'
      '$appointmentId/change-request/',
      data: {
        'new_scheduled_at': newScheduledAt.toUtc().toIso8601String(),
        'reason': reason,
      },
    );

    return Appointment.fromJson(response.data as Map<String, dynamic>);
  }

  String _formatDate(DateTime date) {
    final year = date.year.toString();
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');

    return '$year-$month-$day';
  }
}
