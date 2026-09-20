import 'dart:async';

import 'package:flutter/material.dart';

import 'services/app_lock_service.dart';
import 'services/biometric_auth_service.dart';

class AppLockScreen extends StatefulWidget {
  final VoidCallback onUnlocked;

  const AppLockScreen({
    super.key,
    required this.onUnlocked,
  });

  @override
  State<AppLockScreen> createState() => _AppLockScreenState();
}

class _AppLockScreenState extends State<AppLockScreen> {
  final AppLockService _appLockService = AppLockService.instance;

  final BiometricAuthService _biometricService =
      BiometricAuthService.instance;

  String _pin = '';

  bool _checking = false;
  bool _biometricEnabled = false;

  String? _errorMessage;

  static const int _maxFailedAttempts = 5;
  static const int _lockDurationSeconds = 30;

  int _failedAttempts = 0;
  int _remainingLockSeconds = 0;

  Timer? _lockTimer;

  late List<String> _keypadNumbers;

  static const Color _primaryBlue = Color(0xFF3198F4);
  static const Color _strongBlue = Color(0xFF2F8DFE);

  static const Color _background = Color(0xFFF8FAFD);

  static const Color _textPrimary = Color(0xFF172033);
  static const Color _textSecondary = Color(0xFF6B7684);

  static const Color _borderColor = Color(0xFFDCE5F0);

  static const Color _errorColor = Color(0xFFEF4444);

  bool get _isPinLocked => _remainingLockSeconds > 0;

  bool get _canUseKeypad => !_checking && !_isPinLocked;

  @override
  void initState() {
    super.initState();

    _keypadNumbers = _createRandomKeypad();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initializeBiometric();
    });
  }

  @override
  void dispose() {
    _lockTimer?.cancel();

    super.dispose();
  }

  // =========================================================
  // 숫자만 랜덤 변경
  // =========================================================
  List<String> _createRandomKeypad() {
    final numbers = <String>[
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ];

    numbers.shuffle();

    return numbers;
  }

  // =========================================================
  // 숫자 입력
  // =========================================================
  void _pressDigit(String digit) {
    if (!_canUseKeypad) {
      return;
    }

    if (_pin.length >= 6) {
      return;
    }

    final nextPin = '$_pin$digit';

    setState(() {
      _pin = nextPin;
      _errorMessage = null;
    });

    if (nextPin.length == 6) {
      Future.microtask(_unlockWithPin);
    }
  }

  // =========================================================
  // 삭제
  // =========================================================
  void _deleteDigit() {
    if (!_canUseKeypad) {
      return;
    }

    if (_pin.isEmpty) {
      return;
    }

    setState(() {
      _pin = _pin.substring(
        0,
        _pin.length - 1,
      );

      _errorMessage = null;
    });
  }

  // =========================================================
  // PIN 검증
  // =========================================================
  Future<void> _unlockWithPin() async {
    if (_checking || _isPinLocked || _pin.length != 6) {
      return;
    }

    final pinToVerify = _pin;

    setState(() {
      _checking = true;
      _errorMessage = null;
    });

    try {
      final verified =
          await _appLockService.verifyPin(pinToVerify);

      if (!mounted) {
        return;
      }

      if (verified) {
        _lockTimer?.cancel();

        _failedAttempts = 0;
        _remainingLockSeconds = 0;

        widget.onUnlocked();

        return;
      }

      final nextFailedAttempts = _failedAttempts + 1;

      if (nextFailedAttempts >= _maxFailedAttempts) {
        setState(() {
          _checking = false;

          _failedAttempts = nextFailedAttempts;

          _pin = '';

          _keypadNumbers = _createRandomKeypad();

          _errorMessage =
              'PIN을 $_maxFailedAttempts회 잘못 입력했습니다.';
        });

        _startPinLock();

        return;
      }

      final remainingAttempts =
          _maxFailedAttempts - nextFailedAttempts;

      setState(() {
        _checking = false;

        _failedAttempts = nextFailedAttempts;

        _pin = '';

        // 버튼은 그대로, 숫자만 변경
        _keypadNumbers = _createRandomKeypad();

        _errorMessage =
            'PIN이 일치하지 않습니다. \n'
            '$remainingAttempts회 살패사 30초 동안 입력이 제한됩니다.';
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _checking = false;

        _pin = '';

        _keypadNumbers = _createRandomKeypad();

        _errorMessage =
            'PIN을 확인하는 중 문제가 발생했습니다. 다시 시도해주세요.';
      });
    }
  }

  // =========================================================
  // 5회 실패 → 30초 잠금
  // =========================================================
  void _startPinLock() {
    _lockTimer?.cancel();

    setState(() {
      _remainingLockSeconds = _lockDurationSeconds;

      _pin = '';
    });

    _lockTimer = Timer.periodic(
      const Duration(seconds: 1),
      (timer) {
        if (!mounted) {
          timer.cancel();

          return;
        }

        if (_remainingLockSeconds <= 1) {
          timer.cancel();

          setState(() {
            _remainingLockSeconds = 0;

            _failedAttempts = 0;

            _pin = '';

            _keypadNumbers = _createRandomKeypad();

            _errorMessage = null;
          });

          return;
        }

        setState(() {
          _remainingLockSeconds--;
        });
      },
    );
  }

  // =========================================================
  // 지문 초기화
  // =========================================================
  Future<void> _initializeBiometric() async {
    final biometricEnabled =
        await _appLockService.isBiometricEnabled();

    final biometricAvailable =
        await _biometricService.isAvailable();

    if (!mounted) {
      return;
    }

    setState(() {
      _biometricEnabled =
          biometricEnabled && biometricAvailable;
    });

    if (_biometricEnabled) {
      await _unlockWithBiometric();
    }
  }

  // =========================================================
  // 지문 인증
  // =========================================================
  Future<void> _unlockWithBiometric() async {
    if (_checking) {
      return;
    }

    setState(() {
      _checking = true;
      _errorMessage = null;
    });

    final authenticated =
        await _biometricService.authenticate();

    if (!mounted) {
      return;
    }

    if (authenticated) {
      _lockTimer?.cancel();

      widget.onUnlocked();

      return;
    }

    setState(() {
      _checking = false;

      if (_isPinLocked) {
        _errorMessage =
            '지문 인증을 완료하지 못했습니다. '
            'PIN 입력 제한이 해제된 후 다시 시도할 수 있습니다.';
      } else {
        _errorMessage =
            '지문 인증을 완료하지 못했습니다. '
            'PIN을 입력해주세요.';
      }
    });
  }

  // =========================================================
  // 화면
  // =========================================================
  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: _background,

        resizeToAvoidBottomInset: false,

        body: SafeArea(
          child: LayoutBuilder(
            builder: (
              context,
              constraints,
            ) {
              final bool compact =
                  constraints.maxHeight < 730;

              // ===========================================
              // 핵심
              //
              // 전체 UI를 이전보다 아래로 내림.
              // ===========================================
              final double topSpace =
                  compact ? 46 : 86;

              // 숫자 버튼 크게
              final double buttonSize =
                  compact ? 70 : 82;

              final double horizontalGap =
                  compact ? 18 : 22;

              final double verticalGap =
                  compact ? 9 : 12;

              final double keypadHeight =
                  (buttonSize * 4) +
                      (verticalGap * 3);

              return SizedBox.expand(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24,
                  ),
                  child: Column(
                    children: [
                      // =====================================
                      // 위 공간
                      // =====================================
                      SizedBox(
                        height: topSpace,
                      ),

                      // =====================================
                      // 제목
                      // =====================================
                      _buildHeader(compact),

                      SizedBox(
                        height: compact ? 20 : 24,
                      ),

                      // =====================================
                      // PIN 점
                      // =====================================
                      _buildPinDots(),

                      const SizedBox(height: 8),

                      // =====================================
                      // 상태 영역
                      //
                      // 메시지가 나타나도 다른 UI가
                      // 움직이지 않도록 높이 고정
                      // =====================================
                      SizedBox(
                        height: compact ? 46 : 52,
                        child: Center(
                          child: AnimatedSwitcher(
                            duration: const Duration(
                              milliseconds: 180,
                            ),
                            child: _buildStatusArea(),
                          ),
                        ),
                      ),

                      SizedBox(
                        height: compact ? 8 : 12,
                      ),

                      // =====================================
                      // 키패드
                      //
                      // Expanded 아님.
                      // 딱 필요한 크기만 사용.
                      // =====================================
                      SizedBox(
                        height: keypadHeight,
                        child: AnimatedOpacity(
                          duration: const Duration(
                            milliseconds: 180,
                          ),
                          opacity:
                              _canUseKeypad ? 1 : 0.42,
                          child: _buildFixedKeypad(
                            buttonSize: buttonSize,
                            horizontalGap:
                                horizontalGap,
                            verticalGap:
                                verticalGap,
                          ),
                        ),
                      ),

                      // =====================================
                      // 남는 공간은 키패드 아래
                      // =====================================
                      const Spacer(),

                      // =====================================
                      // 지문 버튼
                      //
                      // 지문 기능이 없더라도 공간은
                      // 확보해서 위쪽 UI가 흔들리지 않음
                      // =====================================
                      SizedBox(
                        height: 54,
                        child: _biometricEnabled
                            ? _buildBiometricButton()
                            : const SizedBox(),
                      ),

                      SizedBox(
                        height: compact ? 10 : 18,
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  // =========================================================
  // 상단
  // =========================================================
  Widget _buildHeader(bool compact) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: compact ? 54 : 60,
          height: compact ? 54 : 60,
          decoration: const BoxDecoration(
            color: Color(0xFFEAF5FF),
            shape: BoxShape.circle,
          ),
          child: Icon(
            Icons.lock_outline_rounded,
            size: compact ? 28 : 31,
            color: _strongBlue,
          ),
        ),

        SizedBox(
          height: compact ? 13 : 15,
        ),

        Text(
          'PIN 번호를 입력해주세요',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: compact ? 22 : 24,
            fontWeight: FontWeight.w800,
            color: _textPrimary,
            letterSpacing: -0.5,
          ),
        ),

        const SizedBox(height: 6),

        Text(
          '앱 잠금 해제를 위해 6자리 PIN을 입력해주세요.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: compact ? 13 : 14,
            height: 1.35,
            color: _textSecondary,
          ),
        ),
      ],
    );
  }

  // =========================================================
  // PIN 점
  // =========================================================
  Widget _buildPinDots() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(
        6,
        (index) {
          final filled = index < _pin.length;

          return AnimatedContainer(
            duration: const Duration(
              milliseconds: 120,
            ),
            width: 15,
            height: 15,
            margin: const EdgeInsets.symmetric(
              horizontal: 7,
            ),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: filled
                  ? _primaryBlue
                  : Colors.transparent,
              border: Border.all(
                color: filled
                    ? _primaryBlue
                    : const Color(0xFFD8E0EA),
                width: 2,
              ),
            ),
          );
        },
      ),
    );
  }

  // =========================================================
  // 상태 영역
  // =========================================================
  Widget _buildStatusArea() {
    if (_checking) {
      return const SizedBox(
        key: ValueKey('checking'),
        width: 22,
        height: 22,
        child: CircularProgressIndicator(
          strokeWidth: 2.2,
          color: _primaryBlue,
        ),
      );
    }

    if (_isPinLocked) {
      return Container(
        key: const ValueKey('locked'),
        constraints: const BoxConstraints(
          maxWidth: 340,
        ),
        padding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 7,
        ),
        decoration: BoxDecoration(
          color: const Color(0xFFFFF3F2),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: const Color(0xFFFFD7D4),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.timer_outlined,
              color: _errorColor,
              size: 18,
            ),

            const SizedBox(width: 7),

            Flexible(
              child: Text(
                'PIN 입력이 잠겼습니다. '
                '$_remainingLockSeconds초 후 다시 시도해주세요.',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 12,
                  height: 1.3,
                  fontWeight: FontWeight.w600,
                  color: _errorColor,
                ),
              ),
            ),
          ],
        ),
      );
    }

    if (_errorMessage != null) {
      return Container(
        key: ValueKey(_errorMessage),
        constraints: const BoxConstraints(
          maxWidth: 350,
        ),
        alignment: Alignment.center,
        child: Text(
          _errorMessage!,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 12,
            height: 1.3,
            color: _errorColor,
            fontWeight: FontWeight.w600,
          ),
        ),
      );
    }

    return const SizedBox(
      key: ValueKey('normal'),
    );
  }

  // =========================================================
  // 키패드
  // =========================================================
  Widget _buildFixedKeypad({
    required double buttonSize,
    required double horizontalGap,
    required double verticalGap,
  }) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildKeypadRow(
            numbers: [
              _keypadNumbers[0],
              _keypadNumbers[1],
              _keypadNumbers[2],
            ],
            buttonSize: buttonSize,
            gap: horizontalGap,
          ),

          SizedBox(
            height: verticalGap,
          ),

          _buildKeypadRow(
            numbers: [
              _keypadNumbers[3],
              _keypadNumbers[4],
              _keypadNumbers[5],
            ],
            buttonSize: buttonSize,
            gap: horizontalGap,
          ),

          SizedBox(
            height: verticalGap,
          ),

          _buildKeypadRow(
            numbers: [
              _keypadNumbers[6],
              _keypadNumbers[7],
              _keypadNumbers[8],
            ],
            buttonSize: buttonSize,
            gap: horizontalGap,
          ),

          SizedBox(
            height: verticalGap,
          ),

          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              // 왼쪽 빈칸 고정
              SizedBox(
                width: buttonSize,
                height: buttonSize,
              ),

              SizedBox(
                width: horizontalGap,
              ),

              // 마지막 숫자
              SizedBox(
                width: buttonSize,
                height: buttonSize,
                child: _buildNumberButton(
                  _keypadNumbers[9],
                ),
              ),

              SizedBox(
                width: horizontalGap,
              ),

              // 삭제 고정
              SizedBox(
                width: buttonSize,
                height: buttonSize,
                child: _buildDeleteButton(),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // =========================================================
  // 키패드 한 줄
  // =========================================================
  Widget _buildKeypadRow({
    required List<String> numbers,
    required double buttonSize,
    required double gap,
  }) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: buttonSize,
          height: buttonSize,
          child: _buildNumberButton(
            numbers[0],
          ),
        ),

        SizedBox(width: gap),

        SizedBox(
          width: buttonSize,
          height: buttonSize,
          child: _buildNumberButton(
            numbers[1],
          ),
        ),

        SizedBox(width: gap),

        SizedBox(
          width: buttonSize,
          height: buttonSize,
          child: _buildNumberButton(
            numbers[2],
          ),
        ),
      ],
    );
  }

  // =========================================================
  // 숫자 버튼
  // =========================================================
  Widget _buildNumberButton(
    String number,
  ) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: _canUseKeypad
            ? () {
                _pressDigit(number);
              }
            : null,

        customBorder: const CircleBorder(),

        // 출렁이는 느낌 제거
        splashFactory: NoSplash.splashFactory,

        highlightColor:
            _primaryBlue.withValues(
          alpha: 0.07,
        ),

        child: Ink(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.white,
            border: Border.all(
              color: _borderColor,
              width: 1.2,
            ),
            boxShadow: [
              BoxShadow(
                color:
                    const Color(0xFF1D4D7A)
                        .withValues(
                  alpha: 0.045,
                ),
                blurRadius: 12,
                offset: const Offset(
                  0,
                  4,
                ),
              ),
            ],
          ),
          child: Center(
            child: Text(
              number,
              style: const TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w700,
                color: _textPrimary,
              ),
            ),
          ),
        ),
      ),
    );
  }

  // =========================================================
  // 삭제
  // =========================================================
  Widget _buildDeleteButton() {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap:
            _canUseKeypad ? _deleteDigit : null,

        customBorder: const CircleBorder(),

        splashFactory: NoSplash.splashFactory,

        highlightColor:
            _primaryBlue.withValues(
          alpha: 0.05,
        ),

        child: Center(
          child: Icon(
            Icons.backspace_outlined,
            size: 29,
            color: _canUseKeypad
                ? _textPrimary
                : const Color(0xFFB7C0CB),
          ),
        ),
      ),
    );
  }

  // =========================================================
  // 지문 버튼
  // =========================================================
  Widget _buildBiometricButton() {
    return SizedBox(
      width: 310,
      height: 54,
      child: OutlinedButton.icon(
        onPressed:
            _checking ? null : _unlockWithBiometric,

        icon: const Icon(
          Icons.fingerprint_rounded,
          size: 26,
        ),

        label: const Text(
          '지문으로 잠금 해제',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
          ),
        ),

        style: OutlinedButton.styleFrom(
          backgroundColor:
              const Color(0xFFF1F7FF),

          foregroundColor: _strongBlue,

          disabledForegroundColor:
              const Color(0xFF9FB9D0),

          side: BorderSide.none,

          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(
              16,
            ),
          ),
        ),
      ),
    );
  }
}