import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AppLockService {
  AppLockService._();

  static final AppLockService instance = AppLockService._();

  static const FlutterSecureStorage _storage = FlutterSecureStorage();

  static const String _pinHashKey = 'app_lock_pin_hash';
  static const String _pinSaltKey = 'app_lock_pin_salt';
  static const String _biometricEnabledKey = 'app_lock_biometric_enabled';

  /// 앱 잠금 PIN이 등록되어 있는지 확인
  Future<bool> isPinEnabled() async {
    final pinHash = await _storage.read(key: _pinHashKey);

    return pinHash != null && pinHash.isNotEmpty;
  }

  /// 6자리 PIN 등록 또는 변경
  Future<void> savePin(String pin) async {
    if (!RegExp(r'^\d{6}$').hasMatch(pin)) {
      throw ArgumentError('PIN은 숫자 6자리여야 합니다.');
    }

    final salt = _generateSalt();
    final pinHash = _hashPin(pin: pin, salt: salt);

    await _storage.write(key: _pinSaltKey, value: salt);

    await _storage.write(key: _pinHashKey, value: pinHash);
  }

  /// 입력한 PIN이 저장된 PIN과 일치하는지 확인
  Future<bool> verifyPin(String pin) async {
    final savedHash = await _storage.read(key: _pinHashKey);
    final savedSalt = await _storage.read(key: _pinSaltKey);

    if (savedHash == null || savedSalt == null) {
      return false;
    }

    final inputHash = _hashPin(pin: pin, salt: savedSalt);

    return _constantTimeEquals(savedHash, inputHash);
  }

  /// 앱 잠금 완전 해제
  Future<void> disableAppLock() async {
    await _storage.delete(key: _pinHashKey);
    await _storage.delete(key: _pinSaltKey);
    await _storage.delete(key: _biometricEnabledKey);
  }

  /// 생체인증 사용 여부 저장
  Future<void> setBiometricEnabled(bool enabled) async {
    await _storage.write(key: _biometricEnabledKey, value: enabled.toString());
  }

  /// 생체인증 사용 설정 확인
  Future<bool> isBiometricEnabled() async {
    final value = await _storage.read(key: _biometricEnabledKey);

    return value == 'true';
  }

  String _generateSalt() {
    final random = Random.secure();

    final bytes = List<int>.generate(32, (_) => random.nextInt(256));

    return base64UrlEncode(bytes);
  }

  String _hashPin({required String pin, required String salt}) {
    final bytes = utf8.encode('$salt:$pin');

    return sha256.convert(bytes).toString();
  }

  bool _constantTimeEquals(String first, String second) {
    if (first.length != second.length) {
      return false;
    }

    var difference = 0;

    for (var index = 0; index < first.length; index++) {
      difference |= first.codeUnitAt(index) ^ second.codeUnitAt(index);
    }

    return difference == 0;
  }
}
