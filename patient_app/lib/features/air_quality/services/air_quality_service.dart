import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../core/network/dio_client.dart';
import '../models/air_quality_guidance.dart';

class AirQualityException implements Exception {
  const AirQualityException(this.message);

  final String message;

  @override
  String toString() => message;
}

class AirQualityService {
  AirQualityService({Dio? dio}) : _dio = dio ?? DioClient.instance;

  final Dio _dio;

  Future<AirQualityGuidance> getCurrent({
    required double latitude,
    required double longitude,
  }) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/api/patients/public/air-quality/',
        queryParameters: {'latitude': latitude, 'longitude': longitude},
        options: Options(receiveTimeout: const Duration(seconds: 30)),
      );

      final data = response.data;

      // 대기질 API 실제 응답 확인용
      debugPrint('대기질 API 응답: $data');

      if (data == null) {
        throw const AirQualityException('대기질 응답이 비어 있습니다.');
      }

      return AirQualityGuidance.fromJson(data);
    } on AirQualityException {
      rethrow;
    } on DioException catch (error) {
      final responseData = error.response?.data;

      final detail = responseData is Map ? responseData['detail'] : null;

      throw AirQualityException(
        detail is String && detail.isNotEmpty ? detail : '현재 대기질을 불러오지 못했습니다.',
      );
    } on TypeError catch (error) {
      debugPrint('대기질 응답 TypeError: $error');

      throw const AirQualityException('대기질 응답을 해석하지 못했습니다.');
    } catch (error) {
      debugPrint('대기질 조회 오류: $error');

      throw const AirQualityException('현재 대기질을 불러오지 못했습니다.');
    }
  }
}
