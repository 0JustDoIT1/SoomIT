import 'package:dio/dio.dart';

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
      if (data == null) {
        throw const AirQualityException('대기질 응답이 비어 있습니다.');
      }
      return AirQualityGuidance.fromJson(data);
    } on AirQualityException {
      rethrow;
    } on DioException catch (error) {
      final detail = error.response?.data is Map
          ? (error.response?.data as Map)['detail']
          : null;
      throw AirQualityException(
        detail is String && detail.isNotEmpty ? detail : '현재 대기질을 불러오지 못했습니다.',
      );
    } on TypeError {
      throw const AirQualityException('대기질 응답을 해석하지 못했습니다.');
    }
  }
}
