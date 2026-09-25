import 'package:flutter/material.dart';

import '../../shared/app_shell.dart';
import '../test_features/test_features_screen.dart';
import 'services/patient_auth_service.dart';
import 'terms_agreement_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final PatientAuthService _authService = PatientAuthService();

  static const Color _textPrimary = Color(0xFF172033);
  static const Color _textSecondary = Color(0xFF748198);
  static const Color _divider = Color(0xFFE6EBF1);

  bool _isGoogleSigningIn = false;

  void _openTestFeatures() {
    Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => const TestFeaturesScreen()));
  }

  Future<void> _loginWithGoogle() async {
    if (_isGoogleSigningIn) return;

    setState(() {
      _isGoogleSigningIn = true;
    });

    try {
      final result = await _authService.loginWithGoogle();

      if (!mounted) return;

      if (result.registrationRequired) {
        await Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (context) {
              return TermsAgreementScreen(
                registrationToken: result.registrationToken!,
                initialName: result.prefilledName,
              );
            },
          ),
        );
        return;
      }

      await Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute<void>(builder: (context) => const AppShell()),
        (route) => false,
      );
    } catch (error) {
      if (!mounted) return;

      final errorText = error.toString();
      final normalizedError = errorText.toLowerCase();

      // 사용자가 Google 로그인 창에서 뒤로가거나 취소한 경우는
      // 실제 오류가 아니므로 SnackBar를 표시하지 않는다.
      final isUserCanceled =
          normalizedError.contains('googlesigninexceptioncode.canceled') ||
          normalizedError.contains('cancelled by user') ||
          normalizedError.contains('canceled by user');

      if (isUserCanceled) {
        return;
      }

      final message = errorText.replaceFirst('Exception: ', '');

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
    } finally {
      if (mounted) {
        setState(() {
          _isGoogleSigningIn = false;
        });
      }
    }
  }

  void _showPreparingMessage(String provider) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('$provider 로그인은 준비 중입니다.')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFF1FBF8), Color(0xFFF3F9FC), Color(0xFFEAF2F8)],
            stops: [0.0, 0.52, 1.0],
          ),
        ),
        child: Stack(
          children: [
            const Positioned.fill(
              child: IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      center: Alignment(0.0, -0.78),
                      radius: 1.05,
                      colors: [
                        Color(0x5557D6C7),
                        Color(0x3D53A8F5),
                        Color(0x1F53A8F5),
                        Colors.transparent,
                      ],
                      stops: [0.0, 0.28, 0.52, 0.82],
                    ),
                  ),
                ),
              ),
            ),

            const Positioned.fill(
              child: IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      center: Alignment(0.92, -0.45),
                      radius: 0.72,
                      colors: [Color(0x2457D6C7), Colors.transparent],
                      stops: [0.0, 0.78],
                    ),
                  ),
                ),
              ),
            ),

            SafeArea(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  return SingleChildScrollView(
                    physics: const ClampingScrollPhysics(),
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: ConstrainedBox(
                      constraints: BoxConstraints(
                        minHeight: constraints.maxHeight,
                      ),
                      child: Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 420),
                          child: Padding(
                            padding: const EdgeInsets.only(top: 35, bottom: 27),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Center(
                                  child: Image.asset(
                                    'assets/images/logo_full.png',
                                    width: 230,
                                    fit: BoxFit.contain,
                                    errorBuilder: (context, error, stackTrace) {
                                      return const SizedBox(
                                        height: 100,
                                        child: Center(
                                          child: Text(
                                            '숨-잇',
                                            style: TextStyle(
                                              color: _textPrimary,
                                              fontSize: 34,
                                              fontWeight: FontWeight.w800,
                                            ),
                                          ),
                                        ),
                                      );
                                    },
                                  ),
                                ),

                                const SizedBox(height: 5),

                                ShaderMask(
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

                                const SizedBox(height: 15),

                                const Text(
                                  '환자와 의료진을 연결하는\n건강관리 서비스를 시작해보세요.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: _textSecondary,
                                    fontSize: 14,
                                    height: 1.55,
                                  ),
                                ),

                                const SizedBox(height: 40),

                                const Row(
                                  children: [
                                    Expanded(
                                      child: Divider(
                                        color: _divider,
                                        height: 1,
                                        thickness: 1,
                                      ),
                                    ),
                                    Padding(
                                      padding: EdgeInsets.symmetric(
                                        horizontal: 13,
                                      ),
                                      child: Text(
                                        '간편 로그인',
                                        style: TextStyle(
                                          color: Color(0xFF8B95A1),
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                    Expanded(
                                      child: Divider(
                                        color: _divider,
                                        height: 1,
                                        thickness: 1,
                                      ),
                                    ),
                                  ],
                                ),

                                const SizedBox(height: 22),

                                _SocialLoginButton(
                                  label: _isGoogleSigningIn
                                      ? 'Google 로그인 중...'
                                      : 'Google 로 시작하기',
                                  iconAsset:
                                      'assets/images/social/google_logo_normalized.png',
                                  iconSize: 60,
                                  backgroundColor: const Color(0xFFF2F2F2),
                                  foregroundColor: const Color(0xFF1F1F1F),
                                  borderColor: const Color(0xFFDADCE0),
                                  onPressed: _isGoogleSigningIn
                                      ? null
                                      : _loginWithGoogle,
                                ),

                                const SizedBox(height: 12),

                                _SocialLoginButton(
                                  label: '카카오로 시작하기',
                                  iconAsset:
                                      'assets/images/social/kakao_logo_normalized.png',
                                  iconSize: 30,
                                  backgroundColor: const Color(0xFFFEE500),
                                  foregroundColor: const Color(0xD9000000),
                                  borderColor: const Color(0xFFFEE500),
                                  onPressed: () {
                                    _showPreparingMessage('카카오');
                                  },
                                ),

                                const SizedBox(height: 12),

                                _SocialLoginButton(
                                  label: '네이버로 시작하기',
                                  iconAsset:
                                      'assets/images/social/naver_logo_normalized.png',
                                  iconSize: 60,
                                  backgroundColor: const Color.fromARGB(
                                    255,
                                    5,
                                    173,
                                    79,
                                  ),
                                  foregroundColor: Colors.white,
                                  borderColor: const Color(0xFF03A94D),
                                  onPressed: () {
                                    _showPreparingMessage('네이버');
                                  },
                                ),

                                const SizedBox(height: 22),

                                OutlinedButton.icon(
                                  onPressed: _openTestFeatures,
                                  icon: const Icon(Icons.apps_rounded),
                                  label: const Text('로그인 없이 테스트 기능 사용하기'),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: const Color(0xFF3198F4),
                                    side: const BorderSide(
                                      color: Color(0xFFB9DDFC),
                                    ),
                                    minimumSize: const Size.fromHeight(52),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(14),
                                    ),
                                    textStyle: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),

                                const SizedBox(height: 28),

                                const Text(
                                  '소셜 로그인 후 서비스 이용에 필요한 약관 동의와 '
                                  '기본정보 입력이 진행됩니다.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: Color(0xFF9AA6B2),
                                    fontSize: 12,
                                    height: 1.55,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SocialLoginButton extends StatelessWidget {
  final String label;
  final String iconAsset;
  final double iconSize;
  final Color backgroundColor;
  final Color foregroundColor;
  final Color borderColor;
  final VoidCallback? onPressed;

  const _SocialLoginButton({
    required this.label,
    required this.iconAsset,
    required this.iconSize,
    required this.backgroundColor,
    required this.foregroundColor,
    required this.borderColor,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 56,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          backgroundColor: backgroundColor,
          foregroundColor: foregroundColor,
          disabledBackgroundColor: backgroundColor,
          disabledForegroundColor: foregroundColor.withValues(alpha: 0.65),
          side: BorderSide(color: borderColor, width: 1),
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 18),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: SizedBox(
                width: 60,
                height: 60,
                child: Center(
                  child: Image.asset(
                    iconAsset,
                    width: iconSize,
                    height: iconSize,
                    fit: BoxFit.contain,
                  ),
                ),
              ),
            ),
            Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: foregroundColor,
                fontSize: 15,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.2,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
