import 'package:dio/dio.dart';

import '../../../core/network/dio_client.dart';
import '../models/hospital_destination.dart';

class HospitalDirectionsException implements Exception {
  const HospitalDirectionsException(this.message);

  final String message;

  @override
  String toString() => message;
}

class HospitalDirectionsService {
  HospitalDirectionsService({Dio? dio}) : _dio = dio ?? DioClient.instance;

  final Dio _dio;

  Future<List<HospitalDestination>> getHospitals() async {
    try {
      final response = await _dio.get<List<dynamic>>(
        '/api/patients/hospitals/',
      );

      return (response.data ?? const [])
          .whereType<Map>()
          .where(
            (item) => item['latitude'] != null && item['longitude'] != null,
          )
          .map(
            (item) =>
                HospitalDestination.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList();
    } on DioException {
      throw const HospitalDirectionsException('병원 정보를 불러오지 못했습니다.');
    } on FormatException {
      throw const HospitalDirectionsException('병원 위치 정보가 올바르지 않습니다.');
    } on TypeError {
      throw const HospitalDirectionsException('병원 정보 응답을 해석하지 못했습니다.');
    }
  }
}
