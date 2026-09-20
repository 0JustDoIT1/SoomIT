import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../../main.dart';

class LanguageSettingScreen extends StatefulWidget {
  const LanguageSettingScreen({super.key});

  @override
  State<LanguageSettingScreen> createState() => _LanguageSettingScreenState();
}

class _LanguageSettingScreenState extends State<LanguageSettingScreen> {
  static const Color _background = Color(0xFFF4F7FB);
  static const Color _surface = Colors.white;
  static const Color _primary = Color(0xFF2F80ED);
  static const Color _navy = Color(0xFF172033);
  static const Color _text = Color(0xFF2A3748);
  static const Color _muted = Color(0xFF7D8A9C);
  static const Color _border = Color(0xFFE3EBF3);
  static const Color _softBlue = Color(0xFFEAF4FF);

  String? _selectedLanguage;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    _selectedLanguage ??= Localizations.localeOf(context).languageCode;
  }

  void _changeLanguage(String languageCode) {
    setState(() {
      _selectedLanguage = languageCode;
    });

    MedicalApp.of(context)?.changeLanguage(languageCode);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final selectedLanguage =
        _selectedLanguage ?? Localizations.localeOf(context).languageCode;

    return Scaffold(
      backgroundColor: _background,
      appBar: AppBar(
        title: Text(
          l10n.languageSettings,
          style: const TextStyle(
            color: _navy,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF27364B),
        surfaceTintColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, color: Color(0xFFE8EEF4)),
        ),
      ),
      body: RadioGroup<String>(
        groupValue: selectedLanguage,
        onChanged: (value) {
          if (value == null) return;
          _changeLanguage(value);
        },
        child: ListView(
          physics: const BouncingScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 32),
          children: [
            _buildIntroCard(selectedLanguage: selectedLanguage),

            const SizedBox(height: 24),

            _buildSectionHeader(
              title: '언어 선택',
              subtitle: '숨-잇에서 사용할 언어를 선택해주세요.',
            ),

            const SizedBox(height: 10),

            _buildLanguageCard(
              children: [
                _buildLanguageItem(
                  value: 'ko',
                  title: l10n.korean,
                  subtitle: '한국어',
                  symbol: '가',
                  selected: selectedLanguage == 'ko',
                ),

                const Divider(
                  height: 1,
                  indent: 68,
                  endIndent: 14,
                  color: Color(0xFFEEF3F7),
                ),

                _buildLanguageItem(
                  value: 'en',
                  title: l10n.english,
                  subtitle: 'English',
                  symbol: 'A',
                  selected: selectedLanguage == 'en',
                ),
              ],
            ),

            const SizedBox(height: 16),

            _buildGuide(),
          ],
        ),
      ),
    );
  }

  Widget _buildIntroCard({required String selectedLanguage}) {
    final isKorean = selectedLanguage == 'ko';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFFF0F7FF),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFD8EAFB)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFDCEAF7)),
            ),
            child: const Icon(
              Icons.language_rounded,
              color: _primary,
              size: 24,
            ),
          ),

          const SizedBox(width: 13),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '사용 언어를 선택해보세요',
                  style: TextStyle(
                    color: _navy,
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),

                const SizedBox(height: 5),

                const Text(
                  '선택한 언어는 앱 화면에 바로 적용되고 '
                  '다시 실행해도 유지돼요.',
                  style: TextStyle(
                    color: Color(0xFF71829A),
                    fontSize: 11.5,
                    height: 1.5,
                    fontWeight: FontWeight.w500,
                  ),
                ),

                const SizedBox(height: 10),

                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: const Color(0xFFDCEAF7)),
                  ),
                  child: Text(
                    isKorean ? '현재 한국어' : 'Current English',
                    style: const TextStyle(
                      color: _primary,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
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

  Widget _buildLanguageCard({required List<Widget> children}) {
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

  Widget _buildLanguageItem({
    required String value,
    required String title,
    required String subtitle,
    required String symbol,
    required bool selected,
  }) {
    return InkWell(
      onTap: () {
        _changeLanguage(value);
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.fromLTRB(14, 14, 13, 14),
        color: selected ? const Color(0xFFFAFCFF) : Colors.white,
        child: Row(
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 160),
              width: 42,
              height: 42,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: selected ? _softBlue : const Color(0xFFF2F5F8),
                borderRadius: BorderRadius.circular(13),
                border: Border.all(
                  color: selected
                      ? const Color(0xFFC7E1FF)
                      : const Color(0xFFE8EDF2),
                ),
              ),
              child: Text(
                symbol,
                style: TextStyle(
                  color: selected ? _primary : const Color(0xFF647589),
                  fontSize: symbol == 'A' ? 18 : 17,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),

            const SizedBox(width: 12),

            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: selected ? _navy : _text,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),

                  const SizedBox(height: 4),

                  Text(
                    subtitle,
                    style: const TextStyle(
                      color: Color(0xFF929EAC),
                      fontSize: 11.5,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(width: 10),

            Radio<String>(
              value: value,
              activeColor: _primary,
              visualDensity: VisualDensity.compact,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGuide() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE5ECF3)),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline_rounded, size: 18, color: Color(0xFF6B7F95)),

          SizedBox(width: 9),

          Expanded(
            child: Text(
              '언어를 선택하면 메뉴, 버튼, 안내 문구 등 '
              '지원되는 앱 화면의 언어가 바로 변경됩니다.',
              style: TextStyle(color: _muted, fontSize: 11.5, height: 1.5),
            ),
          ),
        ],
      ),
    );
  }
}
