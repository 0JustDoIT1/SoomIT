import 'package:flutter/material.dart';

import '../../../shared/base_card.dart';
import '../../exam_result/models/exam_schedule.dart';

class ExamCard extends StatelessWidget {
  const ExamCard({
    super.key,
    required this.schedule,
  });

  final ExamSchedule schedule;

  @override
  Widget build(BuildContext context) {
    return BaseCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
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

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  schedule.examName,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF191F28),
                  ),
                ),

                const SizedBox(height: 3),

                Text(
                  _formatDateTime(schedule.scheduledAt),
                  style: const TextStyle(
                    fontSize: 13,
                    color: Color(0xFF4E5968),
                  ),
                ),

                if (schedule.hospitalName != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    schedule.hospitalName!,
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF8B95A1),
                    ),
                  ),
                ],

                if (schedule.doctorName != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    schedule.doctorName!,
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF8B95A1),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatDateTime(DateTime date) {
    final local = date.toLocal();

    final period = local.hour < 12 ? '오전' : '오후';

    final hour = local.hour == 0
        ? 12
        : local.hour > 12
            ? local.hour - 12
            : local.hour;

    final minute = local.minute.toString().padLeft(2, '0');

    return '${local.year}.'
        '${local.month.toString().padLeft(2, '0')}.'
        '${local.day.toString().padLeft(2, '0')} '
        '$period $hour:$minute';
  }
}