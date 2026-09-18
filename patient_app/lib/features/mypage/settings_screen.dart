import 'package:flutter/material.dart';

import '../app_lock/app_lock_setting_screen.dart';
import 'language_setting_screen.dart';
import 'notification_setting_screen.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final currentLanguage =
        Localizations.localeOf(context).languageCode == 'en'
            ? 'English'
            : '한국어';

    return Scaffold(
      backgroundColor: const Color(0xFFF4F6F9),
      appBar: AppBar(
        title: const Text(
          '설정',
          style: TextStyle(
            fontWeight: FontWeight.w700,
            color: Color(0xFF191F28),
          ),
        ),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF191F28),
        surfaceTintColor: Colors.white,
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 32),
        children: [
          _buildSection(
            title: '앱 설정',
            children: [
              _buildSettingItem(
                icon: Icons.notifications_none_rounded,
                title: '알림 설정',
                subtitle: '예약 · 검사 · 복약 알림',
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute<void>(
                      builder: (context) {
                        return const NotificationSettingScreen();
                      },
                    ),
                  );
                },
              ),
              _divider(),
              _buildSettingItem(
                icon: Icons.lock_outline_rounded,
                title: '앱 잠금',
                subtitle: 'PIN · 지문 인증',
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute<void>(
                      builder: (context) {
                        return const AppLockSettingScreen();
                      },
                    ),
                  );
                },
              ),
              _divider(),
              _buildSettingItem(
                icon: Icons.language_rounded,
                title: '언어 설정',
                subtitle: '앱에서 사용할 언어',
                trailingText: currentLanguage,
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute<void>(
                      builder: (context) {
                        return const LanguageSettingScreen();
                      },
                    ),
                  );
                },
              ),
            ],
          ),

          const SizedBox(height: 22),

          _buildSection(
            title: '앱 정보',
            children: [
              _buildSettingItem(
                icon: Icons.info_outline_rounded,
                title: '버전 정보',
                trailingText: '1.0.0',
                showChevron: false,
                onTap: null,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSection({
    required String title,
    required List<Widget> children,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(
            left: 4,
            bottom: 8,
          ),
          child: Text(
            title,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Color(0xFF8B95A1),
            ),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: const Color(0xFFE5EAF0),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.02),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            children: children,
          ),
        ),
      ],
    );
  }

  Widget _buildSettingItem({
    required IconData icon,
    required String title,
    required VoidCallback? onTap,
    String? subtitle,
    String? trailingText,
    bool showChevron = true,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 15,
        ),
        child: Row(
          children: [
            Icon(
              icon,
              size: 24,
              color: const Color(0xFF223A70),
            ),

            const SizedBox(width: 14),

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

            if (trailingText != null)
              Text(
                trailingText,
                style: const TextStyle(
                  fontSize: 12,
                  color: Color(0xFF7C8DB5),
                ),
              ),

            if (showChevron) ...[
              const SizedBox(width: 4),
              const Icon(
                Icons.chevron_right_rounded,
                size: 20,
                color: Color(0xFFAAB2BD),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _divider() {
    return const Divider(
      height: 1,
      indent: 54,
      endIndent: 16,
      color: Color(0xFFEEF1F5),
    );
  }
}
