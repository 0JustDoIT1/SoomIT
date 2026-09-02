import 'package:flutter/material.dart';

import '../../../shared/base_card.dart';

class AppointmentCard extends StatelessWidget {
  const AppointmentCard({super.key});

  @override
  Widget build(BuildContext context) {
    return BaseCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _buildTag(
                'D-3',
                const Color(0xFFEFF6FF),
                const Color(0xFF2B66F6),
              ),

              const Text(
                '예약확정',
                style: TextStyle(
                  fontSize: 12,
                  color: Color(0xFF2B66F6),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),

          const SizedBox(height: 12),

          const Text(
            '2026.09.04 (금) 10:30',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Color(0xFF191F28),
            ),
          ),

          const SizedBox(height: 4),

          const Text(
            '호흡기내과 · 김의사 교수',
            style: TextStyle(
              fontSize: 14,
              color: Color(0xFF4E5968),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTag(
    String text,
    Color backgroundColor,
    Color textColor,
  ) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 8,
        vertical: 4,
      ),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.bold,
          color: textColor,
        ),
      ),
    );
  }
}