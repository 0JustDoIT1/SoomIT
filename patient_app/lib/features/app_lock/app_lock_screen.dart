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

  static const Color _primaryBlue = Color(0xFF3198F4);

  static const Color _strongBlue = Color(0xFF2F8DFE);

  static const Color _background = Color(0xFFF8FAFD);

  static const Color _textPrimary = Color(0xFF172033);

  static const Color _textSecondary = Color(0xFF6B7684);

  static const Color _borderColor = Color(0xFFDCE5F0);

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

    if (!mounted) {
      return;
    }

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

    if (!mounted) {
      return;
    }

    if (verified) {
      widget.onUnlocked();
      return;
    }

    setState(() {
      _checking = false;

      _errorMessage = 'PIN이 일치하지 않습니다. 다시 입력해주세요.';

      _pinController.clear();
    });
  }

  Future<void> _unlockWithBiometric() async {
    if (_checking) {
      return;
    }

    setState(() {
      _checking = true;
      _errorMessage = null;
    });

    final authenticated = await _biometricService.authenticate();

    if (!mounted) {
      return;
    }

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
        backgroundColor: _background,
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(30, 30, 30, 34),
              child: Column(
                children: [
                  // ===========================================
                  // 숨-잇 로고 + 슬로건
                  // ===========================================
                  Image.asset(
                    'assets/images/logo_full.png',
                    width: 165,
                    fit: BoxFit.contain,
                    errorBuilder: (context, error, stackTrace) {
                      return const SizedBox(height: 130);
                    },
                  ),

                  const SizedBox(height: 26),

                  // ===========================================
                  // 잠금 아이콘
                  // ===========================================
                  Container(
                    width: 72,
                    height: 72,
                    decoration: const BoxDecoration(
                      color: Color(0xFFEAF5FF),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.lock_outline_rounded,
                      size: 34,
                      color: _strongBlue,
                    ),
                  ),

                  const SizedBox(height: 20),

                  const Text(
                    '앱 잠금',
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      color: _textPrimary,
                    ),
                  ),

                  const SizedBox(height: 9),

                  const Text(
                    '건강 정보를 확인하려면\nPIN을 입력해주세요.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 15,
                      height: 1.5,
                      color: _textSecondary,
                    ),
                  ),

                  const SizedBox(height: 28),

                  // ===========================================
                  // PIN
                  // ===========================================
                  SizedBox(
                    width: double.infinity,
                    child: TextField(
                      controller: _pinController,
                      autofocus: !_biometricEnabled,
                      obscureText: true,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 24,
                        letterSpacing: 15,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF26385B),
                      ),
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(6),
                      ],
                      decoration: InputDecoration(
                        hintText: '••••••',
                        hintStyle: const TextStyle(
                          fontSize: 22,
                          letterSpacing: 14,
                          color: Color(0xFF8B95A1),
                        ),
                        counterText: '',
                        errorText: _errorMessage,
                        errorMaxLines: 2,
                        errorStyle: const TextStyle(
                          fontSize: 12,
                          height: 1.4,
                          color: Color(0xFFEF4444),
                        ),
                        filled: true,
                        fillColor: Colors.white,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 18,
                          vertical: 20,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(16),
                          borderSide: const BorderSide(color: _borderColor),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(16),
                          borderSide: const BorderSide(
                            color: _borderColor,
                            width: 1.2,
                          ),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(16),
                          borderSide: const BorderSide(
                            color: _primaryBlue,
                            width: 1.8,
                          ),
                        ),
                        errorBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(16),
                          borderSide: const BorderSide(
                            color: Color(0xFFEF4444),
                          ),
                        ),
                        focusedErrorBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(16),
                          borderSide: const BorderSide(
                            color: Color(0xFFEF4444),
                            width: 1.5,
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

                  const SizedBox(height: 18),

                  // ===========================================
                  // 잠금 해제
                  // ===========================================
                  SizedBox(
                    width: double.infinity,
                    height: 54,
                    child: FilledButton(
                      onPressed: _checking ? null : _unlockWithPin,
                      style: FilledButton.styleFrom(
                        backgroundColor: _primaryBlue,
                        disabledBackgroundColor: const Color(0xFFB8D9F7),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
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
                          : const Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  '잠금 해제',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                SizedBox(width: 8),
                                Icon(Icons.arrow_forward_rounded, size: 20),
                              ],
                            ),
                    ),
                  ),

                  if (_biometricEnabled) ...[
                    const SizedBox(height: 26),

                    const Row(
                      children: [
                        Expanded(child: Divider(color: Color(0xFFE0E7EF))),
                        Padding(
                          padding: EdgeInsets.symmetric(horizontal: 14),
                          child: Text(
                            '또는',
                            style: TextStyle(
                              fontSize: 13,
                              color: Color(0xFF8B95A1),
                            ),
                          ),
                        ),
                        Expanded(child: Divider(color: Color(0xFFE0E7EF))),
                      ],
                    ),

                    const SizedBox(height: 18),

                    // =========================================
                    // 지문
                    // =========================================
                    SizedBox(
                      width: double.infinity,
                      height: 56,
                      child: OutlinedButton.icon(
                        onPressed: _checking ? null : _unlockWithBiometric,
                        icon: const Icon(Icons.fingerprint_rounded, size: 28),
                        label: const Text(
                          '지문으로 잠금 해제',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        style: OutlinedButton.styleFrom(
                          backgroundColor: const Color(0xFFF1F7FF),
                          foregroundColor: _strongBlue,
                          side: BorderSide.none,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                      ),
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
