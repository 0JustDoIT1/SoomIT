import 'package:dio/dio.dart';
import 'package:patient_app/core/network/dio_client.dart';

class ChatbotService {
  final Dio _dio = DioClient.instance;

  Future<String> sendMessage({
    required String message,
    required List<Map<String, String>> history,
    required String accessToken,
  }) async {
    try {
      final response = await _dio.post(
        '/api/patient/chat/',
        data: {
          'message': message,
          'history': history,
        },
        options: Options(
          headers: {
            'Authorization': 'Bearer $accessToken',
          },
        ),
      );

      final data = response.data;

      if (data is Map<String, dynamic>) {
        final answer = data['answer'];

        if (answer is String) {
          return answer;
        }
      }

      throw Exception(
        '챗봇 응답 형식이 올바르지 않습니다.',
      );
    } on DioException catch (e) {
      final statusCode = e.response?.statusCode;

      if (statusCode == 400) {
        throw Exception(
          '질문 내용을 확인해주세요.',
        );
      }

      if (statusCode == 401) {
        throw Exception(
          '인증이 필요합니다.',
        );
      }

      if (statusCode == 502) {
        throw Exception(
          'AI 서비스에 연결할 수 없습니다.',
        );
      }

      if (statusCode == 503) {
        throw Exception(
          'AI 서비스가 아직 설정되지 않았습니다.',
        );
      }

      final responseData = e.response?.data;

      if (responseData is Map<String, dynamic>) {
        final detail = responseData['detail'];

        if (detail is String) {
          throw Exception(detail);
        }
      }

      throw Exception(
        '챗봇 요청 중 오류가 발생했습니다.',
      );
    }
  }
}