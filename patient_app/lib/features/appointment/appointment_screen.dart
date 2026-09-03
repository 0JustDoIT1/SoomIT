import 'package:flutter/material.dart';

import 'mock/appointment_mock.dart';

class AppointmentScreen extends StatelessWidget {
  const AppointmentScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildPageTitle(),
            const SizedBox(height: 20),

            _buildUpcomingAppointment(),

            const SizedBox(height: 28),

            _buildSectionTitle('예약 내역'),
            const SizedBox(height: 12),

            ...mockAppointments.map(
            (appointment) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _buildAppointmentHistory(
                date: _formatDate(appointment.scheduledAt),
                day: _getDayOfWeek(appointment.scheduledAt),
                time: _formatTime(appointment.scheduledAt),
                type: appointment.type,
                hospital: appointment.hospital,
                doctor: appointment.doctor,
                status: appointment.status,
                statusColor: appointment.status == '예약 확정'
                    ? const Color(0xFF2B66F6)
                    : const Color(0xFF20A66A),
              ),
            ),
          ),

            const SizedBox(height: 24),

            _buildRequestButton(context),
          ],
        ),
      ),
    );
  }

  Widget _buildPageTitle() {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '진료 예약',
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w800,
            color: Color(0xFF191F28),
          ),
        ),
        SizedBox(height: 6),
        Text(
          '진료 및 검사 일정을 확인해보세요.',
          style: TextStyle(
            fontSize: 14,
            color: Color(0xFF8B95A1),
          ),
        ),
      ],
    );
  }

  Widget _buildUpcomingAppointment() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF2B66F6),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF2B66F6).withValues(alpha: 0.18),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text(
                  '다음 진료',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const Spacer(),
              const Icon(
                Icons.calendar_month_rounded,
                color: Colors.white,
                size: 22,
              ),
            ],
          ),

          const SizedBox(height: 18),

          const Text(
            '2026년 9월 18일 금요일',
            style: TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),

          const SizedBox(height: 6),

          const Text(
            '오전 10:30',
            style: TextStyle(
              color: Colors.white,
              fontSize: 15,
              fontWeight: FontWeight.w500,
            ),
          ),

          const SizedBox(height: 18),

          Container(
            height: 1,
            color: Colors.white.withValues(alpha: 0.2),
          ),

          const SizedBox(height: 16),

          const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                Icons.local_hospital_outlined,
                color: Colors.white,
                size: 20,
              ),
              SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '숨-잇 호흡기내과',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    SizedBox(height: 4),
                    Text(
                      '담당 의료진',
                      style: TextStyle(
                        color: Colors.white70,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: const TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.w800,
        color: Color(0xFF191F28),
      ),
    );
  }

  Widget _buildAppointmentHistory({
    required String date,
    required String day,
    required String time,
    required String type,
    required String hospital,
    required String doctor,
    required String status,
    required Color statusColor,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(17),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: const Color(0xFFE9EDF2),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 58,
            padding: const EdgeInsets.symmetric(vertical: 9),
            decoration: BoxDecoration(
              color: const Color(0xFFF4F7FF),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              children: [
                Text(
                  day,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF8B95A1),
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  date.substring(5),
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF2B66F6),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(width: 14),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        type,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF191F28),
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.09),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        status,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: statusColor,
                        ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 8),

                Row(
                  children: [
                    const Icon(
                      Icons.access_time_rounded,
                      size: 15,
                      color: Color(0xFF8B95A1),
                    ),
                    const SizedBox(width: 5),
                    Text(
                      time,
                      style: const TextStyle(
                        fontSize: 13,
                        color: Color(0xFF4E5968),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 5),

                Row(
                  children: [
                    const Icon(
                      Icons.local_hospital_outlined,
                      size: 15,
                      color: Color(0xFF8B95A1),
                    ),
                    const SizedBox(width: 5),
                    Expanded(
                      child: Text(
                        hospital,
                        style: const TextStyle(
                          fontSize: 13,
                          color: Color(0xFF4E5968),
                        ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 5),

                Row(
                  children: [
                    const Icon(
                      Icons.person_outline_rounded,
                      size: 15,
                      color: Color(0xFF8B95A1),
                    ),
                    const SizedBox(width: 5),
                    Text(
                      doctor,
                      style: const TextStyle(
                        fontSize: 13,
                        color: Color(0xFF4E5968),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRequestButton(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: OutlinedButton.icon(
        onPressed: () {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('예약 요청 기능은 API 연결 후 사용할 수 있어요.'),
            ),
          );
        },
        icon: const Icon(
          Icons.add_rounded,
          size: 21,
        ),
        label: const Text(
          '진료 예약 요청',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
          ),
        ),
        style: OutlinedButton.styleFrom(
          foregroundColor: const Color(0xFF2B66F6),
          side: const BorderSide(
            color: Color(0xFF2B66F6),
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      ),
    );
  }
}

String _formatDate(DateTime date) {
  return '${date.year}.${date.month.toString().padLeft(2, '0')}.${date.day.toString().padLeft(2, '0')}';
}

String _formatTime(DateTime date) {
  final hour = date.hour > 12 ? date.hour - 12 : date.hour;
  final minute = date.minute.toString().padLeft(2, '0');

  return '${hour.toString().padLeft(2, '0')}:$minute';
}

String _getDayOfWeek(DateTime date) {
  const days = ['월', '화', '수', '목', '금', '토', '일'];
  return days[date.weekday - 1];
}