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
  NearbyPharmacyService({Dio? dio}) : _dio = dio ?? DioClient.instance;

  final Dio _dio;

  Future<List<NearbyPharmacy>> findNearby({
    required double latitude,
    required double longitude,
    int limit = 50,
  }) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/api/patients/public/nearby-pharmacies/',
        queryParameters: {
          'latitude': latitude,
          'longitude': longitude,
          'limit': limit,
        },
        options: Options(receiveTimeout: const Duration(seconds: 30)),
      );
      final items = response.data?['pharmacies'];
      if (items is! List) {
        throw const NearbyPharmacyException('약국 조회 응답 형식이 올바르지 않습니다.');
      }

      return items
          .whereType<Map>()
          .map(
            (item) => NearbyPharmacy.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList();
    } on NearbyPharmacyException {
      rethrow;
    } on DioException catch (error) {
      final detail = error.response?.data is Map
          ? (error.response?.data as Map)['detail']
          : null;
      throw NearbyPharmacyException(
        detail is String && detail.isNotEmpty ? detail : '약국 정보를 불러오지 못했습니다.',
      );
    } on FormatException {
      throw const NearbyPharmacyException('약국 조회 응답을 해석하지 못했습니다.');
    } on TypeError {
      throw const NearbyPharmacyException('약국 조회 응답을 해석하지 못했습니다.');
    }
  }
}
