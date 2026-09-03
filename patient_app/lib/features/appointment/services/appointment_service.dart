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
}