import 'package:flutter/material.dart';

class SymptomStatusStyle {
  final Color backgroundColor;
  final Color foregroundColor;
  final IconData icon;

  const SymptomStatusStyle({
    required this.backgroundColor,
    required this.foregroundColor,
    required this.icon,
  });
}

SymptomStatusStyle symptomStatusStyle(String riskLevel) {
  switch (riskLevel) {
    case 'RED':
      return const SymptomStatusStyle(
        backgroundColor: Color(0xFFFFEBEE),
        foregroundColor: Color(0xFFD32F2F),
        icon: Icons.error_outline,
      );
    case 'YELLOW':
      return const SymptomStatusStyle(
        backgroundColor: Color(0xFFFFF8E1),
        foregroundColor: Color(0xFFF57C00),
        icon: Icons.warning_amber_rounded,
      );
    default:
      return const SymptomStatusStyle(
        backgroundColor: Color(0xFFE8F5E9),
        foregroundColor: Color(0xFF2E7D32),
        icon: Icons.check_circle_outline,
      );
  }
}
