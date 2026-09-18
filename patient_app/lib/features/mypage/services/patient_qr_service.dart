import '../../../core/network/dio_client.dart';

class PatientQrToken {
  final String token;
  final DateTime expiresAt;
  final int expiresInSeconds;

  const PatientQrToken({
    required this.token,
    required this.expiresAt,
    required this.expiresInSeconds,
  });

  factory PatientQrToken.fromJson(Map<String, dynamic> json) {
    return PatientQrToken(
      token: json['token'] as String,
      expiresAt: DateTime.parse(json['expires_at'] as String),
      expiresInSeconds: json['expires_in_seconds'] as int,
    );
  }
}

class PatientQrService {
  Future<PatientQrToken> createQrToken() async {
    final response = await DioClient.instance.post(
      '/api/patients/qr-token/',
      data: const {},
    );

    return PatientQrToken.fromJson(
      response.data as Map<String, dynamic>,
    );
  }
}
