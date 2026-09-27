import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../../core/network/dio_client.dart';
import '../../notification/firebase_messaging_service.dart';
import '../models/patient_registration_data.dart';
import 'google_auth_service.dart';
import 'kakao_auth_service.dart';

class PatientGoogleLoginResult {
  final bool registrationRequired;
  final String? registrationToken;
  final String? prefilledName;
  final String? email;
  final String? linkStatus;
  final bool isLinked;

  const PatientGoogleLoginResult({
    required this.registrationRequired,
    required this.isLinked,
    this.registrationToken,
    this.prefilledName,
    this.email,
    this.linkStatus,
  });
}

class PatientAuthService {
  static const String _accessTokenKey =
      'patient_access_token';

  static const String _refreshTokenKey =
      'patient_refresh_token';

  final Dio _dio = DioClient.instance;

  final GoogleAuthService _googleAuthService =
      GoogleAuthService();

  final KakaoAuthService _kakaoAuthService =
      const KakaoAuthService();

  final FlutterSecureStorage _storage =
      const FlutterSecureStorage();

  // =========================================================
  // Google 로그인
  // =========================================================

  Future<PatientGoogleLoginResult>
      loginWithGoogle() async {
    final googleIdToken =
        await _googleAuthService.signInAndGetIdToken();

    try {
      final response = await _dio.post(
        '/api/patients/auth/google/',
        data: {
          'id_token': googleIdToken,
        },
      );

      return _handleSocialLoginResponse(
        response.data,
      );
    } on DioException catch (error) {
      throw Exception(
        _extractErrorMessage(
          error,
          fallbackMessage:
              'Google 로그인 서버에 연결할 수 없습니다.',
        ),
      );
    }
  }

  // =========================================================
  // Kakao 로그인
  // =========================================================

  Future<PatientGoogleLoginResult>
      loginWithKakao() async {
    // 카카오 SDK 로그인
    final kakaoToken =
        await _kakaoAuthService.login();

    try {
      final response = await _dio.post(
        '/api/patients/auth/kakao/',
        data: {
          // Django에서 카카오 API를 통해
          // 실제 사용자 정보를 검증할 때 사용
          'access_token':
              kakaoToken.accessToken,
        },
      );

      return _handleSocialLoginResponse(
        response.data,
      );
    } on DioException catch (error) {
      throw Exception(
        _extractErrorMessage(
          error,
          fallbackMessage:
              '카카오 로그인 서버에 연결할 수 없습니다.',
        ),
      );
    }
  }

  // =========================================================
  // 소셜 로그인 공통 응답 처리
  // =========================================================

  Future<PatientGoogleLoginResult>
      _handleSocialLoginResponse(
    dynamic responseData,
  ) async {
    if (responseData is! Map<String, dynamic>) {
      throw Exception(
        '로그인 응답 형식이 올바르지 않습니다.',
      );
    }

    final responseStatus =
        responseData['status'];

    // ---------------------------------------------------------
    // 신규 사용자
    // ---------------------------------------------------------

    if (responseStatus ==
        'REGISTRATION_REQUIRED') {
      final registrationToken =
          responseData['registration_token'];

      if (registrationToken is! String ||
          registrationToken.isEmpty) {
        throw Exception(
          '회원가입 인증정보가 없습니다.',
        );
      }

      final profile =
          responseData['profile'];

      String? name;
      String? email;

      if (profile is Map<String, dynamic>) {
        name =
            profile['name'] as String?;

        email =
            profile['email'] as String?;
      }

      return PatientGoogleLoginResult(
        registrationRequired:
            true,
        registrationToken:
            registrationToken,
        prefilledName:
            name,
        email:
            email,
        isLinked:
            false,
      );
    }

    // ---------------------------------------------------------
    // 기존 사용자
    // ---------------------------------------------------------

    if (responseStatus ==
        'AUTHENTICATED') {
      final accessToken =
          responseData['access'];

      final refreshToken =
          responseData['refresh'];

      if (accessToken is! String ||
          accessToken.isEmpty ||
          refreshToken is! String ||
          refreshToken.isEmpty) {
        throw Exception(
          '로그인 토큰이 없습니다.',
        );
      }

      await _saveTokens(
        accessToken:
            accessToken,
        refreshToken:
            refreshToken,
      );

      final patientAccount =
          responseData['patient_account'];

      String? linkStatus;
      var isLinked = false;

      if (patientAccount
          is Map<String, dynamic>) {
        linkStatus =
            patientAccount['link_status']
                as String?;

        isLinked =
            patientAccount['is_linked'] ==
                true;
      }

      return PatientGoogleLoginResult(
        registrationRequired:
            false,
        linkStatus:
            linkStatus,
        isLinked:
            isLinked,
      );
    }

    throw Exception(
      '알 수 없는 로그인 상태입니다.',
    );
  }

  // =========================================================
  // 환자 회원가입
  // =========================================================

  Future<void> registerPatient(
    PatientRegistrationData
        registrationData,
  ) async {
    try {
      final response = await _dio.post(
        '/api/patients/auth/register/',
        data:
            registrationData.toJson(),
      );

      final data =
          response.data;

      if (data is! Map<String, dynamic>) {
        throw Exception(
          '회원가입 응답 형식이 올바르지 않습니다.',
        );
      }

      if (data['status'] !=
          'REGISTERED') {
        throw Exception(
          '알 수 없는 회원가입 상태입니다.',
        );
      }

      final accessToken =
          data['access'];

      final refreshToken =
          data['refresh'];

      if (accessToken is! String ||
          accessToken.isEmpty ||
          refreshToken is! String ||
          refreshToken.isEmpty) {
        throw Exception(
          '회원가입 인증 토큰이 없습니다.',
        );
      }

      await _saveTokens(
        accessToken:
            accessToken,
        refreshToken:
            refreshToken,
      );
    } on DioException catch (error) {
      throw Exception(
        _extractErrorMessage(
          error,
          fallbackMessage:
              '회원가입 서버에 연결할 수 없습니다.',
        ),
      );
    }
  }

  // =========================================================
  // JWT 저장
  // =========================================================

  Future<void> _saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await Future.wait([
      _storage.write(
        key:
            _accessTokenKey,
        value:
            accessToken,
      ),
      _storage.write(
        key:
            _refreshTokenKey,
        value:
            refreshToken,
      ),
    ]);

    // 로그인 성공 후 현재 FCM 토큰 등록
    await FirebaseMessagingService
        .instance
        .registerCurrentToken();
  }

  // =========================================================
  // API 오류 메시지
  // =========================================================

  String _extractErrorMessage(
    DioException error, {
    required String fallbackMessage,
  }) {
    final responseData =
        error.response?.data;

    if (responseData
        is Map<String, dynamic>) {
      final detail =
          responseData['detail'];

      if (detail is String &&
          detail.isNotEmpty) {
        return detail;
      }

      for (final value
          in responseData.values) {
        if (value is List &&
            value.isNotEmpty) {
          return value.first.toString();
        }

        if (value is String &&
            value.isNotEmpty) {
          return value;
        }
      }
    }

    return fallbackMessage;
  }

  // =========================================================
  // 환자 코드 연결
  // =========================================================

  Future<void> linkPatient({
    required String patientCode,
  }) async {
    try {
      final response = await _dio.post(
        '/api/patients/auth/patient-link/',
        data: {
          'patient_code':
              patientCode
                  .trim()
                  .toUpperCase(),
        },
      );

      final data =
          response.data;

      if (data
              is! Map<String, dynamic> ||
          data['status'] !=
              'LINKED') {
        throw Exception(
          '환자정보 연결 응답이 올바르지 않습니다.',
        );
      }

      final accessToken =
          data['access'];

      final refreshToken =
          data['refresh'];

      if (accessToken is! String ||
          accessToken.isEmpty ||
          refreshToken is! String ||
          refreshToken.isEmpty) {
        throw Exception(
          '연결 후 인증 토큰이 없습니다.',
        );
      }

      await _saveTokens(
        accessToken:
            accessToken,
        refreshToken:
            refreshToken,
      );
    } on DioException catch (error) {
      throw Exception(
        _extractErrorMessage(
          error,
          fallbackMessage:
              '환자정보 연결에 실패했습니다.',
        ),
      );
    }
  }

  // =========================================================
  // 저장된 세션 갱신
  // =========================================================

  Future<bool>
      refreshStoredSession() async {
    final refreshToken =
        await _storage.read(
      key:
          _refreshTokenKey,
    );

    if (refreshToken == null ||
        refreshToken.isEmpty) {
      return false;
    }

    try {
      final response =
          await _dio.post(
        '/api/patients/auth/token/refresh/',
        data: {
          'refresh':
              refreshToken,
        },
      );

      final data =
          response.data;

      if (data
              is! Map<String, dynamic> ||
          data['status'] !=
              'TOKEN_REFRESHED') {
        return false;
      }

      final newAccessToken =
          data['access'];

      final newRefreshToken =
          data['refresh'];

      if (newAccessToken is! String ||
          newAccessToken.isEmpty ||
          newRefreshToken is! String ||
          newRefreshToken.isEmpty) {
        return false;
      }

      await _saveTokens(
        accessToken:
            newAccessToken,
        refreshToken:
            newRefreshToken,
      );

      return true;
    } on DioException catch (error) {
      final statusCode =
          error.response?.statusCode;

      if (statusCode == 401 ||
          statusCode == 403) {
        await _deleteStoredTokens();

        return false;
      }

      // 서버 연결이 일시적으로 안 되면
      // 기존 access token으로 진입 시도
      final accessToken =
          await getAccessToken();

      return accessToken != null &&
          accessToken.isNotEmpty;
    }
  }

  // =========================================================
  // JWT 삭제
  // =========================================================

  Future<void>
      _deleteStoredTokens() async {
    await Future.wait([
      _storage.delete(
        key:
            _accessTokenKey,
      ),
      _storage.delete(
        key:
            _refreshTokenKey,
      ),
    ]);
  }

  // =========================================================
  // Access Token 조회
  // =========================================================

  Future<String?>
      getAccessToken() {
    return _storage.read(
      key:
          _accessTokenKey,
    );
  }

  // =========================================================
  // 로그아웃
  // =========================================================

  Future<void> logout() async {
    await FirebaseMessagingService
        .instance
        .deactivateCurrentToken();

    await _deleteStoredTokens();

    // Google 로그아웃
    try {
      await _googleAuthService
          .signOut();
    } catch (_) {
      // Google SDK 로그아웃 실패해도
      // 로컬 로그아웃은 정상 처리
    }

    // Kakao 로그아웃
    try {
      await _kakaoAuthService
          .logout();
    } catch (_) {
      // Kakao SDK 로그아웃 실패해도
      // 로컬 로그아웃은 정상 처리
    }
  }
}