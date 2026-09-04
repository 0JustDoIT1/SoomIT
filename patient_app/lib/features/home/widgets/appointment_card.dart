import 'package:flutter/material.dart';

import '../../../shared/base_card.dart';
import '../../appointment/models/appointment.dart';

class AppointmentCard extends StatelessWidget {
  const AppointmentCard({
    super.key,
    required this.appointment,
  });

  final Appointment appointment;

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
                _getDday(appointment.scheduledAt),
                const Color(0xFFEFF6FF),
                const Color(0xFF2B66F6),
              ),
              Text(
                appointment.appointmentStatusLabel,
                style: const TextStyle(
                  fontSize: 12,
                  color: Color(0xFF2B66F6),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),

          const SizedBox(height: 12),

          Text(
            _formatDateTime(appointment.scheduledAt),
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Color(0xFF191F28),
            ),
          ),

          const SizedBox(height: 4),

          Text(
            '${appointment.displayType} · '
            '${appointment.doctorName ?? '담당 의료진 미지정'}',
            style: const TextStyle(
              fontSize: 14,
              color: Color(0xFF4E5968),
            ),
          ),

          const SizedBox(height: 4),

          Text(
            appointment.hospitalName,
            style: const TextStyle(
              fontSize: 12,
              color: Color(0xFF8B95A1),
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

  String _getDday(DateTime date) {
    final now = DateTime.now();

    final today = DateTime(
      now.year,
      now.month,
      now.day,
    );

    final target = DateTime(
      date.year,
      date.month,
      date.day,
    );

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