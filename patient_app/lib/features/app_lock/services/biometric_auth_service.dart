import 'package:local_auth/local_auth.dart';

class BiometricAuthService {
  BiometricAuthService._();

  static final BiometricAuthService instance = BiometricAuthService._();

  final LocalAuthentication _localAuthentication = LocalAuthentication();

  /// 기기에서 생체인증을 사용할 수 있는지 확인
  Future<bool> isAvailable() async {
    try {
      final isDeviceSupported = await _localAuthentication.isDeviceSupported();

      final canCheckBiometrics = await _localAuthentication.canCheckBiometrics;

      final availableBiometrics = await _localAuthentication
          .getAvailableBiometrics();

      return isDeviceSupported &&
          canCheckBiometrics &&
          availableBiometrics.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  /// 지문으로 앱 잠금 해제
  Future<bool> authenticate() async {
    try {
      return await _localAuthentication.authenticate(
        localizedReason: '숨-잇 앱 잠금을 해제해주세요.',
        biometricOnly: true,
        persistAcrossBackgrounding: true,
      );
    } catch (_) {
      return false;
    }
  }

  /// 진행 중인 생체인증 중단
  Future<void> stopAuthentication() async {
    try {
      await _localAuthentication.stopAuthentication();
    } catch (_) {
      // 이미 종료된 경우 별도로 처리하지 않습니다.
    }
  }
}
