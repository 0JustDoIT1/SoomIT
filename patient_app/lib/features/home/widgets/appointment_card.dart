import 'package:flutter/material.dart';

import '../../appointment/models/appointment.dart';

class AppointmentCard extends StatelessWidget {
  const AppointmentCard({super.key, required this.appointment});

  final Appointment appointment;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final surface =
        isDark ? const Color(0xFF1B2834) : Colors.white;

    final border =
        isDark ? const Color(0xFF2A3948) : const Color(0xFFEAF1F7);

    final titleColor =
        isDark ? const Color(0xFFF5F7FA) : const Color(0xFF191F28);

    final bodyColor =
        isDark ? const Color(0xFFE8EDF3) : const Color(0xFF4E5968);

    final mutedColor =
        isDark ? const Color(0xFF9EACBA) : const Color(0xFF8B95A1);

    final tagBackground =
        isDark ? const Color(0xFF1A3147) : const Color(0xFFEFF6FF);

    final tagText =
        isDark ? const Color(0xFF6EADFF) : const Color(0xFF2B66F6);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: border),
        boxShadow: [
          BoxShadow(
            color: isDark
                ? Colors.black.withValues(alpha: 0.12)
                : const Color(0xFF4D86B9).withValues(alpha: 0.05),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _buildTag(
                _getDday(appointment.scheduledAt),
                tagBackground,
                tagText,
              ),
              Text(
                appointment.appointmentStatusLabel,
                style: TextStyle(
                  fontSize: 12,
                  color: tagText,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            _formatDateTime(appointment.scheduledAt),
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: titleColor,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${appointment.displayType} · '
            '${appointment.doctorName ?? '담당 의료진 미지정'}',
            style: TextStyle(
              fontSize: 14,
              color: bodyColor,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            appointment.hospitalName,
            style: TextStyle(
              fontSize: 12,
              color: mutedColor,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTag(String text, Color backgroundColor, Color textColor) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
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

  String _getDday(DateTime date) {
    final now = DateTime.now();

    final today = DateTime(now.year, now.month, now.day);
    final target = DateTime(date.year, date.month, date.day);
    final difference = target.difference(today).inDays;

    if (difference == 0) {
      return 'D-DAY';
    }

    if (difference > 0) {
      return 'D-$difference';
    }

    return '지난 예약';
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
