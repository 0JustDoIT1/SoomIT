import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../core/network/dio_client.dart';

class DeviceTokenService {
  DeviceTokenService({Dio? dio}) : _dio = dio ?? DioClient.instance;

  final Dio _dio;

  Future<bool> registerToken(String token) async {
    if (token.isEmpty || !await DioClient.hasAccessToken()) {
      return false;
    }

    final platform = _platformName;

    if (platform == null) {
      return false;
    }

    try {
      await _dio.post(
        '/api/patients/device-tokens/',
        data: {'token': token, 'platform': platform},
      );

      debugPrint('FCM 토큰 서버 등록 완료');
      return true;
    } on DioException catch (error) {
      debugPrint(
        'FCM 토큰 서버 등록 실패: '
        '${error.response?.statusCode ?? error.type}',
      );
      return false;
    }
  }

  Future<bool> deactivateToken(String token) async {
    if (token.isEmpty || !await DioClient.hasAccessToken()) {
      return false;
    }

    try {
      await _dio.delete('/api/patients/device-tokens/', data: {'token': token});

      debugPrint('FCM 토큰 서버 비활성화 완료');
      return true;
    } on DioException catch (error) {
      debugPrint(
        'FCM 토큰 서버 비활성화 실패: '
        '${error.response?.statusCode ?? error.type}',
      );
      return false;
    }
  }

  String? get _platformName {
    if (kIsWeb) return null;

    return switch (defaultTargetPlatform) {
      TargetPlatform.android => 'ANDROID',
      TargetPlatform.iOS => 'IOS',
      _ => null,
    };
  }
}
