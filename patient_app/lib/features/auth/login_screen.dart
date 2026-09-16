import 'package:flutter/material.dart';

import '../../shared/app_shell.dart';
import 'profile_registration_screen.dart';
import 'services/patient_auth_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final PatientAuthService _authService = PatientAuthService();

  bool _isGoogleSigningIn = false;

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
              return ProfileRegistrationScreen(
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

      final message = error.toString().replaceFirst('Exception: ', '');

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
      backgroundColor: const Color(0xFFF9F8FC),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                children: [
                  Container(
                    width: 88,
                    height: 88,
                    decoration: const BoxDecoration(
                      color: Color(0xFFEDE7FA),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.air_rounded,
                      size: 46,
                      color: Color(0xFF6D4FB3),
                    ),
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    '숨-잇',
                    style: TextStyle(
                      color: Color(0xFF191F28),
                      fontSize: 32,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    '환자의 숨을 의료진의 판단으로 잇다',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Color(0xFF6B7280),
                      fontSize: 15,
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 48),
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      '소셜 계정으로 시작하기',
                      style: TextStyle(
                        color: Color(0xFF191F28),
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  SocialLoginButton(
                    label: _isGoogleSigningIn
                        ? 'Google 로그인 중...'
                        : 'Google로 계속하기',
                    symbol: 'G',
                    backgroundColor: Colors.white,
                    foregroundColor: const Color(0xFF191F28),
                    borderColor: const Color(0xFFD1D5DB),
                    onPressed: _loginWithGoogle,
                  ),
                  const SizedBox(height: 12),
                  SocialLoginButton(
                    label: '카카오로 계속하기',
                    symbol: 'K',
                    backgroundColor: const Color(0xFFFEE500),
                    foregroundColor: const Color(0xFF191919),
                    onPressed: () {
                      _showPreparingMessage('카카오');
                    },
                  ),
                  const SizedBox(height: 12),
                  SocialLoginButton(
                    label: '네이버로 계속하기',
                    symbol: 'N',
                    backgroundColor: const Color(0xFF03C75A),
                    foregroundColor: Colors.white,
                    onPressed: () {
                      _showPreparingMessage('네이버');
                    },
                  ),
                  const SizedBox(height: 32),
                  const Text(
                    '로그인하면 서비스 이용약관과 개인정보 처리방침에 '
                    '동의한 것으로 간주합니다.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Color(0xFF8B95A1),
                      fontSize: 12,
                      height: 1.5,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class SocialLoginButton extends StatelessWidget {
  final String label;
  final String symbol;
  final Color backgroundColor;
  final Color foregroundColor;
  final Color? borderColor;
  final VoidCallback onPressed;

  const SocialLoginButton({
    super.key,
    required this.label,
    required this.symbol,
    required this.backgroundColor,
    required this.foregroundColor,
    required this.onPressed,
    this.borderColor,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 54,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: foregroundColor,
          backgroundColor: backgroundColor,
          side: BorderSide(color: borderColor ?? backgroundColor),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                symbol,
                style: TextStyle(
                  color: foregroundColor,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            Text(
              label,
              style: TextStyle(
                color: foregroundColor,
                fontSize: 15,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
