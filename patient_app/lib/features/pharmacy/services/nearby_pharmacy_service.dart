import 'package:dio/dio.dart';

import '../../../core/network/dio_client.dart';
import '../models/nearby_pharmacy.dart';

class NearbyPharmacyException implements Exception {
  const NearbyPharmacyException(this.message);

  final String message;

  @override
  String toString() => message;
}

class NearbyPharmacyService {
  NearbyPharmacyService({
    Dio? dio,
  }) : _dio = dio ?? DioClient.instance;

  final Dio _dio;

  Future<List<NearbyPharmacy>> findNearby({
    required double latitude,
    required double longitude,
    int limit = 50,
  }) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/api/patients/nearby-pharmacies/',
        queryParameters: {
          'latitude': latitude,
          'longitude': longitude,
          'limit': limit,
        },
        options: Options(
          receiveTimeout: const Duration(seconds: 30),
        ),
      );

      final data = response.data;

      if (data == null) {
        throw const NearbyPharmacyException(
          '약국 조회 응답이 비어 있습니다.',
        );
      }

      final items = data['pharmacies'];

      if (items is! List) {
        throw const NearbyPharmacyException(
          '약국 조회 응답 형식이 올바르지 않습니다.',
        );
      }

      return items
          .whereType<Map>()
          .map(
            (item) => NearbyPharmacy.fromJson(
              Map<String, dynamic>.from(item),
            ),
          )
          .toList();

    } on NearbyPharmacyException {
      rethrow;

    } on DioException catch (error) {
      final statusCode = error.response?.statusCode;
      final responseData = error.response?.data;

      String? detail;

      if (responseData is Map) {
        final value = responseData['detail'];

        if (value is String && value.isNotEmpty) {
          detail = value;
        }
      }

      if (statusCode == 401) {
        throw const NearbyPharmacyException(
          '로그인이 필요합니다. 다시 로그인해 주세요.',
        );
      }

      if (statusCode == 403) {
        throw const NearbyPharmacyException(
          '약국 정보를 조회할 권한이 없습니다.',
        );
      }

      if (statusCode == 503) {
        throw NearbyPharmacyException(
          detail ?? '약국 조회 API 설정이 완료되지 않았습니다.',
        );
      }

      if (statusCode == 502) {
        throw NearbyPharmacyException(
          detail ?? '외부 약국 정보를 불러오지 못했습니다.',
        );
      }

      throw NearbyPharmacyException(
        detail ?? '약국 정보를 불러오지 못했습니다.',
      );

    } on FormatException {
      throw const NearbyPharmacyException(
        '약국 조회 응답을 해석하지 못했습니다.',
      );

    } on TypeError {
      throw const NearbyPharmacyException(
        '약국 조회 응답을 해석하지 못했습니다.',
      );
    }
  }
}