import 'package:flutter/material.dart';

import '../appointment/models/appointment.dart';
import '../appointment/services/appointment_service.dart';
import '../auth/existing_patient_link_screen.dart';
import '../exam_result/models/exam_schedule.dart';
import '../exam_result/services/exam_schedule_service.dart';
import '../medication/medication_screen.dart';
import '../questionnaire/questionnaire_screen.dart';
import '../symptom/symptom_screen.dart';

import 'models/patient_profile.dart';
import 'services/profile_service.dart';
import 'widgets/appointment_card.dart';
import 'widgets/exam_card.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final ProfileService _profileService = ProfileService();

  final AppointmentService _appointmentService = AppointmentService();

  final ExamScheduleService _examScheduleService = ExamScheduleService();

  late Future<PatientProfile> _profileFuture;

  late Future<List<Appointment>> _appointmentsFuture;

  late Future<List<ExamSchedule>> _examSchedulesFuture;

  static const Color _primaryBlue = Color(0xFF3198F4);

  static const Color _strongBlue = Color(0xFF2F8DFE);

  static const Color _background = Color(0xFFF5FAFF);

  static const Color _textPrimary = Color(0xFF172033);

  static const Color _textSecondary = Color(0xFF748198);

  @override
  void initState() {
    super.initState();

    _loadData();
  }

  void _loadData() {
    _profileFuture = _profileService.getProfile();

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

  Future<void> _refresh() async {
    setState(() {
      _loadData();
    });

    await Future.wait<dynamic>([
      _profileFuture,
      _appointmentsFuture,
      _examSchedulesFuture,
    ]);
  }

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: _background,
      child: RefreshIndicator(
        onRefresh: _refresh,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(
            parent: BouncingScrollPhysics(),
          ),
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 상단 인사 카드
              _buildGreeting(),

              const SizedBox(height: 16),

              // 오늘의 건강관리
              _buildHealthSection(),

              const SizedBox(height: 18),

              // 다가오는 진료 일정
              _buildAppointmentSection(),

              const SizedBox(height: 18),

              // 다가오는 검사 일정
              _buildExamSection(),

              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  // =========================================================
  // 상단 인사 카드
  // =========================================================

  Widget _buildGreeting() {
    return FutureBuilder<PatientProfile>(
      future: _profileFuture,
      builder: (context, snapshot) {
        final profile = snapshot.data;

        final name = profile?.name.trim() ?? '';

        return Container(
          width: double.infinity,

          // 기존보다 조금 더 컴팩트하게
          height: 155,

          clipBehavior: Clip.antiAlias,

          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),

            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Color(0xFFEAF7FF),
                Color(0xFFDDF2FF),
              ],
            ),

            border: Border.all(
              color: const Color(0xFFE1F1FC),
            ),
          ),

          child: Stack(
            children: [
              // 우측 배경 원
              Positioned(
                right: -45,
                top: -60,
                child: Container(
                  width: 185,
                  height: 185,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withValues(
                      alpha: 0.22,
                    ),
                  ),
                ),
              ),

              // 하단 배경 장식
              Positioned(
                left: -25,
                bottom: -80,
                child: Container(
                  width: 190,
                  height: 120,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(100),
                    color: Colors.white.withValues(
                      alpha: 0.14,
                    ),
                  ),
                ),
              ),

              // 인사말
              Positioned(
                left: 25,
                top: 23,
                right: 145,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text.rich(
                      TextSpan(
                        children: [
                          const TextSpan(
                            text: '안녕하세요,\n',
                            style: TextStyle(
                              color: _textPrimary,
                            ),
                          ),
                          TextSpan(
                            text: name.isEmpty
                                ? ''
                                : '$name님!',
                            style: const TextStyle(
                              color: _strongBlue,
                            ),
                          ),
                        ],
                      ),
                      style: const TextStyle(
                        fontSize: 24,
                        height: 1.2,
                        letterSpacing: -0.8,
                        fontWeight: FontWeight.w800,
                      ),
                    ),

                    const SizedBox(height: 13),

                    const Text(
                      '오늘도 편안한 호흡과\n함께하세요.',
                      style: TextStyle(
                        fontSize: 13,
                        height: 1.4,
                        fontWeight: FontWeight.w500,
                        color: _textSecondary,
                      ),
                    ),
                  ],
                ),
              ),

              // 숨이
              Positioned(
                right: 0,
                bottom: -6,
                child: Image.asset(
                  'assets/images/인사숨이.png',
                  width: 148,
                  height: 148,
                  fit: BoxFit.contain,
                  errorBuilder: (
                    context,
                    error,
                    stackTrace,
                  ) {
                    return const SizedBox(
                      width: 140,
                      height: 140,
                    );
                  },
                ),
              ),

              // 작은 하트
              Positioned(
                right: 122,
                top: 72,
                child: Icon(
                  Icons.favorite_rounded,
                  size: 17,
                  color: Colors.white.withValues(
                    alpha: 0.82,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  // =========================================================
  // 오늘의 건강관리
  // =========================================================

  Widget _buildHealthSection() {
    return Container(
      padding: const EdgeInsets.all(10),

      decoration: _sectionDecoration(),

      child: Column(
        children: [
          const Row(
            children: [
              _SectionIcon(
                icon: Icons.calendar_month_rounded,
              ),

              SizedBox(width: 10),

              Expanded(
                child: Text(
                  '오늘의 건강관리',
                  style: TextStyle(
                    color: _textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 15),

          Row(
            children: [
              // ===============================
              // 복약 관리
              // ===============================
              Expanded(
                child: _buildHealthCard(
                  icon: Icons.medication_rounded,

                  iconBackground: const Color(
                    0xFFE8F3FF,
                  ),

                  iconColor: const Color(
                    0xFF4A9FF8,
                  ),

                  title: '복약 관리',

                  subtitle: '오늘 복용할 약을\n확인해보세요',

                  onTap: () {
                    _openLinkedFeature(
                      Scaffold(
                        backgroundColor:
                            const Color(0xFFF5FAFF),
                        appBar: AppBar(
                          backgroundColor: Colors.white,
                          surfaceTintColor: Colors.white,
                          elevation: 0,
                          title: const Text(
                            '복약 관리',
                            style: TextStyle(
                              color: _textPrimary,
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        body: const MedicationScreen(),
                      ),
                    );
                  },
                ),
              ),

              const SizedBox(width: 3),

              // ===============================
              // 문진표
              // ===============================
              Expanded(
                child: _buildHealthCard(
                  icon: Icons.assignment_outlined,

                  iconBackground: const Color(
                    0xFFE5FBF5,
                  ),

                  iconColor: const Color(
                    0xFF21C7B7,
                  ),

                  title: '문진표',

                  subtitle: '진료 전 문진을\n작성해보세요',

                  onTap: () {
                    _openLinkedFeature(
                      const QuestionnaireScreen(),
                    );
                  },
                ),
              ),

              const SizedBox(width: 8),

              // ===============================
              // 건강 리포트
              // ===============================
              Expanded(
                child: _buildHealthCard(
                  icon: Icons.favorite_rounded,

                  iconBackground: const Color(
                    0xFFF1EBFF,
                  ),

                  iconColor: const Color(
                    0xFF8670F2,
                  ),

                  title: '건강 리포트',

                  subtitle: '증상 변화를\n한눈에 확인해보세요',

                  onTap: () {
                    _openLinkedFeature(
                      const SymptomScreen(),
                    );
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildHealthCard({
    required IconData icon,
    required Color iconBackground,
    required Color iconColor,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.white,

      borderRadius: BorderRadius.circular(18),

      child: InkWell(
        onTap: onTap,

        borderRadius: BorderRadius.circular(18),

        child: Container(
          height: 145,

          padding: const EdgeInsets.fromLTRB(
            9,
            11,
            8,
            11,
          ),

          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),

            border: Border.all(
              color: const Color(0xFFEDF2F7),
            ),
          ),

          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,

            children: [
              // 아이콘
              Container(
                width: 44,
                height: 44,

                decoration: BoxDecoration(
                  color: iconBackground,

                  borderRadius: BorderRadius.circular(
                    14,
                  ),
                ),

                child: Icon(
                  icon,
                  color: iconColor,
                  size: 24,
                ),
              ),

              const Spacer(),

              // 제목
              Row(
                crossAxisAlignment:
                    CrossAxisAlignment.center,
                children: [
                  Expanded(
                    child: Text(
                      title,

                      maxLines: 2,

                      overflow: TextOverflow.visible,

                      style: const TextStyle(
                        fontSize: 13.5,
                        height: 1.2,
                        fontWeight: FontWeight.w800,
                        color: _textPrimary,
                        letterSpacing: -0.3,
                      ),
                    ),
                  ),

                  const SizedBox(width: 1),

                  const Icon(
                    Icons.chevron_right_rounded,
                    size: 18,
                    color: Color(0xFF91A1B7),
                  ),
                ],
              ),

              const SizedBox(height: 7),

              // 설명
              Text(
                subtitle,

                maxLines: 2,

                overflow: TextOverflow.visible,

                style: const TextStyle(
                  fontSize: 10.3,
                  height: 1.4,
                  fontWeight: FontWeight.w500,
                  color: _textSecondary,
                  letterSpacing: -0.2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // =========================================================
  // 다가오는 진료 일정
  // =========================================================

  Widget _buildAppointmentSection() {
    return Container(
      padding: const EdgeInsets.all(17),

      decoration: _sectionDecoration(),

      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,

        children: [
          const Row(
            children: [
              Icon(
                Icons.calendar_month_rounded,
                color: _strongBlue,
                size: 25,
              ),

              SizedBox(width: 9),

              Text(
                '다가오는 진료 일정',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: _textPrimary,
                ),
              ),
            ],
          ),

          const SizedBox(height: 14),

          FutureBuilder<List<Appointment>>(
            future: _appointmentsFuture,

            builder: (context, snapshot) {
              if (snapshot.connectionState ==
                  ConnectionState.waiting) {
                return _buildLoadingCard();
              }

              if (snapshot.hasError) {
                return _buildEmptyState(
                  icon: Icons.calendar_month_outlined,
                  title: '진료 일정을 불러오지 못했어요.',
                  subtitle: '잠시 후 다시 확인해주세요.',
                );
              }

              final appointments =
                  snapshot.data ?? [];

              final nextAppointment =
                  _findNextAppointment(
                appointments,
              );

              if (nextAppointment == null) {
                return _buildEmptyState(
                  icon: Icons.calendar_month_outlined,
                  title: '예정된 진료 일정이 없어요.',
                  subtitle: '예약 후 일정이 여기에 표시됩니다.',
                );
              }

              return AppointmentCard(
                appointment: nextAppointment,
              );
            },
          ),
        ],
      ),
    );
  }

  // =========================================================
  // 다가오는 검사 일정
  // =========================================================

  Widget _buildExamSection() {
    return Container(
      padding: const EdgeInsets.all(17),

      decoration: _sectionDecoration(),

      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,

        children: [
          const Row(
            children: [
              Icon(
                Icons.science_outlined,
                color: _strongBlue,
                size: 25,
              ),

              SizedBox(width: 9),

              Text(
                '다가오는 검사 일정',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: _textPrimary,
                ),
              ),
            ],
          ),

          const SizedBox(height: 14),

          FutureBuilder<List<ExamSchedule>>(
            future: _examSchedulesFuture,

            builder: (context, snapshot) {
              if (snapshot.connectionState ==
                  ConnectionState.waiting) {
                return _buildLoadingCard();
              }

              if (snapshot.hasError) {
                return _buildEmptyState(
                  icon: Icons.science_outlined,
                  title: '검사 일정을 불러오지 못했어요.',
                  subtitle: '잠시 후 다시 확인해주세요.',
                );
              }

              final schedules =
                  snapshot.data ?? [];

              if (schedules.isEmpty) {
                return _buildEmptyState(
                  icon: Icons.science_outlined,
                  title: '예정된 검사가 없어요.',
                  subtitle: '검사 일정이 있으면 여기에 표시됩니다.',
                );
              }

              final sorted = [...schedules]
                ..sort(
                  (a, b) => a.scheduledAt
                      .compareTo(
                    b.scheduledAt,
                  ),
                );

              return ExamCard(
                schedule: sorted.first,
              );
            },
          ),
        ],
      ),
    );
  }

  // =========================================================
  // 빈 상태
  // =========================================================

  Widget _buildEmptyState({
    required IconData icon,
    required String title,
    required String subtitle,
  }) {
    return Container(
      width: double.infinity,

      padding: const EdgeInsets.symmetric(
        horizontal: 16,
        vertical: 18,
      ),

      decoration: BoxDecoration(
        color: const Color(0xFFF8FBFE),

        borderRadius: BorderRadius.circular(18),
      ),

      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,

            decoration: const BoxDecoration(
              color: Color(0xFFF0F5FA),
              shape: BoxShape.circle,
            ),

            child: Icon(
              icon,
              color: const Color(0xFFAAB9C9),
            ),
          ),

          const SizedBox(width: 14),

          Expanded(
            child: Column(
              crossAxisAlignment:
                  CrossAxisAlignment.start,

              children: [
                Text(
                  title,

                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF53657A),
                  ),
                ),

                const SizedBox(height: 4),

                Text(
                  subtitle,

                  style: const TextStyle(
                    fontSize: 12,
                    height: 1.4,
                    color: Color(0xFF94A2B3),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLoadingCard() {
    return const SizedBox(
      height: 90,

      child: Center(
        child: CircularProgressIndicator(
          strokeWidth: 2.5,
          color: _primaryBlue,
        ),
      ),
    );
  }

  // =========================================================
  // 공통 섹션 스타일
  // =========================================================

  BoxDecoration _sectionDecoration() {
    return BoxDecoration(
      color: Colors.white,

      borderRadius: BorderRadius.circular(24),

      border: Border.all(
        color: const Color(0xFFEAF1F7),
      ),

      boxShadow: [
        BoxShadow(
          color: const Color(
            0xFF4D86B9,
          ).withValues(
            alpha: 0.05,
          ),

          blurRadius: 18,

          offset: const Offset(0, 5),
        ),
      ],
    );
  }

  // =========================================================
  // 환자 연결 확인
  // =========================================================

  Future<void> _openLinkedFeature(
    Widget screen,
  ) async {
    try {
      final profile = await _profileFuture;

      if (!mounted) {
        return;
      }

      if (profile.appLinkStatus != 'LINKED') {
        await Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) {
              return const ExistingPatientLinkScreen();
            },
          ),
        );

        return;
      }

      if (!mounted) {
        return;
      }

      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => screen,
        ),
      );
    } catch (_) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            '환자 정보를 확인하지 못했습니다.',
          ),
        ),
      );
    }
  }

  // =========================================================
  // 가장 가까운 예약 찾기
  // =========================================================

  Appointment? _findNextAppointment(
    List<Appointment> appointments,
  ) {
    final now = DateTime.now();

    final upcoming =
        appointments
            .where(
              (appointment) =>
                  appointment.scheduledAt.isAfter(
                    now,
                  ) &&
                  appointment.appointmentStatus !=
                      'CANCELLED' &&
                  appointment.visitStatus ==
                      'SCHEDULED',
            )
            .toList()
          ..sort(
            (a, b) => a.scheduledAt.compareTo(
              b.scheduledAt,
            ),
          );

    if (upcoming.isEmpty) {
      return null;
    }

    return upcoming.first;
  }
}

// ===========================================================
// 섹션 아이콘
// ===========================================================

class _SectionIcon extends StatelessWidget {
  final IconData icon;

  const _SectionIcon({
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 36,
      height: 36,

      decoration: BoxDecoration(
        color: const Color(0xFFE8F3FF),

        borderRadius: BorderRadius.circular(12),
      ),

      child: Icon(
        icon,
        size: 21,
        color: const Color(0xFF3198F4),
      ),
    );
  }
}