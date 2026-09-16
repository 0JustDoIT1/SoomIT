import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class DioClient {
  DioClient._();

  static const String _baseUrl = String.fromEnvironment('API_BASE_URL');

  static const String _accessTokenKey = 'patient_access_token';

  static const FlutterSecureStorage _storage = FlutterSecureStorage();

  static final Dio instance = _createDio();

  static Future<bool> hasAccessToken() async {
    final accessToken = await _storage.read(key: _accessTokenKey);

    return accessToken != null && accessToken.isNotEmpty;
  }

  static Dio _createDio() {
    final dio = Dio(
      BaseOptions(
        baseUrl: _baseUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 10),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final accessToken = await _storage.read(key: _accessTokenKey);

          if (accessToken != null && accessToken.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $accessToken';
          }

          handler.next(options);
        },
      ),
    );

    return dio;
  }
}
