import '../../../core/network/dio_client.dart';
import '../models/appointment.dart';

class AppointmentService {
  Future<List<Appointment>> getAppointments() async {
    final response = await DioClient.instance.get(
      '/api/patients/appointments/',
    );

    final List<dynamic> data = response.data as List<dynamic>;

    return data
        .map(
          (json) => Appointment.fromJson(
            json as Map<String, dynamic>,
          ),
        )
        .toList();
  }

  Future<Appointment> requestAppointment({
    String? doctorId,
    required DateTime scheduledAt,
  }) async {
    final response = await DioClient.instance.post(
      '/api/patients/appointments/request/',
      data: {
        'doctor_id': doctorId,
        'scheduled_at': scheduledAt.toIso8601String(),
      },
    );

    return Appointment.fromJson(
      response.data as Map<String, dynamic>,
    );
  }

  // 예약 취소 요청
  Future<Appointment> requestCancellation({
    required String appointmentId,
    String? cancellationReason,
  }) async {
    final response = await DioClient.instance.post(
      '/api/patients/appointments/$appointmentId/cancel-request/',
      data: {
        'cancellation_reason': cancellationReason ?? '',
      },
    );

    return Appointment.fromJson(
      response.data as Map<String, dynamic>,
    );
  }

  // 예약 변경 요청
  Future<Appointment> requestChange({
    required String appointmentId,
    String? doctorId,
    required DateTime newScheduledAt,
  }) async {
    final response = await DioClient.instance.post(
      '/api/patients/appointments/$appointmentId/change-request/',
      data: {
        'doctor_id': doctorId,
        'new_scheduled_at': newScheduledAt.toIso8601String(),
      },
    );

    return Appointment.fromJson(
      response.data as Map<String, dynamic>,
    );
  }
}