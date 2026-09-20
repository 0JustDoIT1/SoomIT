import 'package:local_auth/local_auth.dart';
import 'package:local_auth_android/local_auth_android.dart';

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

  /// 생체인증으로 앱 잠금 해제
  Future<bool> authenticate() async {
    try {
      return await _localAuthentication.authenticate(
        localizedReason: '본인 확인 후 숨-잇 앱 잠금을 해제해주세요.',
        biometricOnly: true,
        persistAcrossBackgrounding: true,
        authMessages: const <AuthMessages>[
          AndroidAuthMessages(
            signInTitle: '생체 인증',
            signInHint: '본인 확인',
            cancelButton: '취소',
          ),
        ],
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
      // 이미 종료된 경우 처리하지 않음
    }
  }
}
