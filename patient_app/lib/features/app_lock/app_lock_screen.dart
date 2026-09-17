import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'services/app_lock_service.dart';
import 'services/biometric_auth_service.dart';

class AppLockScreen extends StatefulWidget {
  final VoidCallback onUnlocked;

  const AppLockScreen({super.key, required this.onUnlocked});

  @override
  State<AppLockScreen> createState() => _AppLockScreenState();
}

class _AppLockScreenState extends State<AppLockScreen> {
  final TextEditingController _pinController = TextEditingController();

  final AppLockService _appLockService = AppLockService.instance;

  final BiometricAuthService _biometricService = BiometricAuthService.instance;

  bool _checking = false;
  bool _biometricEnabled = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initializeBiometric();
    });
  }

  @override
  void dispose() {
    _pinController.dispose();
    super.dispose();
  }

  Future<void> _initializeBiometric() async {
    final biometricEnabled = await _appLockService.isBiometricEnabled();

    final biometricAvailable = await _biometricService.isAvailable();

    if (!mounted) return;

    setState(() {
      _biometricEnabled = biometricEnabled && biometricAvailable;
    });

    if (_biometricEnabled) {
      await _unlockWithBiometric();
    }
  }

  Future<void> _unlockWithPin() async {
    if (_checking || _pinController.text.length != 6) {
      return;
    }

    setState(() {
      _checking = true;
      _errorMessage = null;
    });

    final verified = await _appLockService.verifyPin(_pinController.text);

    if (!mounted) return;

    if (verified) {
      widget.onUnlocked();
      return;
    }

    setState(() {
      _checking = false;
      _errorMessage = 'PIN이 일치하지 않습니다.';
      _pinController.clear();
    });
  }

  Future<void> _unlockWithBiometric() async {
    if (_checking) return;

    setState(() {
      _checking = true;
      _errorMessage = null;
    });

    final authenticated = await _biometricService.authenticate();

    if (!mounted) return;

    if (authenticated) {
      widget.onUnlocked();
      return;
    }

    setState(() {
      _checking = false;
      _errorMessage = '지문 인증을 완료하지 못했습니다. PIN을 입력해주세요.';
    });
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: const Color(0xFFF9F8FC),
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),
              child: Column(
                children: [
                  Container(
                    width: 76,
                    height: 76,
                    decoration: const BoxDecoration(
                      color: Color(0xFFF0EBFF),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.lock_outline_rounded,
                      size: 36,
                      color: Color(0xFF6D4FB3),
                    ),
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    '앱 잠금',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF191F28),
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    '건강 정보를 확인하려면\nPIN을 입력해주세요.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 14,
                      height: 1.5,
                      color: Color(0xFF6B7684),
                    ),
                  ),
                  const SizedBox(height: 32),
                  SizedBox(
                    width: 260,
                    child: TextField(
                      controller: _pinController,
                      autofocus: !_biometricEnabled,
                      obscureText: true,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 24,
                        letterSpacing: 12,
                        fontWeight: FontWeight.w700,
                      ),
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(6),
                      ],
                      decoration: InputDecoration(
                        hintText: '••••••',
                        counterText: '',
                        filled: true,
                        fillColor: Colors.white,
                        errorText: _errorMessage,
                        errorMaxLines: 2,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(
                            color: Color(0xFFDDE3EC),
                          ),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(
                            color: Color(0xFFDDE3EC),
                          ),
                        ),
                      ),
                      onChanged: (value) {
                        if (_errorMessage != null) {
                          setState(() {
                            _errorMessage = null;
                          });
                        }

                        if (value.length == 6) {
                          _unlockWithPin();
                        }
                      },
                      onSubmitted: (_) {
                        _unlockWithPin();
                      },
                    ),
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: 260,
                    height: 50,
                    child: FilledButton(
                      onPressed: _checking ? null : _unlockWithPin,
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF6D4FB3),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: _checking
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text(
                              '잠금 해제',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                    ),
                  ),
                  if (_biometricEnabled) ...[
                    const SizedBox(height: 16),
                    TextButton.icon(
                      onPressed: _checking ? null : _unlockWithBiometric,
                      icon: const Icon(Icons.fingerprint_rounded, size: 28),
                      label: const Text('지문으로 잠금 해제'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
