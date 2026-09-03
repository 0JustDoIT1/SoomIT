import 'package:dio/dio.dart';

class DioClient {
  DioClient._();

  static final Dio instance = Dio(
    BaseOptions(
      // Flutter Web + 로컬 Django 서버
      baseUrl: 'http://127.0.0.1:8000',

      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),

      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ),
  );
}