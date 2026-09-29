import 'dart:async';

import 'package:flutter/material.dart';

import '../auth/auth_gate.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  late final AnimationController _sceneController;
  late final AnimationController _logoController;

  late final Animation<double> _logoOpacity;
  late final Animation<double> _logoScale;
  late final Animation<Offset> _logoSlide;

  late final Animation<double> _textOpacity;
  late final Animation<Offset> _textSlide;

  Timer? _logoTimer;
  Timer? _navigationTimer;

  // 실기기에서 이미지 로딩 완료 후 한 번만 시작하기 위한 변수
  bool _started = false;

  @override
  void initState() {
    super.initState();

    // =========================================================
    // 전체 바람 시퀀스
    // =========================================================
    _sceneController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3400),
    );

    // =========================================================
    // 마지막 로고 + 문구
    // =========================================================
    _logoController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );

    _logoOpacity = CurvedAnimation(
      parent: _logoController,
      curve: Curves.easeOut,
    );

    _logoScale = Tween<double>(
      begin: 0.96,
      end: 1.0,
    ).animate(
      CurvedAnimation(
        parent: _logoController,
        curve: Curves.easeOutCubic,
      ),
    );

    _logoSlide = Tween<Offset>(
      begin: const Offset(0, 0.05),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(
        parent: _logoController,
        curve: Curves.easeOutCubic,
      ),
    );

    _textOpacity = CurvedAnimation(
      parent: _logoController,
      curve: const Interval(
        0.30,
        1.0,
        curve: Curves.easeOut,
      ),
    );

    _textSlide = Tween<Offset>(
      begin: const Offset(0, 0.12),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(
        parent: _logoController,
        curve: const Interval(
          0.25,
          1.0,
          curve: Curves.easeOutCubic,
        ),
      ),
    );

    // 여기서는 애니메이션을 바로 시작하지 않음.
    // 이미지 preload가 끝난 뒤 시작.
  }

  // =========================================================
  // BuildContext 준비 후 이미지 preload
  // =========================================================
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    if (_started) return;

    _started = true;
    _prepareAndStart();
  }

  Future<void> _prepareAndStart() async {
    try {
      // =======================================================
      // 실기기에서도 애니메이션 시작 전에 이미지 미리 로딩
      // =======================================================
      await Future.wait([
        precacheImage(
          const AssetImage('assets/images/splash/leaf.png'),
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
          const AssetImage('assets/images/splash/bg_swirl.png'),
          context,
        ),
        precacheImage(
          const AssetImage('assets/images/logo_full.png'),
          context,
        ),
      ]);
    } catch (e) {
      debugPrint('Splash precache error: $e');
    }

    if (!mounted) return;

    // =========================================================
    // 이미지 준비 완료 후 애니메이션 시작
    // =========================================================
    _sceneController.forward();

    _logoTimer = Timer(
      const Duration(milliseconds: 2550),
      () {
        if (!mounted) return;

        _logoController.forward();
      },
    );

    _navigationTimer = Timer(
      const Duration(milliseconds: 4700),
      _goToApp,
    );
  }

  void _goToApp() {
    if (!mounted) return;

    Navigator.of(context).pushReplacement(
      PageRouteBuilder<void>(
        transitionDuration: const Duration(milliseconds: 280),
        pageBuilder: (
          context,
          animation,
          secondaryAnimation,
        ) {
          return const AuthGate();
        },
        transitionsBuilder: (
          context,
          animation,
          secondaryAnimation,
          child,
        ) {
          return FadeTransition(
            opacity: CurvedAnimation(
              parent: animation,
              curve: Curves.easeOut,
            ),
            child: child,
          );
        },
      ),
    );
  }

  double _progress({
    required double value,
    required double start,
    required double end,
  }) {
    if (value <= start) return 0.0;
    if (value >= end) return 1.0;

    return ((value - start) / (end - start)).clamp(0.0, 1.0);
  }

  double _fadeInOut({
    required double value,
    required double start,
    required double fadeInEnd,
    required double fadeOutStart,
    required double end,
  }) {
    if (value < start || value > end) {
      return 0.0;
    }

    if (value < fadeInEnd) {
      return ((value - start) / (fadeInEnd - start)).clamp(0.0, 1.0);
    }

    if (value <= fadeOutStart) {
      return 1.0;
    }

    return (1.0 - ((value - fadeOutStart) / (end - fadeOutStart)))
        .clamp(0.0, 1.0);
  }

  double _fadeIn({
    required double value,
    required double start,
    required double end,
  }) {
    if (value <= start) return 0.0;
    if (value >= end) return 1.0;

    return ((value - start) / (end - start)).clamp(0.0, 1.0);
  }

  @override
  void dispose() {
    _logoTimer?.cancel();
    _navigationTimer?.cancel();

    _sceneController.dispose();
    _logoController.dispose();

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);

    final screenWidth = size.width;
    final screenHeight = size.height;

    return Scaffold(
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color(0xFFF7FAFC),
              Color(0xFFF4F9FC),
              Color(0xFFF1F6FB),
            ],
          ),
        ),
        child: SafeArea(
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              // =================================================
              // 나뭇잎 + 흐르는 바람
              // =================================================
              Positioned.fill(
                child: AnimatedBuilder(
                  animation: _sceneController,
                  builder: (
                    context,
                    child,
                  ) {
                    final t = _sceneController.value;

                    // -------------------------------------------------
                    // 나뭇잎
                    // -------------------------------------------------
                    final leafProgress = _progress(
                      value: t,
                      start: 0.00,
                      end: 0.62,
                    );

                    final leafX =
                        screenWidth * 0.30 +
                        leafProgress * screenWidth * 0.78;

                    final leafY =
                        screenHeight * 0.40 +
                        leafProgress * screenHeight * 0.035;

                    // -------------------------------------------------
                    // middle
                    // -------------------------------------------------
                    final middleProgress = _progress(
                      value: t,
                      start: 0.10,
                      end: 0.58,
                    );

                    // -------------------------------------------------
                    // long
                    // -------------------------------------------------
                    final longProgress = _progress(
                      value: t,
                      start: 0.34,
                      end: 0.74,
                    );

                    return Stack(
                      clipBehavior: Clip.none,
                      children: [
                        // =============================================
                        // 1. 나뭇잎
                        // =============================================
                        Positioned(
                          left: leafX,
                          top: leafY,
                          child: Opacity(
                            opacity: _fadeInOut(
                              value: t,
                              start: 0.00,
                              fadeInEnd: 0.08,
                              fadeOutStart: 0.48,
                              end: 0.62,
                            ),
                            child: Transform.rotate(
                              angle: -0.25 + leafProgress * 1.6,
                              child: Image.asset(
                                'assets/images/splash/leaf.png',
                                width: 48,
                                fit: BoxFit.contain,
                                gaplessPlayback: true,
                              ),
                            ),
                          ),
                        ),

                        // =============================================
                        // 2. wind_middle
                        // =============================================
                        Positioned(
                          left:
                              -screenWidth * 0.18 +
                              middleProgress * screenWidth * 0.82,
                          top:
                              screenHeight * 0.43 +
                              middleProgress * screenHeight * 0.025,
                          child: Opacity(
                            opacity: _fadeInOut(
                              value: t,
                              start: 0.10,
                              fadeInEnd: 0.18,
                              fadeOutStart: 0.46,
                              end: 0.58,
                            ),
                            child: Transform.rotate(
                              angle: 0.02,
                              child: Image.asset(
                                'assets/images/splash/wind_middle.png',
                                width: screenWidth * 0.90,
                                fit: BoxFit.contain,
                                gaplessPlayback: true,
                              ),
                            ),
                          ),
                        ),

                        // =============================================
                        // 3. wind_long
                        // =============================================
                        Positioned(
                          left:
                              -screenWidth * 0.32 +
                              longProgress * screenWidth * 0.78,
                          top:
                              screenHeight * 0.48 -
                              longProgress * screenHeight * 0.015,
                          child: Opacity(
                            opacity: _fadeInOut(
                              value: t,
                              start: 0.34,
                              fadeInEnd: 0.43,
                              fadeOutStart: 0.62,
                              end: 0.74,
                            ),
                            child: Transform.rotate(
                              angle: -0.015,
                              child: Image.asset(
                                'assets/images/splash/wind_long.png',
                                width: screenWidth * 1.06,
                                fit: BoxFit.contain,
                                gaplessPlayback: true,
                              ),
                            ),
                          ),
                        ),

                        // =============================================
                        // 4. 마지막 큰 바람 bg_swirl
                        // =============================================
                        Positioned(
                          left: -screenWidth * 0.28,
                          right: -screenWidth * 0.28,
                          bottom: screenHeight * 0.13,
                          child: Opacity(
                            opacity: _fadeIn(
                              value: t,
                              start: 0.70,
                              end: 0.90,
                            ),
                            child: Transform.translate(
                              offset: Offset(
                                (1.0 -
                                        _fadeIn(
                                          value: t,
                                          start: 0.70,
                                          end: 0.90,
                                        )) *
                                    75,
                                0,
                              ),
                              child: Transform.scale(
                                scale:
                                    0.92 +
                                    _fadeIn(
                                          value: t,
                                          start: 0.70,
                                          end: 0.90,
                                        ) *
                                        0.12,
                                child: Image.asset(
                                  'assets/images/splash/bg_swirl.png',
                                  fit: BoxFit.contain,
                                  gaplessPlayback: true,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),

              // =================================================
              // 마지막 로고 + 문구
              // =================================================
              Align(
                alignment: const Alignment(0, -0.10),
                child: FadeTransition(
                  opacity: _logoOpacity,
                  child: SlideTransition(
                    position: _logoSlide,
                    child: ScaleTransition(
                      scale: _logoScale,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Image.asset(
                            'assets/images/logo_full.png',
                            width: 210,
                            fit: BoxFit.contain,
                            gaplessPlayback: true,
                          ),

                          const SizedBox(height: 18),

                          FadeTransition(
                            opacity: _textOpacity,
                            child: SlideTransition(
                              position: _textSlide,

                              // ===============================
                              // 로그인 화면과 동일한 문구 색상
                              // ===============================
                              child: ShaderMask(
                                shaderCallback: (bounds) {
                                  return const LinearGradient(
                                    begin: Alignment.centerLeft,
                                    end: Alignment.centerRight,
                                    colors: [
                                      Color(0xFF35C7A5),
                                      Color(0xFF3AAFE8),
                                      Color(0xFF4C7FEA),
                                    ],
                                  ).createShader(bounds);
                                },
                                blendMode: BlendMode.srcIn,
                                child: const Text(
                                  '숨을 잇다, 건강을 잇다, 마음을 잇다',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: -0.2,
                                    height: 1.4,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}