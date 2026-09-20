import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../../main.dart';
import '../auth/existing_patient_link_screen.dart';
import '../auth/login_screen.dart';
import '../auth/services/patient_auth_service.dart';
import '../app_lock/app_lock_setting_screen.dart';
import '../exam_result/exam_result_screen.dart';
import '../home/models/patient_profile.dart';
import '../home/services/profile_service.dart';
import '../medication/widgets/medication_history_tab.dart';
import '../symptom/symptom_screen.dart';
import 'font_size_setting_screen.dart';
import 'language_setting_screen.dart';
import 'notification_setting_screen.dart';
import 'patient_qr_screen.dart';
import 'profile_edit_screen.dart';
import 'questionnaire_history_screen.dart';

class MyPageScreen extends StatefulWidget {
  const MyPageScreen({super.key});

  @override
  State<MyPageScreen> createState() => _MyPageScreenState();
}

class _MyPageScreenState extends State<MyPageScreen> {
  static const _primary = Color(0xFF2F80ED);
  static const _navy = Color(0xFF172033);
  static const _muted = Color(0xFF748198);
  static const _border = Color(0xFFE3EBF3);
  static const _surface = Colors.white;
  static const _softBlue = Color(0xFFEAF4FF);
  static const _pageBackground = Color(0xFFF4F7FB);

  final PatientAuthService _authService = PatientAuthService();
  final ProfileService _profileService = ProfileService();

  late Future<PatientProfile> _profileFuture;
  bool _isLoggingOut = false;

  @override
  void initState() {
    super.initState();
    _profileFuture = _profileService.getProfile();
  }

  Future<void> _refreshProfile() async {
    setState(() {
      _profileFuture = _profileService.getProfile();
    });

    await _profileFuture;
  }

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: _pageBackground,
      child: SafeArea(
        child: FutureBuilder<PatientProfile>(
          future: _profileFuture,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(
                child: CircularProgressIndicator(color: _primary),
              );
            }

            if (snapshot.hasError || snapshot.data == null) {
              return _buildError();
            }

            final profile = snapshot.data!;

            return RefreshIndicator(
              color: _primary,
              onRefresh: _refreshProfile,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(
                  parent: BouncingScrollPhysics(),
                ),
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 32),
                children: [
                  _buildProfileCard(profile),

                  if (profile.appLinkStatus != 'LINKED') ...[
                    const SizedBox(height: 14),
                    _buildPatientLinkCard(),
                  ],

                  const SizedBox(height: 24),

                  _buildSectionHeader(
                    title: '나의 건강 데이터',
                    subtitle: '내 건강 기록을 한곳에서 확인해보세요.',
                  ),

                  const SizedBox(height: 10),

                  _buildMenuCard(
                    children: [
                      _buildMenuItem(
                        icon: Icons.insights_rounded,
                        iconColor: const Color(0xFF2F80ED),
                        iconBackground: const Color(0xFFEAF4FF),
                        title: '건강 리포트',
                        subtitle: '증상 변화와 건강 흐름을 확인해요.',
                        onTap: _openHealthReport,
                      ),
                      _menuDivider(),
                      _buildMenuItem(
                        icon: Icons.medication_rounded,
                        iconColor: const Color(0xFF2F80ED),
                        iconBackground: const Color(0xFFEAF4FF),
                        title: '복약 기록',
                        subtitle: '지난 복용 및 미복용 기록을 확인해요.',
                        onTap: _openMedicationHistory,
                      ),
                      _menuDivider(),
                      _buildMenuItem(
                        icon: Icons.assignment_outlined,
                        iconColor: const Color(0xFF3B82C4),
                        iconBackground: const Color(0xFFEDF6FC),
                        title: '문진표 작성 내역',
                        subtitle: '작성했던 문진표를 다시 확인해요.',
                        onTap: _openQuestionnaireHistory,
                      ),
                      _menuDivider(),
                      _buildMenuItem(
                        icon: Icons.folder_copy_outlined,
                        iconColor: const Color(0xFF3A78B8),
                        iconBackground: const Color(0xFFEDF5FB),
                        title: '진료·검사 기록',
                        subtitle: '검사 일정과 결과 기록을 확인해요.',
                        onTap: _openExamRecords,
                      ),
                    ],
                  ),

                  const SizedBox(height: 24),

                  _buildSectionHeader(
                    title: '앱 설정',
                    subtitle: '사용하기 편한 환경으로 설정할 수 있어요.',
                  ),

                  const SizedBox(height: 10),

                  _buildMenuCard(
                    children: [
                      _buildMenuItem(
                        icon: Icons.notifications_none_rounded,
                        iconColor: const Color(0xFF2F80ED),
                        iconBackground: const Color(0xFFEAF4FF),
                        title: '알림 설정',
                        onTap: _openNotificationSettings,
                      ),
                      _menuDivider(),
                      _buildMenuItem(
                        icon: Icons.lock_outline_rounded,
                        iconColor: const Color(0xFF426F9E),
                        iconBackground: const Color(0xFFEDF4FA),
                        title: '앱 잠금',
                        onTap: _openAppLockSettings,
                      ),
                      _menuDivider(),
                      _buildMenuItem(
                        icon: Icons.text_fields_rounded,
                        iconColor: const Color(0xFF426F9E),
                        iconBackground: const Color(0xFFEDF4FA),
                        title: '글자 크기',
                        onTap: _openFontSizeSettings,
                      ),
                      _menuDivider(),
                      _buildMenuItem(
                        icon: Icons.language_rounded,
                        iconColor: const Color(0xFF426F9E),
                        iconBackground: const Color(0xFFEDF4FA),
                        title: '언어 설정',
                        trailingText: _currentLanguageLabel,
                        onTap: _openLanguageSettings,
                      ),
                      _menuDivider(),
                      _buildMenuItem(
                        icon: Icons.dark_mode_outlined,
                        iconColor: const Color(0xFF426F9E),
                        iconBackground: const Color(0xFFEDF4FA),
                        title: '다크 모드',
                        onTap: _openDarkModeSettings,
                      ),
                    ],
                  ),

                  const SizedBox(height: 24),

                  _buildSectionHeader(title: '약관 및 정책'),

                  const SizedBox(height: 10),

                  _buildMenuCard(
                    children: [
                      _buildMenuItem(
                        icon: Icons.description_outlined,
                        iconColor: const Color(0xFF5C6F86),
                        iconBackground: const Color(0xFFF1F5F8),
                        title: '약관 및 정책',
                        subtitle: '이용약관, 개인정보 처리방침, 동의 내역',
                        onTap: _openTermsAndPolicies,
                      ),
                    ],
                  ),

                  const SizedBox(height: 20),

                  _buildLogoutButton(),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  String get _currentLanguageLabel {
    return Localizations.localeOf(context).languageCode == 'en'
        ? 'English'
        : '한국어';
  }

  Widget _buildProfileCard(PatientProfile profile) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(18, 18, 16, 18),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: _border),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF6F8EAE).withValues(alpha: 0.08),
            blurRadius: 22,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: const BoxDecoration(
                  color: _softBlue,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.person_outline_rounded,
                  size: 28,
                  color: _primary,
                ),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        profile.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: _navy,
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        '환자번호 ${profile.patientCode}',
                        style: const TextStyle(
                          color: _muted,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (profile.hospitalName != null &&
                          profile.hospitalName!.trim().isNotEmpty) ...[
                        const SizedBox(height: 3),
                        Text(
                          profile.hospitalName!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Color(0xFF94A0AF),
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              _SmallSquareButton(
                icon: Icons.qr_code_2_rounded,
                tooltip: 'QR 코드',
                onTap: () => _openPatientQr(profile),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Container(height: 1, color: const Color(0xFFEEF3F7)),
          const SizedBox(height: 13),
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => _openProfileDetail(profile),
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 2, vertical: 3),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '내 정보 상세',
                      style: TextStyle(
                        color: Color(0xFF34465C),
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  Text(
                    '보기',
                    style: TextStyle(
                      color: _primary,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  SizedBox(width: 3),
                  Icon(Icons.chevron_right_rounded, size: 20, color: _primary),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPatientLinkCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFF1F7FD),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFD6E8F8)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.info_outline_rounded, color: _primary, size: 21),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  '환자코드 연결이 필요해요',
                  style: TextStyle(
                    color: _navy,
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            '병원에서 받은 환자코드를 연결하면 예약, 검사결과, '
            '복약관리와 건강 기록 기능을 사용할 수 있어요.',
            style: TextStyle(color: _muted, fontSize: 12.5, height: 1.5),
          ),
          const SizedBox(height: 13),
          SizedBox(
            width: double.infinity,
            height: 44,
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
                backgroundColor: _primary,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Text(
                '환자코드 연결하기',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader({required String title, String? subtitle}) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: _navy,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: const TextStyle(
                color: Color(0xFF91A0B2),
                fontSize: 11.5,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildMenuCard({required List<Widget> children}) {
    return Container(
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _border),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF6F8EAE).withValues(alpha: 0.045),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(children: children),
    );
  }

  Widget _buildMenuItem({
    required IconData icon,
    required Color iconColor,
    required Color iconBackground,
    required String title,
    String? subtitle,
    String? trailingText,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 13, 13, 13),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: iconBackground,
                borderRadius: BorderRadius.circular(11),
              ),
              child: Icon(icon, color: iconColor, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      color: Color(0xFF2A3748),
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 3),
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Color(0xFF929EAC),
                        fontSize: 11.5,
                        fontWeight: FontWeight.w500,
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
                  color: Color(0xFF8290A3),
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(width: 3),
            ],
            const Icon(
              Icons.chevron_right_rounded,
              color: Color(0xFFB0BAC6),
              size: 21,
            ),
          ],
        ),
      ),
    );
  }

  Widget _menuDivider() {
    return const Divider(
      height: 1,
      indent: 64,
      endIndent: 14,
      color: Color(0xFFEEF3F7),
    );
  }

  Future<void> _openProfileDetail(PatientProfile profile) async {
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
  }

  void _openPatientQr(PatientProfile profile) {
    if (profile.appLinkStatus != 'LINKED') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('환자코드를 연결한 후 QR을 사용할 수 있습니다.')),
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

  void _openHealthReport() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) {
          return const SymptomScreen();
        },
      ),
    );
  }

  void _openMedicationHistory() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) {
          return const _MedicationHistoryDetailScreen();
        },
      ),
    );
  }

  void _openQuestionnaireHistory() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) {
          return const QuestionnaireHistoryScreen();
        },
      ),
    );
  }

  void _openExamRecords() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) {
          return const _ExamRecordDetailScreen();
        },
      ),
    );
  }

  void _openNotificationSettings() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) {
          return const NotificationSettingScreen();
        },
      ),
    );
  }

  void _openAppLockSettings() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) {
          return const AppLockSettingScreen();
        },
      ),
    );
  }

  void _openFontSizeSettings() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) {
          return const FontSizeSettingScreen();
        },
      ),
    );
  }

  void _openLanguageSettings() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) {
          return const LanguageSettingScreen();
        },
      ),
    );
  }

  void _openDarkModeSettings() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) {
          return const _DarkModeSettingScreen();
        },
      ),
    );
  }

  void _openTermsAndPolicies() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) {
          return const _TermsAndPoliciesScreen();
        },
      ),
    );
  }

  Future<void> _logout() async {
    if (_isLoggingOut) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('로그아웃'),
          content: const Text('숨-잇에서 로그아웃하시겠어요?'),
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
                backgroundColor: const Color(0xFFE45B65),
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

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('로그아웃에 실패했습니다. 다시 시도해주세요.')));

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
          foregroundColor: const Color(0xFFD95460),
          backgroundColor: Colors.white,
          side: const BorderSide(color: Color(0xFFF1CCD0)),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: _isLoggingOut
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Color(0xFFD95460),
                ),
              )
            : Text(
                l10n.logout,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
      ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.error_outline_rounded,
              size: 42,
              color: Color(0xFF94A0AF),
            ),
            const SizedBox(height: 12),
            const Text(
              '환자 정보를 불러오지 못했습니다.',
              style: TextStyle(color: _navy, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: () {
                setState(() {
                  _profileFuture = _profileService.getProfile();
                });
              },
              child: const Text('다시 시도'),
            ),
          ],
        ),
      ),
    );
  }
}

class _SmallSquareButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  const _SmallSquareButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: const Color(0xFFF6F9FC),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            width: 42,
            height: 42,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFE4ECF4)),
            ),
            child: const Icon(
              Icons.qr_code_2_rounded,
              color: Color(0xFF426F9E),
              size: 22,
            ),
          ),
        ),
      ),
    );
  }
}

class _MedicationHistoryDetailScreen extends StatelessWidget {
  const _MedicationHistoryDetailScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F7FB),
      appBar: _detailAppBar('복약 기록'),
      body: const MedicationHistoryTab(),
    );
  }
}

class _ExamRecordDetailScreen extends StatelessWidget {
  const _ExamRecordDetailScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F7FB),
      appBar: _detailAppBar('진료·검사 기록'),
      body: const ExamResultScreen(),
    );
  }
}

class _TermsAndPoliciesScreen extends StatelessWidget {
  const _TermsAndPoliciesScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F7FB),
      appBar: _detailAppBar('약관 및 정책'),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 30),
        children: [
          const Text(
            '서비스 이용과 개인정보 관련 내용을 확인할 수 있어요.',
            style: TextStyle(
              color: Color(0xFF748198),
              fontSize: 12.5,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 14),
          _PolicyCard(
            items: [
              _PolicyItemData(
                icon: Icons.description_outlined,
                title: '이용약관',
                subtitle: '숨-잇 서비스 이용에 관한 약관',
                onTap: () {
                  _openPolicyDocument(context, title: '이용약관');
                },
              ),
              _PolicyItemData(
                icon: Icons.privacy_tip_outlined,
                title: '개인정보 처리방침',
                subtitle: '개인정보 처리와 보호에 관한 안내',
                onTap: () {
                  _openPolicyDocument(context, title: '개인정보 처리방침');
                },
              ),
              _PolicyItemData(
                icon: Icons.fact_check_outlined,
                title: '동의 내역',
                subtitle: '가입 시 동의한 항목과 버전을 확인',
                onTap: () {
                  _openPolicyDocument(context, title: '동의 내역');
                },
              ),
            ],
          ),
        ],
      ),
    );
  }

  static void _openPolicyDocument(
    BuildContext context, {
    required String title,
  }) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) {
          return _PolicyDocumentScreen(title: title);
        },
      ),
    );
  }
}

class _PolicyCard extends StatelessWidget {
  final List<_PolicyItemData> items;

  const _PolicyCard({required this.items});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE3EBF3)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          for (var index = 0; index < items.length; index++) ...[
            _PolicyRow(item: items[index]),
            if (index != items.length - 1)
              const Divider(
                height: 1,
                indent: 62,
                endIndent: 14,
                color: Color(0xFFEEF3F7),
              ),
          ],
        ],
      ),
    );
  }
}

class _PolicyRow extends StatelessWidget {
  final _PolicyItemData item;

  const _PolicyRow({required this.item});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: item.onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 13, 14),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: const Color(0xFFF0F5F9),
                borderRadius: BorderRadius.circular(11),
              ),
              child: Icon(item.icon, color: const Color(0xFF506A84), size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.title,
                    style: const TextStyle(
                      color: Color(0xFF2A3748),
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    item.subtitle,
                    style: const TextStyle(
                      color: Color(0xFF929EAC),
                      fontSize: 11.5,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: Color(0xFFB0BAC6)),
          ],
        ),
      ),
    );
  }
}

class _PolicyItemData {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _PolicyItemData({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
}

class _PolicyDocumentScreen extends StatelessWidget {
  final String title;

  const _PolicyDocumentScreen({required this.title});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F7FB),
      appBar: _detailAppBar(title),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 30),
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: const Color(0xFFE3EBF3)),
            ),
            child: Text(
              title == '동의 내역'
                  ? '가입 시 동의한 항목, 동의 일시, 약관 버전 정보를 이 화면에 연결하면 됩니다.'
                  : '[$title]\n\n추후 확정된 $title 본문을 이 영역에 연결하면 됩니다.',
              style: const TextStyle(
                color: Color(0xFF566579),
                fontSize: 13,
                height: 1.7,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

PreferredSizeWidget _detailAppBar(String title) {
  return AppBar(
    backgroundColor: Colors.white,
    surfaceTintColor: Colors.white,
    elevation: 0,
    scrolledUnderElevation: 0,
    centerTitle: false,
    iconTheme: const IconThemeData(color: Color(0xFF27364B)),
    title: Text(
      title,
      style: const TextStyle(
        color: Color(0xFF172033),
        fontSize: 18,
        fontWeight: FontWeight.w800,
      ),
    ),
    bottom: const PreferredSize(
      preferredSize: Size.fromHeight(1),
      child: Divider(height: 1, color: Color(0xFFE8EEF4)),
    ),
  );
}

class _DarkModeSettingScreen extends StatefulWidget {
  const _DarkModeSettingScreen();

  @override
  State<_DarkModeSettingScreen> createState() => _DarkModeSettingScreenState();
}

class _DarkModeSettingScreenState extends State<_DarkModeSettingScreen> {
  static const Color _primary = Color(0xFF2F80ED);

  bool? _isDark;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    // 처음 화면에 들어왔을 때만 현재 앱 테마 상태를 가져온다.
    // 이후 스위치 조작 중에는 로컬 상태를 유지해서 즉시 움직이도록 한다.
    _isDark ??=
        MedicalApp.of(context)?.isDarkMode ??
        Theme.of(context).brightness == Brightness.dark;
  }

  Future<void> _toggleDarkMode(bool value) async {
    // 1. 스위치와 이 화면의 색상을 먼저 즉시 변경
    setState(() {
      _isDark = value;
    });

    // 2. 앱 전체 테마 변경 + SharedPreferences 저장
    final app = MedicalApp.of(context);
    await app?.changeDarkMode(value);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = _isDark ?? Theme.of(context).brightness == Brightness.dark;

    final background = isDark
        ? const Color(0xFF101820)
        : const Color(0xFFF4F7FB);

    final surface = isDark ? const Color(0xFF17212B) : Colors.white;

    final titleColor = isDark
        ? const Color(0xFFF5F7FA)
        : const Color(0xFF172033);

    final textColor = isDark
        ? const Color(0xFFE8EDF3)
        : const Color(0xFF2A3748);

    final mutedColor = isDark
        ? const Color(0xFF9EACBA)
        : const Color(0xFF7D8A9C);

    final borderColor = isDark
        ? const Color(0xFF2A3948)
        : const Color(0xFFE3EBF3);

    return Scaffold(
      backgroundColor: background,
      appBar: AppBar(
        title: Text(
          '다크 모드',
          style: TextStyle(
            color: titleColor,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        backgroundColor: surface,
        foregroundColor: titleColor,
        surfaceTintColor: surface,
        elevation: 0,
        scrolledUnderElevation: 0,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Divider(height: 1, color: borderColor),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 32),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: surface,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: borderColor),
            ),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: isDark
                        ? const Color(0xFF1A3147)
                        : const Color(0xFFEAF4FF),
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Icon(
                    isDark ? Icons.dark_mode_rounded : Icons.dark_mode_outlined,
                    color: isDark ? const Color(0xFF6EADFF) : _primary,
                    size: 22,
                  ),
                ),

                const SizedBox(width: 12),

                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '다크 모드',
                        style: TextStyle(
                          color: textColor,
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),

                      const SizedBox(height: 4),

                      Text(
                        isDark
                            ? '어두운 화면 모드를 사용 중이에요.'
                            : '어두운 환경에서 편안하게 볼 수 있어요.',
                        style: TextStyle(
                          color: mutedColor,
                          fontSize: 11.5,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),

                Switch(
                  value: isDark,
                  onChanged: _toggleDarkMode,
                  activeTrackColor: _primary,
                  activeThumbColor: Colors.white,
                  inactiveTrackColor: isDark
                      ? const Color(0xFF394959)
                      : const Color(0xFFE0E6ED),
                  inactiveThumbColor: Colors.white,
                  trackOutlineColor: const WidgetStatePropertyAll<Color>(
                    Colors.transparent,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
