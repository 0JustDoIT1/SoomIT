import 'package:flutter/material.dart';

import '../appointment/models/appointment.dart';
import '../appointment/services/appointment_service.dart';
import '../exam_result/models/exam_schedule.dart';
import '../exam_result/services/exam_schedule_service.dart';

import 'widgets/appointment_card.dart';
import 'widgets/exam_card.dart';
import 'widgets/medication_card.dart';
import 'widgets/notification_card.dart';
import 'widgets/profile_card.dart';

import 'models/patient_profile.dart';
import 'services/profile_service.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final ProfileService _profileService = ProfileService();
  
  final AppointmentService _appointmentService =
      AppointmentService();

  final ExamScheduleService _examScheduleService =
      ExamScheduleService();
  

  late Future<PatientProfile> _profileFuture;
  late Future<List<Appointment>> _appointmentsFuture;
  late Future<List<ExamSchedule>> _examSchedulesFuture;
  

  @override
  void initState() {
    super.initState();

    _profileFuture = _profileService.getProfile();

    _appointmentsFuture =
        _appointmentService.getAppointments();

    _examSchedulesFuture =
        _examScheduleService.getExamSchedules();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(
          horizontal: 20,
          vertical: 16,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            FutureBuilder<PatientProfile>(
              future: _profileFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState ==
                    ConnectionState.waiting) {
                  return _buildLoadingCard();
                }
            
                if (snapshot.hasError) {
                  return _buildErrorCard(
                    '환자 정보를 불러오지 못했습니다.',
                  );
                }
            
                final profile = snapshot.data;
            
                if (profile == null) {
                  return _buildEmptyCard(
                    '환자 정보가 없습니다.',
                  );
                }
            
                return ProfileCard(
                  profile: profile,
                );
              },
            ),

            const SizedBox(height: 24),

            _buildSectionHeader(
              '다음 진료 예약',
              () {},
            ),

            const SizedBox(height: 10),

            FutureBuilder<List<Appointment>>(
              future: _appointmentsFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState ==
                    ConnectionState.waiting) {
                  return _buildLoadingCard();
                }

                if (snapshot.hasError) {
                  return _buildErrorCard(
                    '예약 정보를 불러오지 못했습니다.',
                  );
                }

                final appointments = snapshot.data ?? [];

                final nextAppointment =
                    _findNextAppointment(appointments);

                if (nextAppointment == null) {
                  return _buildEmptyCard(
                    '예정된 진료 예약이 없습니다.',
                  );
                }

                return AppointmentCard(
                  appointment: nextAppointment,
                );
              },
            ),

            const SizedBox(height: 24),

            _buildSectionHeader(
              '검사 일정',
              () {},
            ),

            const SizedBox(height: 10),

            FutureBuilder<List<ExamSchedule>>(
              future: _examSchedulesFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState ==
                    ConnectionState.waiting) {
                  return _buildLoadingCard();
                }

                if (snapshot.hasError) {
                  return _buildErrorCard(
                    '검사 일정을 불러오지 못했습니다.',
                  );
                }

                final schedules = snapshot.data ?? [];

                if (schedules.isEmpty) {
                  return _buildEmptyCard(
                    '예정된 검사가 없습니다.',
                  );
                }

                final sorted = [...schedules]
                  ..sort(
                    (a, b) => a.scheduledAt
                        .compareTo(b.scheduledAt),
                  );

                return ExamCard(
                  schedule: sorted.first,
                );
              },
            ),

            const SizedBox(height: 24),

            _buildSectionHeader(
              '오늘의 복약',
              () {},
            ),

            const SizedBox(height: 10),

            const MedicationCard(),

            const SizedBox(height: 24),

            _buildSectionHeader(
              '최근 알림',
              () {},
            ),

            const SizedBox(height: 10),

            const NotificationCard(),

            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Appointment? _findNextAppointment(
    List<Appointment> appointments,
  ) {
    final now = DateTime.now();

    final upcoming = appointments
        .where(
          (appointment) =>
              appointment.scheduledAt.isAfter(now) &&
              appointment.appointmentStatus !=
                  'CANCELLED' &&
              appointment.visitStatus == 'SCHEDULED',
        )
        .toList()
      ..sort(
        (a, b) =>
            a.scheduledAt.compareTo(b.scheduledAt),
      );

    if (upcoming.isEmpty) {
      return null;
    }

    return upcoming.first;
  }

  Widget _buildLoadingCard() {
    return const SizedBox(
      height: 110,
      child: Center(
        child: CircularProgressIndicator(),
      ),
    );
  }

  Widget _buildErrorCard(String message) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(
        message,
        style: const TextStyle(
          fontSize: 13,
          color: Color(0xFF8B95A1),
        ),
      ),
    );
  }

  Widget _buildEmptyCard(String message) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(
        message,
        style: const TextStyle(
          fontSize: 13,
          color: Color(0xFF8B95A1),
        ),
      ),
    );
  }

  Widget _buildSectionHeader(
    String title,
    VoidCallback onMoreTap,
  ) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.bold,
            color: Color(0xFF191F28),
          ),
        ),
        GestureDetector(
          onTap: onMoreTap,
          child: const Row(
            children: [
              Text(
                '전체보기',
                style: TextStyle(
                  fontSize: 13,
                  color: Color(0xFF8B95A1),
                  fontWeight: FontWeight.w500,
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                size: 18,
                color: Color(0xFF8B95A1),
              ),
            ],
          ),
        ),
      ],
    );
  }
}