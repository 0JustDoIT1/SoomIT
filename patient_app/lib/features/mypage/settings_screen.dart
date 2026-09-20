import 'package:flutter/material.dart';

import '../../core/settings/font_scale_controller.dart';
import '../../main.dart';
import '../app_lock/app_lock_setting_screen.dart';
import 'notification_setting_screen.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  static const Color _primary = Color(0xFF2F80ED);

  bool _isDark(BuildContext context) {
    return Theme.of(context).brightness == Brightness.dark;
  }

  Color _background(BuildContext context) {
    return _isDark(context) ? const Color(0xFF101820) : const Color(0xFFF4F7FB);
  }

  Color _surface(BuildContext context) {
    return _isDark(context) ? const Color(0xFF17212B) : Colors.white;
  }

  Color _titleColor(BuildContext context) {
    return _isDark(context) ? const Color(0xFFF5F7FA) : const Color(0xFF172033);
  }

  Color _textColor(BuildContext context) {
    return _isDark(context) ? const Color(0xFFE8EDF3) : const Color(0xFF2A3748);
  }

  Color _mutedColor(BuildContext context) {
    return _isDark(context) ? const Color(0xFF9EACBA) : const Color(0xFF929EAC);
  }

  Color _borderColor(BuildContext context) {
    return _isDark(context) ? const Color(0xFF2A3948) : const Color(0xFFE3EBF3);
  }

  Color _dividerColor(BuildContext context) {
    return _isDark(context) ? const Color(0xFF253443) : const Color(0xFFEEF3F7);
  }

  Color _softBlue(BuildContext context) {
    return _isDark(context) ? const Color(0xFF1A3147) : const Color(0xFFEAF4FF);
  }

  Color _softNeutral(BuildContext context) {
    return _isDark(context) ? const Color(0xFF202E3B) : const Color(0xFFF0F5F9);
  }

  @override
  Widget build(BuildContext context) {
    final selectedLanguage = Localizations.localeOf(context).languageCode;

    final darkModeEnabled =
        MedicalApp.of(context)?.isDarkMode ??
        Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: _background(context),
      appBar: AppBar(
        title: Text(
          '설정',
          style: TextStyle(
            color: _titleColor(context),
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        backgroundColor: _surface(context),
        foregroundColor: _titleColor(context),
        surfaceTintColor: _surface(context),
        elevation: 0,
        scrolledUnderElevation: 0,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Divider(height: 1, color: _borderColor(context)),
        ),
      ),
      body: ValueListenableBuilder<AppFontSize>(
        valueListenable: fontScaleController,
        builder: (context, selectedFontSize, child) {
          return ListView(
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 32),
            children: [
              _buildIntroCard(context),

              const SizedBox(height: 24),

              _buildSectionHeader(
                context,
                title: '앱 설정',
                subtitle: '자주 사용하는 설정은 여기서 바로 변경할 수 있어요.',
              ),

              const SizedBox(height: 10),

              _buildSectionCard(
                context,
                children: [
                  _buildNavigationItem(
                    context,
                    icon: Icons.notifications_none_rounded,
                    iconColor: _primary,
                    iconBackground: _softBlue(context),
                    title: '알림 설정',
                    subtitle: '예약 · 검사 · 복약 알림을 관리해요.',
                    onTap: () {
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (context) {
                            return const NotificationSettingScreen();
                          },
                        ),
                      );
                    },
                  ),

                  _buildDivider(context),

                  _buildNavigationItem(
                    context,
                    icon: Icons.lock_outline_rounded,
                    iconColor: _isDark(context)
                        ? const Color(0xFF8AB9E8)
                        : const Color(0xFF426F9E),
                    iconBackground: _softNeutral(context),
                    title: '앱 잠금',
                    subtitle: 'PIN · 생체 인증으로 앱을 보호해요.',
                    onTap: () {
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (context) {
                            return const AppLockSettingScreen();
                          },
                        ),
                      );
                    },
                  ),

                  _buildDivider(context),

                  _buildFontSizeItem(
                    context,
                    selectedFontSize: selectedFontSize,
                  ),

                  _buildDivider(context),

                  _buildLanguageItem(
                    context,
                    selectedLanguage: selectedLanguage,
                  ),

                  _buildDivider(context),

                  _buildDarkModeItem(context, enabled: darkModeEnabled),
                ],
              ),

              const SizedBox(height: 24),

              _buildSectionHeader(context, title: '앱 정보'),

              const SizedBox(height: 10),

              _buildSectionCard(
                context,
                children: [
                  _buildInfoItem(
                    context,
                    icon: Icons.info_outline_rounded,
                    title: '버전 정보',
                    subtitle: '현재 설치된 숨-잇 앱 버전',
                    trailingText: '1.0.0',
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildIntroCard(BuildContext context) {
    final dark = _isDark(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(17),
      decoration: BoxDecoration(
        color: dark ? const Color(0xFF16293A) : const Color(0xFFF0F7FF),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: dark ? const Color(0xFF29445D) : const Color(0xFFD8EAFB),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: dark ? const Color(0xFF1D3347) : Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: dark ? const Color(0xFF31506B) : const Color(0xFFDCEAF7),
              ),
            ),
            child: const Icon(Icons.tune_rounded, color: _primary, size: 21),
          ),

          const SizedBox(width: 12),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '앱 사용 환경을 관리해보세요',
                  style: TextStyle(
                    color: _titleColor(context),
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  '복잡한 설정은 상세 화면에서, 간단한 설정은 '
                  '이 화면에서 바로 변경할 수 있어요.',
                  style: TextStyle(
                    color: dark
                        ? const Color(0xFFA8B8C8)
                        : const Color(0xFF71829A),
                    fontSize: 11.5,
                    height: 1.5,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(
    BuildContext context, {
    required String title,
    String? subtitle,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              color: _titleColor(context),
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: TextStyle(
                color: _mutedColor(context),
                fontSize: 11.5,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSectionCard(
    BuildContext context, {
    required List<Widget> children,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: _surface(context),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _borderColor(context)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(
              alpha: _isDark(context) ? 0.12 : 0.035,
            ),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(children: children),
    );
  }

  Widget _buildNavigationItem(
    BuildContext context, {
    required IconData icon,
    required Color iconColor,
    required Color iconBackground,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 13, 13, 13),
        child: Row(
          children: [
            _buildIconBox(
              icon: icon,
              iconColor: iconColor,
              background: iconBackground,
            ),

            const SizedBox(width: 12),

            Expanded(
              child: _buildTitleBlock(
                context,
                title: title,
                subtitle: subtitle,
              ),
            ),

            const SizedBox(width: 8),

            Icon(
              Icons.chevron_right_rounded,
              size: 21,
              color: _isDark(context)
                  ? const Color(0xFF708294)
                  : const Color(0xFFB0BAC6),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFontSizeItem(
    BuildContext context, {
    required AppFontSize selectedFontSize,
  }) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _buildIconBox(
                icon: Icons.text_fields_rounded,
                iconColor: _isDark(context)
                    ? const Color(0xFF8AB9E8)
                    : const Color(0xFF426F9E),
                background: _softNeutral(context),
              ),

              const SizedBox(width: 12),

              Expanded(
                child: _buildTitleBlock(
                  context,
                  title: '글자 크기',
                  subtitle: '앱에서 표시되는 글자 크기를 조절해요.',
                ),
              ),
            ],
          ),

          const SizedBox(height: 13),

          Row(
            children: [
              Expanded(
                child: _buildChoiceButton(
                  context,
                  label: '작게',
                  selected: selectedFontSize == AppFontSize.small,
                  onTap: () {
                    fontScaleController.change(AppFontSize.small);
                  },
                ),
              ),
              const SizedBox(width: 7),
              Expanded(
                child: _buildChoiceButton(
                  context,
                  label: '기본',
                  selected: selectedFontSize == AppFontSize.normal,
                  onTap: () {
                    fontScaleController.change(AppFontSize.normal);
                  },
                ),
              ),
              const SizedBox(width: 7),
              Expanded(
                child: _buildChoiceButton(
                  context,
                  label: '크게',
                  selected: selectedFontSize == AppFontSize.large,
                  onTap: () {
                    fontScaleController.change(AppFontSize.large);
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildLanguageItem(
    BuildContext context, {
    required String selectedLanguage,
  }) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _buildIconBox(
                icon: Icons.language_rounded,
                iconColor: _isDark(context)
                    ? const Color(0xFF8AB9E8)
                    : const Color(0xFF426F9E),
                background: _softNeutral(context),
              ),

              const SizedBox(width: 12),

              Expanded(
                child: _buildTitleBlock(
                  context,
                  title: '언어 설정',
                  subtitle: '앱에서 사용할 언어를 선택해요.',
                ),
              ),
            ],
          ),

          const SizedBox(height: 13),

          Row(
            children: [
              Expanded(
                child: _buildChoiceButton(
                  context,
                  label: '한국어',
                  selected: selectedLanguage == 'ko',
                  onTap: () {
                    MedicalApp.of(context)?.changeLanguage('ko');
                  },
                ),
              ),
              const SizedBox(width: 7),
              Expanded(
                child: _buildChoiceButton(
                  context,
                  label: 'English',
                  selected: selectedLanguage == 'en',
                  onTap: () {
                    MedicalApp.of(context)?.changeLanguage('en');
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildDarkModeItem(BuildContext context, {required bool enabled}) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 13, 13, 13),
      child: Row(
        children: [
          _buildIconBox(
            icon: enabled ? Icons.dark_mode_rounded : Icons.dark_mode_outlined,
            iconColor: enabled
                ? const Color(0xFF6EADFF)
                : (_isDark(context)
                      ? const Color(0xFF8EA6BF)
                      : const Color(0xFF506A84)),
            background: enabled
                ? const Color(0xFF1A3147)
                : _softNeutral(context),
          ),

          const SizedBox(width: 12),

          Expanded(
            child: _buildTitleBlock(
              context,
              title: '다크 모드',
              subtitle: enabled
                  ? '어두운 화면 모드를 사용 중이에요.'
                  : '어두운 환경에서 편안하게 볼 수 있어요.',
            ),
          ),

          const SizedBox(width: 8),

          Switch(
            value: enabled,
            onChanged: (value) {
              // main.dart의 changeDarkMode가 setState를 먼저 실행하므로
              // 스위치와 테마가 즉시 변경된다.
              MedicalApp.of(context)?.changeDarkMode(value);
            },
            activeTrackColor: _primary,
            activeThumbColor: Colors.white,
            inactiveTrackColor: _isDark(context)
                ? const Color(0xFF394959)
                : const Color(0xFFE0E6ED),
            inactiveThumbColor: Colors.white,
            trackOutlineColor: const WidgetStatePropertyAll<Color>(
              Colors.transparent,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoItem(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required String trailingText,
  }) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 13, 13, 13),
      child: Row(
        children: [
          _buildIconBox(
            icon: icon,
            iconColor: _isDark(context)
                ? const Color(0xFF9BAFC3)
                : const Color(0xFF5C6F86),
            background: _softNeutral(context),
          ),

          const SizedBox(width: 12),

          Expanded(
            child: _buildTitleBlock(context, title: title, subtitle: subtitle),
          ),

          const SizedBox(width: 8),

          Text(
            trailingText,
            style: TextStyle(
              color: _isDark(context)
                  ? const Color(0xFF9FB0C0)
                  : const Color(0xFF7D8DA2),
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildIconBox({
    required IconData icon,
    required Color iconColor,
    required Color background,
  }) {
    return Container(
      width: 38,
      height: 38,
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(11),
      ),
      child: Icon(icon, size: 20, color: iconColor),
    );
  }

  Widget _buildTitleBlock(
    BuildContext context, {
    required String title,
    required String subtitle,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: TextStyle(
            color: _textColor(context),
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          subtitle,
          style: TextStyle(
            color: _mutedColor(context),
            fontSize: 11.5,
            height: 1.35,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }

  Widget _buildChoiceButton(
    BuildContext context, {
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    final dark = _isDark(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(11),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected
                ? (dark ? const Color(0xFF1A3147) : const Color(0xFFEAF4FF))
                : (dark ? const Color(0xFF1D2935) : const Color(0xFFF7F9FC)),
            borderRadius: BorderRadius.circular(11),
            border: Border.all(
              color: selected
                  ? (dark ? const Color(0xFF315A7D) : const Color(0xFFBCD9F8))
                  : _borderColor(context),
              width: selected ? 1.3 : 1,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (selected) ...[
                const Icon(Icons.check_rounded, size: 14, color: _primary),
                const SizedBox(width: 4),
              ],
              Text(
                label,
                style: TextStyle(
                  color: selected
                      ? (dark ? const Color(0xFF79B8FF) : _primary)
                      : _textColor(context),
                  fontSize: 12,
                  fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDivider(BuildContext context) {
    return Divider(
      height: 1,
      indent: 64,
      endIndent: 14,
      color: _dividerColor(context),
    );
  }
}
