import 'package:flutter/material.dart';

import '../../../shared/base_card.dart';

class MedicationCard extends StatefulWidget {
  const MedicationCard({super.key});

  @override
  State<MedicationCard> createState() => _MedicationCardState();
}

class _MedicationCardState extends State<MedicationCard> {
  final Map<String, bool> _medicationStatus = {
    'morning': true,
    'evening': false,
  };

  @override
  Widget build(BuildContext context) {
    return BaseCard(
      child: Column(
        children: [
          _buildMedicationRow(
            'morning',
            '08:00 (아침)',
            '심바스타틴 20mg 외 1건',
          ),

          const Divider(
            height: 20,
            color: Color(0xFFF2F4F6),
          ),

          _buildMedicationRow(
            'evening',
            '19:00 (저녁)',
            '아스피린 100mg',
          ),
        ],
      ),
    );
  }

  Widget _buildMedicationRow(
    String key,
    String time,
    String name,
  ) {
    final bool isDone = _medicationStatus[key] ?? false;

    return Row(
      children: [
        GestureDetector(
          onTap: () {
            setState(() {
              _medicationStatus[key] = !isDone;
            });
          },
          child: Icon(
            isDone
                ? Icons.check_circle_rounded
                : Icons.radio_button_unchecked_rounded,
            color: isDone
                ? const Color(0xFF2B66F6)
                : const Color(0xFFD1D5DB),
            size: 22,
          ),
        ),

        const SizedBox(width: 12),

        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                time,
                style: TextStyle(
                  fontSize: 12,
                  color: isDone
                      ? const Color(0xFF8B95A1)
                      : const Color(0xFF4E5968),
                  fontWeight: FontWeight.w500,
                ),
              ),

              Text(
                name,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: isDone
                      ? const Color(0xFF9CA3AF)
                      : const Color(0xFF191F28),
                  decoration:
                      isDone ? TextDecoration.lineThrough : null,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}