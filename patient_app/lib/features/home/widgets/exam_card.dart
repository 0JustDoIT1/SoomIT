import 'package:flutter/material.dart';

import '../../../shared/base_card.dart';

class ExamCard extends StatelessWidget {
  const ExamCard({super.key});

  @override
  Widget build(BuildContext context) {
    return BaseCard(
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFF3F4F6),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.medical_services_outlined,
              color: Color(0xFF4E5968),
              size: 24,
            ),
          ),

          const SizedBox(width: 14),

          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '폐기능 검사 (PFT)',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF191F28),
                  ),
                ),

                SizedBox(height: 2),

                Text(
                  '2026.09.04 (금) 09:30',
                  style: TextStyle(
                    fontSize: 13,
                    color: Color(0xFF4E5968),
                  ),
                ),

                Text(
                  '본관 2층 검사실',
                  style: TextStyle(
                    fontSize: 12,
                    color: Color(0xFF8B95A1),
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