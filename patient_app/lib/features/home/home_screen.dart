import 'package:flutter/material.dart';
import '../appointment/models/appointment.dart';
import '../appointment/services/appointment_service.dart';
import '../exam_result/models/exam_schedule.dart';
import '../exam_result/services/exam_schedule_service.dart';
import 'widgets/appointment_card.dart';
import 'widgets/exam_card.dart';

import 'widgets/notification_card.dart';
import 'widgets/profile_card.dart';
import 'models/patient_profile.dart';
import 'services/profile_service.dart';
import 'models/patient_notification.dart';
import 'services/notification_service.dart';
import '../notification/notification_list_screen.dart';
import '../symptom/symptom_screen.dart';
import '../questionnaire/questionnaire_screen.dart';
import '../auth/existing_patient_link_screen.dart';

import '../medication/medication_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final ProfileService _profileService = ProfileService();

  final AppointmentService _appointmentService = AppointmentService();

  final ExamScheduleService _examScheduleService = ExamScheduleService();

  final NotificationService _notificationService = NotificationService();

  late Future<List<PatientNotification>> _notificationsFuture;
  late Future<PatientProfile> _profileFuture;
  late Future<List<Appointment>> _appointmentsFuture;
  late Future<List<ExamSchedule>> _examSchedulesFuture;

  @override
  void initState() {
    super.initState();

    _profileFuture = _profileService.getProfile();

    _notificationsFuture = _notificationService.getNotifications();

    _appointmentsFuture = _profileFuture.then((profile) {
      if (profile.appLinkStatus != 'LINKED') {
        return <Appointment>[];
      }

      return _appointmentService.getAppointments();
    });

    _examSchedulesFuture = _profileFuture.then((profile) {
      if (profile.appLinkStatus != 'LINKED') {
        return <ExamSchedule>[];
      }

      return _examScheduleService.getExamSchedules();
    });
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            FutureBuilder<PatientProfile>(
              future: _profileFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return _buildLoadingCard();
                }

                if (snapshot.hasError) {
                  return _buildErrorCard('환자 정보를 불러오지 못했습니다.');
                }

                final profile = snapshot.data;

                if (profile == null) {
                  return _buildEmptyCard('환자 정보가 없습니다.');
                }

                return ProfileCard(profile: profile);
              },
            ),
            FutureBuilder<PatientProfile>(
              future: _profileFuture,
              builder: (context, snapshot) {
                final profile = snapshot.data;

                if (profile == null || profile.appLinkStatus == 'LINKED') {
                  return const SizedBox.shrink();
                }

                return Padding(
                  padding: const EdgeInsets.only(top: 14),
                  child: _buildPatientLinkRequiredCard(),
                );
              },
            ),
            const SizedBox(height: 24),

            _buildSectionHeader('오늘의 건강관리', () {}),

            const SizedBox(height: 10),

            Row(
              children: [
                Expanded(
                  child: _buildHealthActionCard(
                    icon: Icons.monitor_heart_outlined,
                    title: '증상 기록',
                    subtitle: '몸 상태 기록',
                    onTap: () {
                      _openLinkedFeature(const SymptomScreen());
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildHealthActionCard(
                    icon: Icons.medication_outlined,
                    title: '복약 관리',
                    subtitle: '오늘 약 확인',
                    onTap: () {
                      _openLinkedFeature(const MedicationScreen());
                    },
                  ),
                ),
              ],
            ),

            const SizedBox(height: 12),

            _buildHealthActionCard(
              icon: Icons.assignment_outlined,
              title: '진료 전 문진',
              subtitle: '외래 진료 전 문진표 작성',
              onTap: () {
                _openLinkedFeature(const QuestionnaireScreen());
              },
            ),

            const SizedBox(height: 24),

            _buildSectionHeader('다음 진료 예약', () {}),

            const SizedBox(height: 10),

            FutureBuilder<List<Appointment>>(
              future: _appointmentsFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return _buildLoadingCard();
                }

                if (snapshot.hasError) {
                  return _buildErrorCard('예약 정보를 불러오지 못했습니다.');
                }

                final appointments = snapshot.data ?? [];

                final nextAppointment = _findNextAppointment(appointments);

                if (nextAppointment == null) {
                  return _buildEmptyCard('예정된 진료 예약이 없습니다.');
                }

                return AppointmentCard(appointment: nextAppointment);
              },
            ),

            const SizedBox(height: 24),

            _buildSectionHeader('검사 일정', () {}),

            const SizedBox(height: 10),

            FutureBuilder<List<ExamSchedule>>(
              future: _examSchedulesFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return _buildLoadingCard();
                }

                if (snapshot.hasError) {
                  return _buildErrorCard('검사 일정을 불러오지 못했습니다.');
                }

                final schedules = snapshot.data ?? [];

                if (schedules.isEmpty) {
                  return _buildEmptyCard('예정된 검사가 없습니다.');
                }

                final sorted = [...schedules]
                  ..sort((a, b) => a.scheduledAt.compareTo(b.scheduledAt));

                return ExamCard(schedule: sorted.first);
              },
            ),

            const SizedBox(height: 24),

            _buildSectionHeader('최근 알림', () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const NotificationListScreen(),
                ),
              );
            }),

            const SizedBox(height: 10),

            FutureBuilder<List<PatientNotification>>(
              future: _notificationsFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return _buildLoadingCard();
                }

                if (snapshot.hasError) {
                  return _buildErrorCard('알림을 불러오지 못했습니다.');
                }

                final notifications = snapshot.data ?? [];

                return NotificationCard(
                  notifications: notifications,
                  onNotificationTap: (notification) async {
                    if (notification.isRead) {
                      return;
                    }

                    final messenger = ScaffoldMessenger.of(context);

                    try {
                      await _notificationService.markAsRead(notification.id);

                      if (!mounted) return;

                      setState(() {
                        _notificationsFuture = _notificationService
                            .getNotifications();
                      });
                    } catch (e) {
                      if (!mounted) return;

                      messenger.showSnackBar(
                        const SnackBar(content: Text('알림 읽음 처리에 실패했습니다.')),
                      );
                    }
                  },
                );
              },
            ),

            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildPatientLinkRequiredCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFFF5F0FF),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFDCCEF7)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '환자코드 연결이 필요해요',
            style: TextStyle(
              color: Color(0xFF191F28),
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            '환자코드를 연결하면 예약, 검사결과, '
            '복약관리와 증상 기록을 사용할 수 있어요.',
            style: TextStyle(
              color: Color(0xFF6B7280),
              fontSize: 13,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (context) {
                      return const ExistingPatientLinkScreen();
                    },
                  ),
                );
              },
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF6D4FB3),
              ),
              child: const Text('환자코드 연결하기'),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _openLinkedFeature(Widget screen) async {
    final profile = await _profileFuture;

    if (!mounted) return;

    if (profile.appLinkStatus != 'LINKED') {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) {
            return const ExistingPatientLinkScreen();
          },
        ),
      );
      return;
    }

    await Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (context) => screen));
  }

  Appointment? _findNextAppointment(List<Appointment> appointments) {
    final now = DateTime.now();

    final upcoming =
        appointments
            .where(
              (appointment) =>
                  appointment.scheduledAt.isAfter(now) &&
                  appointment.appointmentStatus != 'CANCELLED' &&
                  appointment.visitStatus == 'SCHEDULED',
            )
            .toList()
          ..sort((a, b) => a.scheduledAt.compareTo(b.scheduledAt));

    if (upcoming.isEmpty) {
      return null;
    }

    return upcoming.first;
  }

  Widget _buildLoadingCard() {
    return const SizedBox(
      height: 110,
      child: Center(child: CircularProgressIndicator()),
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
        style: const TextStyle(fontSize: 13, color: Color(0xFF8B95A1)),
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
        style: const TextStyle(fontSize: 13, color: Color(0xFF8B95A1)),
      ),
    );
  }

  Widget _buildHealthActionCard({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFE9EDF2)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: const Color(0xFFF2F5FF),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, size: 24, color: const Color(0xFF4C6FFF)),
              ),
              const SizedBox(height: 14),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF191F28),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                subtitle,
                style: const TextStyle(fontSize: 12, color: Color(0xFF8B95A1)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title, VoidCallback onMoreTap) {
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
