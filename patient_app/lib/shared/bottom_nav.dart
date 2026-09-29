// 하단 tapbar

import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';

class BottomNav extends StatelessWidget {
  const BottomNav({
    super.key,
    required this.currentIndex,
    required this.onTap,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    final isDark = Theme.of(context).brightness == Brightness.dark;

    final backgroundColor =
        isDark ? const Color(0xFF17212B) : Colors.white;

    final borderColor =
        isDark ? const Color(0xFF2A3948) : const Color(0xFFEEEEEE);

    final selectedColor =
        isDark ? const Color(0xFF5EA2FF) : const Color(0xFF2B66F6);

    final unselectedColor =
        isDark ? const Color(0xFF8393A3) : const Color(0xFF8B95A1);

    return Container(
      decoration: BoxDecoration(
        color: backgroundColor,
        border: Border(
          top: BorderSide(
            color: borderColor,
            width: 1,
          ),
        ),
      ),
      child: BottomNavigationBar(
        currentIndex: currentIndex,
        onTap: onTap,
        type: BottomNavigationBarType.fixed,

        backgroundColor: backgroundColor,

        selectedItemColor: selectedColor,
        unselectedItemColor: unselectedColor,

        selectedFontSize: 11,
        unselectedFontSize: 11,

        elevation: 0,

        items: [
          BottomNavigationBarItem(
            icon: const Icon(Icons.home_filled),
            label: l10n.home,
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.calendar_month_outlined),
            label: l10n.appointment,
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.assignment_outlined),
            label: l10n.examResult,
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.medication_outlined),
            label: l10n.medication,
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.person_outline),
            label: l10n.mypage,
          ),
        ],
      ),
    );
  }
}