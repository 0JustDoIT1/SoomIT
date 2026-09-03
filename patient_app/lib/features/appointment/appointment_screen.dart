import 'package:flutter/material.dart';

import 'models/appointment.dart';
import 'services/appointment_service.dart';

class AppointmentScreen extends StatefulWidget {
  const AppointmentScreen({super.key});

  @override
  State<AppointmentScreen> createState() => _AppointmentScreenState();
}

class _AppointmentScreenState extends State<AppointmentScreen> {
  final AppointmentService _appointmentService = AppointmentService();

  late Future<List<Appointment>> _appointmentsFuture;

  @override
  void initState() {
    super.initState();
    _loadAppointments();
  }

  void _loadAppointments() {
    _appointmentsFuture = _appointmentService.getAppointments();
  }

  void _retry() {
    setState(() {
      _loadAppointments();
    });
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: FutureBuilder<List<Appointment>>(
        future: _appointmentsFuture,
        builder: (context, snapshot) {
          // API 로딩 중
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(
              child: CircularProgressIndicator(),
            );
          }

          // API 오류
          if (snapshot.hasError) {
            return _buildErrorState();
          }

          final appointments = snapshot.data ?? [];

          // 예약 데이터 없음
          if (appointments.isEmpty) {
            return _buildEmptyState();
          }

          return _buildContent(appointments);
        },
      ),
    );
  }

  Widget _buildContent(List<Appointment> appointments) {
    final upcomingAppointment = _findUpcomingAppointment(appointments);

    return RefreshIndicator(
      onRefresh: () async {
        setState(() {
          _loadAppointments();
        });

        await _appointmentsFuture;
      },
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildPageTitle(),

            const SizedBox(height: 20),

            if (upcomingAppointment != null)
              _buildUpcomingAppointment(upcomingAppointment)
            else
              _buildNoUpcomingAppointment(),

            const SizedBox(height: 28),

            _buildSectionTitle('예약 내역'),

            const SizedBox(height: 12),

            ...appointments.map(
              (appointment) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _buildAppointmentHistory(
                  date: _formatDate(appointment.scheduledAt),
                  day: _getDayOfWeek(appointment.scheduledAt),
                  time: _formatTime(appointment.scheduledAt),
                  type: appointment.displayType,
                  hospital: appointment.hospitalName,
                  doctor: appointment.doctorName ?? '담당 의료진 미지정',
                  status: _getDisplayStatus(appointment),
                  statusColor: _getStatusColor(appointment),
                ),
              ),
            ),

            const SizedBox(height: 12),

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

  Widget _buildUpcomingAppointment(Appointment appointment) {
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

          Text(
            _formatFullDate(appointment.scheduledAt),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),

          const SizedBox(height: 6),

          Text(
            _formatTimeWithPeriod(appointment.scheduledAt),
            style: const TextStyle(
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

          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(
                Icons.local_hospital_outlined,
                color: Colors.white,
                size: 20,
              ),

              const SizedBox(width: 10),

              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      appointment.hospitalName,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),

                    const SizedBox(height: 4),

                    Text(
                      appointment.doctorName ?? '담당 의료진 미지정',
                      style: const TextStyle(
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

  Widget _buildNoUpcomingAppointment() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: const Color(0xFFE9EDF2),
        ),
      ),
      child: const Row(
        children: [
          Icon(
            Icons.event_available_outlined,
            color: Color(0xFF8B95A1),
          ),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              '예정된 진료가 없습니다.',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Color(0xFF4E5968),
              ),
            ),
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
                    Expanded(
                      child: Text(
                        doctor,
                        style: const TextStyle(
                          fontSize: 13,
                          color: Color(0xFF4E5968),
                        ),
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

  Widget _buildEmptyState() {
    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildPageTitle(),

          const SizedBox(height: 60),

          const Center(
            child: Column(
              children: [
                Icon(
                  Icons.calendar_month_outlined,
                  size: 48,
                  color: Color(0xFFB0B8C1),
                ),
                SizedBox(height: 14),
                Text(
                  '예약 내역이 없습니다.',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF4E5968),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.error_outline_rounded,
              size: 48,
              color: Color(0xFF8B95A1),
            ),

            const SizedBox(height: 14),

            const Text(
              '예약 정보를 불러오지 못했습니다.',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: Color(0xFF191F28),
              ),
            ),

            const SizedBox(height: 8),

            const Text(
              '잠시 후 다시 시도해주세요.',
              style: TextStyle(
                fontSize: 13,
                color: Color(0xFF8B95A1),
              ),
            ),

            const SizedBox(height: 18),

            OutlinedButton(
              onPressed: _retry,
              child: const Text('다시 시도'),
            ),
          ],
        ),
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
              content: Text('예약 요청 기능은 추후 연결할 예정입니다.'),
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

  Appointment? _findUpcomingAppointment(
    List<Appointment> appointments,
  ) {
    final now = DateTime.now();

    final upcoming = appointments
        .where(
          (appointment) =>
              appointment.scheduledAt.isAfter(now) &&
              appointment.appointmentStatus != 'CANCELLED' &&
              appointment.visitStatus == 'SCHEDULED',
        )
        .toList()
      ..sort(
        (a, b) => a.scheduledAt.compareTo(b.scheduledAt),
      );

    if (upcoming.isEmpty) {
      return null;
    }

    return upcoming.first;
  }

  String _getDisplayStatus(Appointment appointment) {
    if (appointment.appointmentStatus == 'CANCELLED') {
      return appointment.appointmentStatusLabel;
    }

    if (appointment.visitStatus == 'VISITED') {
      return appointment.visitStatusLabel;
    }

    if (appointment.visitStatus == 'NO_SHOW') {
      return appointment.visitStatusLabel;
    }

    return appointment.appointmentStatusLabel;
  }

  Color _getStatusColor(Appointment appointment) {
    if (appointment.appointmentStatus == 'CANCELLED') {
      return const Color(0xFFE5484D);
    }

    if (appointment.visitStatus == 'VISITED') {
      return const Color(0xFF20A66A);
    }

    if (appointment.visitStatus == 'NO_SHOW') {
      return const Color(0xFF8B95A1);
    }

    return const Color(0xFF2B66F6);
  }
}

String _formatDate(DateTime date) {
  return '${date.year}.'
      '${date.month.toString().padLeft(2, '0')}.'
      '${date.day.toString().padLeft(2, '0')}';
}

String _formatTime(DateTime date) {
  final hour = date.hour == 0
      ? 12
      : date.hour > 12
          ? date.hour - 12
          : date.hour;

  final minute = date.minute.toString().padLeft(2, '0');

  return '${hour.toString().padLeft(2, '0')}:$minute';
}

String _formatTimeWithPeriod(DateTime date) {
  final period = date.hour < 12 ? '오전' : '오후';

  return '$period ${_formatTime(date)}';
}

String _formatFullDate(DateTime date) {
  return '${date.year}년 '
      '${date.month}월 '
      '${date.day}일 '
      '${_getDayOfWeek(date)}요일';
}

String _getDayOfWeek(DateTime date) {
  const days = [
    '월',
    '화',
    '수',
    '목',
    '금',
    '토',
    '일',
  ];

  return days[date.weekday - 1];
}