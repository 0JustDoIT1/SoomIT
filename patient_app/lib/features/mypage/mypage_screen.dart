import 'package:flutter/material.dart';

import '../auth/existing_patient_link_screen.dart';
import '../auth/login_screen.dart';
import '../auth/services/patient_auth_service.dart';
import '../home/models/patient_profile.dart';
import '../home/services/profile_service.dart';
import '../notification/notification_navigation_service.dart';
import '../symptom/symptom_screen.dart';
import '../../l10n/app_localizations.dart';
import 'patient_qr_screen.dart';
import 'profile_edit_screen.dart';
import 'questionnaire_history_screen.dart';
import 'settings_screen.dart';

class MyPageScreen extends StatefulWidget {
  const MyPageScreen({super.key});

  @override
  State<MyPageScreen> createState() => _MyPageScreenState();
}

class _MyPageScreenState extends State<MyPageScreen> {
  final PatientAuthService _authService = PatientAuthService();
  final ProfileService _profileService = ProfileService();

  late Future<PatientProfile> _profileFuture;

  bool _isLoggingOut = false;

  @override
  void initState() {
    super.initState();
    _profileFuture = _profileService.getProfile();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: FutureBuilder<PatientProfile>(
        future: _profileFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(
              child: CircularProgressIndicator(),
            );
          }

          if (snapshot.hasError || snapshot.data == null) {
            return _buildError();
          }

          final profile = snapshot.data!;

          return SingleChildScrollView(
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 30),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildProfileCard(profile),

                if (profile.appLinkStatus != 'LINKED') ...[
                  const SizedBox(height: 14),
                  _buildPatientLinkCard(),
                ],

                const SizedBox(height: 14),

                _buildQuickMenu(profile),

                const SizedBox(height: 18),

                _buildSectionTitle('나의 건강관리'),
                const SizedBox(height: 8),
                _buildHealthMenu(),

                const SizedBox(height: 18),

                _buildSectionTitle('계정'),
                const SizedBox(height: 8),
                _buildAccountMenu(),

                const SizedBox(height: 14),

                _buildLogoutButton(),
              ],
            ),
          );
        },
      ),
    );
  }

  // ─────────────────────────────────────────────
  // 프로필 카드
  // ─────────────────────────────────────────────

  Widget _buildProfileCard(PatientProfile profile) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF4389FF),
            Color(0xFF2563EB),
          ],
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: const Color(
              0xFF2563EB,
            ).withValues(alpha: 0.18),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.94),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.person_rounded,
              size: 38,
              color: Color(0xFFB7C1D0),
            ),
          ),

          const SizedBox(width: 14),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  profile.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 19,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  profile.patientCode,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.95),
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (profile.hospitalName != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    profile.hospitalName!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.78),
                      fontSize: 12,
                    ),
                  ),
                ],
              ],
            ),
          ),

          const SizedBox(width: 8),

          OutlinedButton(
            onPressed: () async {
              await Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (context) {
                    return const ProfileEditScreen();
                  },
                ),
              );

              if (!mounted) return;

              setState(() {
                _profileFuture = _profileService.getProfile();
              });
            },
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.white,
              side: BorderSide(
                color: Colors.white.withValues(alpha: 0.65),
              ),
              padding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 8,
              ),
              visualDensity: VisualDensity.compact,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: const Text(
              '내 정보 수정',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ─────────────────────────────────────────────
  // 환자코드 연결
  // ─────────────────────────────────────────────

  Widget _buildPatientLinkCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFFF5F0FF),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: const Color(0xFFDCCEF7),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(
                Icons.info_outline_rounded,
                color: Color(0xFF6D4FB3),
                size: 22,
              ),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  '환자코드 연결이 필요해요',
                  style: TextStyle(
                    color: Color(0xFF191F28),
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          const Text(
            '병원에서 받은 환자코드를 연결하면 '
            '예약, 검사결과, 복약관리, 증상 기록을 '
            '사용할 수 있어요.',
            style: TextStyle(
              color: Color(0xFF6B7280),
              fontSize: 13,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            height: 46,
            child: FilledButton(
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (context) {
                      return const ExistingPatientLinkScreen();
                    },
                  ),
                );
              },
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF6D4FB3),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Text(
                '환자코드 연결하기',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ─────────────────────────────────────────────
  // 빠른 메뉴
  // QR / 예약 내역 / 검사 결과
  // ─────────────────────────────────────────────

  Widget _buildQuickMenu(PatientProfile profile) {
    return Container(
      padding: const EdgeInsets.symmetric(
        vertical: 16,
        horizontal: 6,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: const Color(0xFFE5EAF0),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: _buildQuickMenuItem(
              icon: Icons.qr_code_2_rounded,
              title: 'QR 코드',
              onTap: () {
                _openPatientQr(profile);
              },
            ),
          ),

          _buildVerticalDivider(),

          Expanded(
            child: _buildQuickMenuItem(
              icon: Icons.calendar_month_outlined,
              title: '예약 내역',
              onTap: () {
                NotificationNavigationService.instance.handlePayload({
                  'notification_type': 'APPOINTMENT',
                });
              },
            ),
          ),

          _buildVerticalDivider(),

          Expanded(
            child: _buildQuickMenuItem(
              icon: Icons.description_outlined,
              title: '검사 결과',
              onTap: () {
                NotificationNavigationService.instance.handlePayload({
                  'notification_type': 'RESULT',
                });
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickMenuItem({
    required IconData icon,
    required String title,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Column(
          children: [
            Icon(
              icon,
              size: 25,
              color: const Color(0xFF213A6B),
            ),
            const SizedBox(height: 7),
            Text(
              title,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Color(0xFF27364B),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildVerticalDivider() {
    return Container(
      width: 1,
      height: 40,
      color: const Color(0xFFE8ECF2),
    );
  }

  // ─────────────────────────────────────────────
  // 나의 건강관리
  // ─────────────────────────────────────────────

  Widget _buildHealthMenu() {
    return _buildMenuCard(
      children: [
        _buildMenuItem(
          icon: Icons.medication_outlined,
          title: '복약 관리',
          onTap: () {
            NotificationNavigationService.instance.handlePayload({
              'notification_type': 'MEDICATION',
            });
          },
        ),

        _menuDivider(),

        _buildMenuItem(
          icon: Icons.monitor_heart_outlined,
          title: '증상 기록',
          onTap: () {
            Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) {
                  return const SymptomScreen();
                },
              ),
            );
          },
        ),

        _menuDivider(),

        _buildMenuItem(
          icon: Icons.assignment_outlined,
          title: '문진표 작성 내역',
          onTap: () {
            Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) {
                  return const QuestionnaireHistoryScreen();
                },
              ),
            );
          },
        ),
      ],
    );
  }

  // ─────────────────────────────────────────────
  // 계정
  // ─────────────────────────────────────────────

  Widget _buildAccountMenu() {
    return _buildMenuCard(
      children: [
        _buildMenuItem(
          icon: Icons.settings_outlined,
          title: '설정',
          subtitle: '앱 환경 및 보안',
          onTap: () {
            Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) {
                  return const SettingsScreen();
                },
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 2),
      child: Text(
        title,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: Color(0xFF7A8AA0),
        ),
      ),
    );
  }

  Widget _buildMenuCard({
    required List<Widget> children,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: const Color(0xFFE5EAF0),
        ),
      ),
      child: Column(
        children: children,
      ),
    );
  }

  Widget _buildMenuItem({
    required IconData icon,
    required String title,
    String? subtitle,
    String? trailingText,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        child: Row(
          children: [
            Icon(
              icon,
              size: 22,
              color: const Color(0xFF223A70),
            ),

            const SizedBox(width: 13),

            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF27364B),
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 3),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 11,
                        color: Color(0xFF8B95A1),
                      ),
                    ),
                  ],
                ],
              ),
            ),

            if (trailingText != null) ...[
              Text(
                trailingText,
                style: const TextStyle(
                  fontSize: 12,
                  color: Color(0xFF7C8DB5),
                ),
              ),
              const SizedBox(width: 4),
            ],

            const Icon(
              Icons.chevron_right_rounded,
              size: 20,
              color: Color(0xFFAAB2BD),
            ),
          ],
        ),
      ),
    );
  }

  Widget _menuDivider() {
    return const Divider(
      height: 1,
      indent: 52,
      endIndent: 16,
      color: Color(0xFFEEF1F5),
    );
  }

  // ─────────────────────────────────────────────
  // QR
  // ─────────────────────────────────────────────

  void _openPatientQr(PatientProfile profile) {
    if (profile.appLinkStatus != 'LINKED') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            '환자코드를 연결한 후 QR을 사용할 수 있습니다.',
          ),
        ),
      );
      return;
    }

    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) {
          return PatientQrScreen(
            patientName: profile.name,
            patientCode: profile.patientCode,
          );
        },
      ),
    );
  }

  // ─────────────────────────────────────────────
  // 로그아웃
  // ─────────────────────────────────────────────

  Future<void> _logout() async {
    if (_isLoggingOut) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('로그아웃'),
          content: const Text(
            '숨-잇에서 로그아웃하시겠어요?',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(dialogContext).pop(false);
              },
              child: const Text('취소'),
            ),
            FilledButton(
              onPressed: () {
                Navigator.of(dialogContext).pop(true);
              },
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFFFF4D5A),
              ),
              child: const Text('로그아웃'),
            ),
          ],
        );
      },
    );

    if (confirmed != true || !mounted) return;

    setState(() {
      _isLoggingOut = true;
    });

    try {
      await _authService.logout();

      if (!mounted) return;

      await Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute<void>(
          builder: (context) {
            return const LoginScreen();
          },
        ),
        (route) => false,
      );
    } catch (_) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            '로그아웃에 실패했습니다. 다시 시도해주세요.',
          ),
        ),
      );

      setState(() {
        _isLoggingOut = false;
      });
    }
  }

  Widget _buildLogoutButton() {
    final l10n = AppLocalizations.of(context);

    return SizedBox(
      width: double.infinity,
      height: 48,
      child: OutlinedButton(
        onPressed: _isLoggingOut ? null : _logout,
        style: OutlinedButton.styleFrom(
          foregroundColor: const Color(0xFFFF4D5A),
          side: const BorderSide(
            color: Color(0xFFFFCDD1),
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: _isLoggingOut
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Color(0xFFFF4D5A),
                ),
              )
            : Text(
                l10n.logout,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                ),
              ),
      ),
    );
  }

  Widget _buildError() {
    return const Center(
      child: Text(
        '환자 정보를 불러오지 못했습니다.',
        style: TextStyle(
          color: Color(0xFF8B95A1),
        ),
      ),
    );
  }
}
