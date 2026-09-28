import 'package:flutter/foundation.dart';
import 'package:kakao_flutter_sdk_user/kakao_flutter_sdk_user.dart';

class KakaoAuthService {
  const KakaoAuthService();

  Future<OAuthToken> login() async {
    try {
      final token = await UserApi.instance.loginWithKakaoAccount();

      debugPrint('카카오계정 로그인 성공');
      debugPrint('accessToken 존재: ${token.accessToken.isNotEmpty}');

      return token;
    } catch (e, stackTrace) {
      debugPrint('카카오계정 로그인 실패: $e');

      debugPrintStack(stackTrace: stackTrace);

      rethrow;
    }
  }

  Future<User> getCurrentUser() async {
    final user = await UserApi.instance.me();

    debugPrint('카카오 사용자 ID: ${user.id}');

    return user;
  }

  Future<void> logout() async {
    await UserApi.instance.logout();
  }
}
