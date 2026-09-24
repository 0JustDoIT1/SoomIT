import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

class SplashScreen extends StatefulWidget {
  final VoidCallback? onFinished;

  const SplashScreen({
    super.key,
    this.onFinished,
  });

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  // 캐릭터 등장
  late final Animation<double> _enterOpacity;
  late final Animation<double> _enterScale;
  late final Animation<double> _enterY;

  // 캐릭터 포즈
  late final Animation<double> _waveOpacity;
  late final Animation<double> _prepareOpacity;
  late final Animation<double> _blowOpacity;

  // 캐릭터 전체 이동 / 퇴장
  late final Animation<double> _characterX;
  late final Animation<double> _characterY;
  late final Animation<double> _characterScale;
  late final Animation<double> _characterOpacity;

  // 바람
  late final Animation<double> _windShortOpacity;
  late final Animation<double> _windMiddleOpacity;
  late final Animation<double> _windLongOpacity;

  late final Animation<double> _windShortScale;
  late final Animation<double> _windMiddleScale;
  late final Animation<double> _windLongScale;

  late final Animation<double> _windShortX;
  late final Animation<double> _windMiddleX;
  late final Animation<double> _windLongX;

  // 잎
  late final Animation<double> _leafOpacity;
  late final Animation<double> _leafProgress;

  // 큰 바람 배경
  late final Animation<double> _swirlOpacity;
  late final Animation<double> _swirlScale;
  late final Animation<double> _swirlX;

  // 로고
  late final Animation<double> _logoOpacity;
  late final Animation<double> _logoScale;
  late final Animation<double> _logoY;

  // 슬로건
  late final Animation<double> _taglineOpacity;
  late final Animation<double> _taglineY;

  // 반짝이
  late final Animation<double> _sparkleOpacity;

  Timer? _finishTimer;

  @override
  void initState() {
    super.initState();

    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 6800),
    );

    _setupAnimations();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _start();
    });
  }

  Future<void> _start() async {
    await Future.wait([
      precacheImage(
        const AssetImage('assets/images/splash/soomi_wave.png'),
        context,
      ),
      precacheImage(
        const AssetImage('assets/images/splash/soomi_prepare.png'),
        context,
      ),
      precacheImage(
        const AssetImage('assets/images/splash/soomi_blow.png'),
        context,
      ),
      precacheImage(
        const AssetImage('assets/images/splash/wind_short.png'),
        context,
      ),
      precacheImage(
        const AssetImage('assets/images/splash/wind_middle.png'),
        context,
      ),
      precacheImage(
        const AssetImage('assets/images/splash/wind_long.png'),
        context,
      ),
      precacheImage(
        const AssetImage('assets/images/splash/leaf.png'),
        context,
      ),
      precacheImage(
        const AssetImage('assets/images/splash/bg_swirl.png'),
        context,
      ),
      precacheImage(
        const AssetImage('assets/images/splash/logo_full.png'),
        context,
      ),
    ]);

    if (!mounted) return;

    await _controller.forward();

    if (!mounted) return;

    _finishTimer = Timer(
      const Duration(milliseconds: 900),
      () {
        if (!mounted) return;
        widget.onFinished?.call();
      },
    );
  }

  void _setupAnimations() {
    // =========================================================
    // 등장
    // =========================================================

    _enterOpacity = Tween<double>(
      begin: 0,
      end: 1,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.00,
          0.08,
          curve: Curves.easeOut,
        ),
      ),
    );

    _enterScale = Tween<double>(
      begin: 0.93,
      end: 1,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.00,
          0.11,
          curve: Curves.easeOutBack,
        ),
      ),
    );

    _enterY = Tween<double>(
      begin: 18,
      end: 0,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.00,
          0.12,
          curve: Curves.easeOutCubic,
        ),
      ),
    );

    // =========================================================
    // 인사
    //
    // 한참 유지 후 prepare와 짧게 크로스페이드
    // =========================================================

    _waveOpacity = TweenSequence<double>([
      TweenSequenceItem(
        tween: ConstantTween(1.0),
        weight: 68,
      ),
      TweenSequenceItem(
        tween: Tween(
          begin: 1.0,
          end: 0.0,
        ),
        weight: 32,
      ),
    ]).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.00,
          0.26,
          curve: Curves.easeInOutCubic,
        ),
      ),
    );

    // =========================================================
    // 숨 고르기
    //
    // 중간 포즈는 짧게만 보여줌
    // =========================================================

    _prepareOpacity = TweenSequence<double>([
      TweenSequenceItem(
        tween: Tween(
          begin: 0.0,
          end: 1.0,
        ),
        weight: 30,
      ),
      TweenSequenceItem(
        tween: ConstantTween(1.0),
        weight: 30,
      ),
      TweenSequenceItem(
        tween: Tween(
          begin: 1.0,
          end: 0.0,
        ),
        weight: 40,
      ),
    ]).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.18,
          0.38,
          curve: Curves.easeInOutCubic,
        ),
      ),
    );

    // =========================================================
    // 후~
    //
    // 이 포즈가 등장한 뒤 캐릭터가 사라질 때까지 계속 유지
    // =========================================================

    _blowOpacity = Tween<double>(
      begin: 0,
      end: 1,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.30,
          0.41,
          curve: Curves.easeInOutCubic,
        ),
      ),
    );

    // =========================================================
    // 숨이 전체 이동
    // 후~ 자세 그대로 왼쪽 뒤로 밀려남
    // =========================================================

    _characterX = Tween<double>(
      begin: 0,
      end: -125,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.47,
          0.82,
          curve: Curves.easeInOutCubic,
        ),
      ),
    );

    _characterY = Tween<double>(
      begin: 0,
      end: -12,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.52,
          0.82,
          curve: Curves.easeInOutCubic,
        ),
      ),
    );

    _characterScale = Tween<double>(
      begin: 1,
      end: 0.58,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.51,
          0.84,
          curve: Curves.easeInOutCubic,
        ),
      ),
    );

    _characterOpacity = TweenSequence<double>([
      TweenSequenceItem(
        tween: ConstantTween(1.0),
        weight: 74,
      ),
      TweenSequenceItem(
        tween: Tween(
          begin: 1.0,
          end: 0.0,
        ),
        weight: 15,
      ),
      TweenSequenceItem(
        tween: ConstantTween(0.0),
        weight: 11,
      ),
    ]).animate(_controller);

    // =========================================================
    // 작은 바람
    // =========================================================

    _windShortOpacity = TweenSequence<double>([
      TweenSequenceItem(
        tween: ConstantTween(0.0),
        weight: 34,
      ),
      TweenSequenceItem(
        tween: Tween(
          begin: 0.0,
          end: 1.0,
        ),
        weight: 8,
      ),
      TweenSequenceItem(
        tween: ConstantTween(1.0),
        weight: 20,
      ),
      TweenSequenceItem(
        tween: Tween(
          begin: 1.0,
          end: 0.0,
        ),
        weight: 20,
      ),
      TweenSequenceItem(
        tween: ConstantTween(0.0),
        weight: 18,
      ),
    ]).animate(_controller);

    _windShortScale = Tween<double>(
      begin: 0.14,
      end: 1.05,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.34,
          0.58,
          curve: Curves.easeOutCubic,
        ),
      ),
    );

    _windShortX = Tween<double>(
      begin: -15,
      end: 36,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.34,
          0.62,
          curve: Curves.easeOutCubic,
        ),
      ),
    );

    // =========================================================
    // 중간 바람
    // =========================================================

    _windMiddleOpacity = TweenSequence<double>([
      TweenSequenceItem(
        tween: ConstantTween(0.0),
        weight: 42,
      ),
      TweenSequenceItem(
        tween: Tween(
          begin: 0.0,
          end: 1.0,
        ),
        weight: 10,
      ),
      TweenSequenceItem(
        tween: ConstantTween(1.0),
        weight: 23,
      ),
      TweenSequenceItem(
        tween: Tween(
          begin: 1.0,
          end: 0.0,
        ),
        weight: 25,
      ),
    ]).animate(_controller);

    _windMiddleScale = Tween<double>(
      begin: 0.18,
      end: 1.10,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.43,
          0.72,
          curve: Curves.easeOutCubic,
        ),
      ),
    );

    _windMiddleX = Tween<double>(
      begin: 0,
      end: 75,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.43,
          0.75,
          curve: Curves.easeOutCubic,
        ),
      ),
    );

    // =========================================================
    // 긴 바람
    // =========================================================

    _windLongOpacity = TweenSequence<double>([
      TweenSequenceItem(
        tween: ConstantTween(0.0),
        weight: 53,
      ),
      TweenSequenceItem(
        tween: Tween(
          begin: 0.0,
          end: 1.0,
        ),
        weight: 10,
      ),
      TweenSequenceItem(
        tween: ConstantTween(1.0),
        weight: 23,
      ),
      TweenSequenceItem(
        tween: Tween(
          begin: 1.0,
          end: 0.0,
        ),
        weight: 14,
      ),
    ]).animate(_controller);

    _windLongScale = Tween<double>(
      begin: 0.18,
      end: 1.35,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.53,
          0.82,
          curve: Curves.easeOutCubic,
        ),
      ),
    );

    _windLongX = Tween<double>(
      begin: 0,
      end: 112,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.53,
          0.84,
          curve: Curves.easeOutCubic,
        ),
      ),
    );

    // =========================================================
    // 잎
    // =========================================================

    _leafOpacity = TweenSequence<double>([
      TweenSequenceItem(
        tween: ConstantTween(0.0),
        weight: 45,
      ),
      TweenSequenceItem(
        tween: Tween(
          begin: 0.0,
          end: 1.0,
        ),
        weight: 8,
      ),
      TweenSequenceItem(
        tween: ConstantTween(1.0),
        weight: 26,
      ),
      TweenSequenceItem(
        tween: Tween(
          begin: 1.0,
          end: 0.0,
        ),
        weight: 14,
      ),
      TweenSequenceItem(
        tween: ConstantTween(0.0),
        weight: 7,
      ),
    ]).animate(_controller);

    _leafProgress = Tween<double>(
      begin: 0,
      end: 1,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.45,
          0.85,
          curve: Curves.easeOutCubic,
        ),
      ),
    );

    // =========================================================
    // 큰 바람 곡선
    // =========================================================

    _swirlOpacity = Tween<double>(
      begin: 0,
      end: 1,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.70,
          0.87,
          curve: Curves.easeOut,
        ),
      ),
    );

    _swirlScale = Tween<double>(
      begin: 0.87,
      end: 1.05,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.70,
          0.91,
          curve: Curves.easeOutCubic,
        ),
      ),
    );

    _swirlX = Tween<double>(
      begin: 100,
      end: 0,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.70,
          0.90,
          curve: Curves.easeOutCubic,
        ),
      ),
    );

    // =========================================================
    // 로고
    // =========================================================

    _logoOpacity = Tween<double>(
      begin: 0,
      end: 1,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.81,
          0.94,
          curve: Curves.easeOut,
        ),
      ),
    );

    _logoScale = Tween<double>(
      begin: 0.94,
      end: 1,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.81,
          0.95,
          curve: Curves.easeOutBack,
        ),
      ),
    );

    _logoY = Tween<double>(
      begin: 12,
      end: 0,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.81,
          0.94,
          curve: Curves.easeOutCubic,
        ),
      ),
    );

    // =========================================================
    // 슬로건
    // =========================================================

    _taglineOpacity = Tween<double>(
      begin: 0,
      end: 1,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.88,
          0.98,
          curve: Curves.easeOut,
        ),
      ),
    );

    _taglineY = Tween<double>(
      begin: 8,
      end: 0,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(
          0.88,
          0.98,
          curve: Curves.easeOutCubic,
        ),
      ),
    );

    // =========================================================
    // 반짝이
    // =========================================================

    _sparkleOpacity = TweenSequence<double>([
      TweenSequenceItem(
        tween: ConstantTween(0.0),
        weight: 79,
      ),
      TweenSequenceItem(
        tween: Tween(
          begin: 0.0,
          end: 1.0,
        ),
        weight: 7,
      ),
      TweenSequenceItem(
        tween: Tween(
          begin: 1.0,
          end: 0.45,
        ),
        weight: 9,
      ),
      TweenSequenceItem(
        tween: ConstantTween(0.45),
        weight: 5,
      ),
    ]).animate(_controller);
  }

  @override
  void dispose() {
    _finishTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);

    return Scaffold(
      backgroundColor: Colors.white,
      body: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          return Stack(
            clipBehavior: Clip.none,
            children: [
              // ===================================================
              // 배경
              // ===================================================

              Positioned.fill(
                child: Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Color(0xFFFFFFFF),
                        Color(0xFFFBFDFF),
                        Color(0xFFF7FAFF),
                        Color(0xFFFFFFFF),
                      ],
                    ),
                  ),
                ),
              ),

              // 하단 블루 글로우
              Positioned(
                left: -100,
                right: -100,
                bottom: -100,
                child: Container(
                  height: 290,
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      colors: [
                        const Color(0xFFDFF6FF)
                            .withValues(alpha: 0.48),
                        const Color(0xFFE8EEFF)
                            .withValues(alpha: 0.18),
                        Colors.transparent,
                      ],
                    ),
                  ),
                ),
              ),

              // ===================================================
              // 마지막 큰 바람 곡선
              // ===================================================

              Positioned(
                left: -95 + _swirlX.value,
                right: -95,
                top: size.height * 0.37,
                child: Opacity(
                  opacity: _swirlOpacity.value,
                  child: Transform.scale(
                    scale: _swirlScale.value,
                    child: Image.asset(
                      'assets/images/splash/bg_swirl.png',
                      fit: BoxFit.fitWidth,
                    ),
                  ),
                ),
              ),

              // ===================================================
              // 작은 바람
              // ===================================================

              Positioned(
                left: size.width * 0.47 + _windShortX.value,
                top: size.height * 0.455,
                child: Opacity(
                  opacity: _windShortOpacity.value,
                  child: Transform.scale(
                    scaleX: _windShortScale.value,
                    alignment: Alignment.centerLeft,
                    child: Image.asset(
                      'assets/images/splash/wind_short.png',
                      width: size.width * 0.29,
                    ),
                  ),
                ),
              ),

              // ===================================================
              // 중간 바람
              // ===================================================

              Positioned(
                left: size.width * 0.43 + _windMiddleX.value,
                top: size.height * 0.43,
                child: Opacity(
                  opacity: _windMiddleOpacity.value,
                  child: Transform.scale(
                    scaleX: _windMiddleScale.value,
                    alignment: Alignment.centerLeft,
                    child: Image.asset(
                      'assets/images/splash/wind_middle.png',
                      width: size.width * 0.48,
                    ),
                  ),
                ),
              ),

              // ===================================================
              // 긴 바람
              // ===================================================

              Positioned(
                left: size.width * 0.34 + _windLongX.value,
                top: size.height * 0.405,
                child: Opacity(
                  opacity: _windLongOpacity.value,
                  child: Transform.scale(
                    scaleX: _windLongScale.value,
                    alignment: Alignment.centerLeft,
                    child: Image.asset(
                      'assets/images/splash/wind_long.png',
                      width: size.width * 0.72,
                    ),
                  ),
                ),
              ),

              // ===================================================
              // 잎 1
              // ===================================================

              Positioned(
                left:
                    size.width * 0.53 +
                    size.width *
                        0.40 *
                        _leafProgress.value,
                top:
                    size.height * 0.40 -
                    65 * _leafProgress.value,
                child: Opacity(
                  opacity: _leafOpacity.value,
                  child: Transform.rotate(
                    angle:
                        -0.2 +
                        1.7 * _leafProgress.value,
                    child: Image.asset(
                      'assets/images/splash/leaf.png',
                      width: 29,
                    ),
                  ),
                ),
              ),

              // ===================================================
              // 잎 2
              // ===================================================

              Positioned(
                left:
                    size.width * 0.47 +
                    size.width *
                        0.31 *
                        _leafProgress.value,
                top:
                    size.height * 0.50 +
                    30 * _leafProgress.value,
                child: Opacity(
                  opacity: _leafOpacity.value * 0.75,
                  child: Transform.rotate(
                    angle:
                        0.5 -
                        1.7 * _leafProgress.value,
                    child: Image.asset(
                      'assets/images/splash/leaf.png',
                      width: 22,
                    ),
                  ),
                ),
              ),

              // ===================================================
              // 잎 3
              // ===================================================

              Positioned(
                left:
                    size.width * 0.60 +
                    size.width *
                        0.34 *
                        _leafProgress.value,
                top:
                    size.height * 0.44 -
                    28 * _leafProgress.value,
                child: Opacity(
                  opacity: _leafOpacity.value * 0.58,
                  child: Transform.rotate(
                    angle:
                        -0.7 +
                        1.5 * _leafProgress.value,
                    child: Image.asset(
                      'assets/images/splash/leaf.png',
                      width: 19,
                    ),
                  ),
                ),
              ),

              // ===================================================
              // 캐릭터
              // ===================================================

              Positioned(
                left: 0,
                right: 0,
                top: size.height * 0.34,
                child: Opacity(
                  opacity:
                      _enterOpacity.value *
                      _characterOpacity.value,
                  child: Transform.translate(
                    offset: Offset(
                      _characterX.value,
                      _enterY.value +
                          _characterY.value,
                    ),
                    child: Transform.scale(
                      scale:
                          _enterScale.value *
                          _characterScale.value,
                      child: SizedBox(
                        height: size.height * 0.245,
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            // 인사
                            Opacity(
                              opacity: _waveOpacity.value,
                              child: Image.asset(
                                'assets/images/splash/soomi_wave.png',
                                height: size.height * 0.225,
                                fit: BoxFit.contain,
                              ),
                            ),

                            // 숨 고르기
                            Opacity(
                              opacity: _prepareOpacity.value,
                              child: Transform.translate(
                                offset: const Offset(0, 1),
                                child: Image.asset(
                                  'assets/images/splash/soomi_prepare.png',
                                  height: size.height * 0.225,
                                  fit: BoxFit.contain,
                                ),
                              ),
                            ),

                            // 후~
                            //
                            // 이후 이동할 때도 이 이미지 그대로 유지
                            Opacity(
                              opacity: _blowOpacity.value,
                              child: Transform.translate(
                                offset: const Offset(-2, 1),
                                child: Image.asset(
                                  'assets/images/splash/soomi_blow.png',
                                  height: size.height * 0.225,
                                  fit: BoxFit.contain,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),

              // ===================================================
              // 중간 문구
              // ===================================================

              Positioned(
                left: 0,
                right: 0,
                top: size.height * 0.66,
                child: Opacity(
                  opacity:
                      (1 - _logoOpacity.value) *
                      _characterOpacity.value,
                  child: const Text(
                    '숨을 잇다, 마음을 잇다',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 19,
                      fontWeight: FontWeight.w600,
                      letterSpacing: -0.5,
                      color: Color(0xFF5478CE),
                    ),
                  ),
                ),
              ),

              // ===================================================
              // 반짝이
              // ===================================================

              Positioned(
                right: size.width * 0.16,
                top: size.height * 0.32,
                child: Opacity(
                  opacity: _sparkleOpacity.value,
                  child: const _Sparkle(size: 17),
                ),
              ),

              Positioned(
                left: size.width * 0.19,
                top: size.height * 0.39,
                child: Opacity(
                  opacity:
                      _sparkleOpacity.value * 0.65,
                  child: const _Sparkle(size: 10),
                ),
              ),

              // ===================================================
              // 마지막 로고
              // ===================================================

              Positioned.fill(
                child: IgnorePointer(
                  child: Opacity(
                    opacity: _logoOpacity.value,
                    child: Transform.translate(
                      offset: Offset(
                        0,
                        _logoY.value,
                      ),
                      child: Transform.scale(
                        scale: _logoScale.value,
                        child: Column(
                          mainAxisAlignment:
                              MainAxisAlignment.center,
                          children: [
                            const Spacer(flex: 6),

                            Image.asset(
                              'assets/images/splash/logo_full.png',
                              width: size.width * 0.34,
                              fit: BoxFit.contain,
                            ),

                            const SizedBox(height: 14),

                            Transform.translate(
                              offset: Offset(
                                0,
                                _taglineY.value,
                              ),
                              child: Opacity(
                                opacity:
                                    _taglineOpacity.value,
                                child: const Text(
                                  '숨을 잇다, 마음을 잇다',
                                  style: TextStyle(
                                    fontSize: 17,
                                    fontWeight:
                                        FontWeight.w500,
                                    letterSpacing: -0.3,
                                    color:
                                        Color(0xFF5478CE),
                                  ),
                                ),
                              ),
                            ),

                            const Spacer(flex: 5),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Sparkle extends StatelessWidget {
  final double size;

  const _Sparkle({
    required this.size,
  });

  @override
  Widget build(BuildContext context) {
    return Transform.rotate(
      angle: math.pi / 4,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(
            size * 0.18,
          ),
          color: Colors.white,
          boxShadow: [
            BoxShadow(
              color: const Color(0xFFB7DEFF)
                  .withValues(alpha: 0.55),
              blurRadius: 10,
              spreadRadius: 2,
            ),
          ],
        ),
      ),
    );
  }
}