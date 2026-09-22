import 'package:flutter/material.dart';

import 'exam_result_detail_screen.dart';
import 'exam_schedule_detail_screen.dart';
import 'mock/exam_result_mock.dart';
import 'mock/exam_schedule_mock.dart';
import 'models/exam_result.dart';
import 'models/exam_schedule.dart';
import 'services/exam_result_service.dart';
import 'services/exam_schedule_service.dart';

class ExamResultScreen extends StatefulWidget {
  const ExamResultScreen({super.key});

  @override
  State<ExamResultScreen> createState() => _ExamResultScreenState();
}

class _ExamResultScreenState extends State<ExamResultScreen>
    with SingleTickerProviderStateMixin {
  static const bool _useMockResults = false;
  static const bool _useMockSchedules = false;

  static const Color _primary = Color(0xFF3198F4);
  static const Color _primaryDark = Color(0xFF2F8DFE);
  static const Color _textPrimary = Color(0xFF191F28);
  static const Color _textSecondary = Color(0xFF6B7684);
  static const Color _border = Color(0xFFE7EDF3);

  int _selectedTab = 0;
  late final TabController _tabController;
  String _selectedScheduleFilter = '전체';
  String _selectedResultFilter = '전체';

  final ExamResultService _examResultService = ExamResultService();
  final ExamScheduleService _examScheduleService = ExamScheduleService();

  late Future<List<ExamResult>> _resultsFuture;
  late Future<List<ExamSchedule>> _schedulesFuture;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
      length: 2,
      vsync: this,
      initialIndex: _selectedTab,
    );
    _loadResults();
    _loadSchedules();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _loadResults() {
    _resultsFuture = _useMockResults
        ? Future.value(mockExamResults)
        : _examResultService.getExamResults();
  }

  void _loadSchedules() {
    _schedulesFuture = _useMockSchedules
        ? Future.value(mockExamSchedules)
        : _examScheduleService.getExamSchedules();
  }

  void _retryResults() {
    setState(_loadResults);
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        children: [
          _buildTopHeader(),
          Expanded(
            child: Container(
              width: double.infinity,
              decoration: const BoxDecoration(
                color: Color(0xFFF5F9FD),
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(24),
                  topRight: Radius.circular(24),
                ),
              ),
              clipBehavior: Clip.antiAlias,
              child: IndexedStack(
                index: _selectedTab,
                children: [_buildScheduleTab(), _buildResultTab()],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTopHeader() {
    return Container(
      width: double.infinity,
      color: Colors.white,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 18, 20, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '검사 일정',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: _textPrimary,
                  ),
                ),
                SizedBox(height: 6),
                Text(
                  '예정된 검사 일정과 결과를 확인해보세요.',
                  style: TextStyle(
                    fontSize: 13,
                    height: 1.4,
                    color: Color(0xFF8B95A1),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          _buildTabBar(),
        ],
      ),
    );
  }

  Widget _buildTabBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: TabBar(
        controller: _tabController,
        indicatorColor: _primaryDark,
        indicatorWeight: 2.5,
        indicatorSize: TabBarIndicatorSize.label,
        labelColor: _primaryDark,
        unselectedLabelColor: const Color(0xFF8B95A1),
        labelStyle: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w800,
        ),
        unselectedLabelStyle: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
        dividerColor: Colors.transparent,
        onTap: (index) {
          setState(() {
            _selectedTab = index;
          });
        },
        tabs: const [
          Tab(text: '검사 일정'),
          Tab(text: '검사 결과'),
        ],
      ),
    );
  }

  Widget _buildScheduleTab() {
    return FutureBuilder<List<ExamSchedule>>(
      future: _schedulesFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(
            child: CircularProgressIndicator(color: _primary),
          );
        }

        if (snapshot.hasError) {
          return _buildScheduleErrorState();
        }

        final schedules = snapshot.data ?? [];

        if (schedules.isEmpty) {
          return _buildEmptyScheduleState();
        }

        final visibleSchedules = schedules.where((schedule) {
          if (_selectedScheduleFilter == '전체') return true;
          return _scheduleCategory(schedule) == _selectedScheduleFilter;
        }).toList();

        return RefreshIndicator(
          color: _primaryDark,
          onRefresh: () async {
            setState(_loadSchedules);
            await _schedulesFuture;
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(
              parent: BouncingScrollPhysics(),
            ),
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 30),
            children: [
              _buildScheduleFilters(schedules),
              const SizedBox(height: 18),
              if (visibleSchedules.isEmpty)
                _buildFilteredEmptyState('해당 상태의 검사 일정이 없어요.')
              else
                ...visibleSchedules.map(
                  (schedule) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _buildScheduleCard(schedule),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildScheduleFilters(List<ExamSchedule> schedules) {
    const filters = ['전체', '예정', '완료', '취소'];

    int countFor(String filter) {
      if (filter == '전체') return schedules.length;
      return schedules
          .where((item) => _scheduleCategory(item) == filter)
          .length;
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: filters.map((filter) {
          final selected = _selectedScheduleFilter == filter;
          final count = countFor(filter);

          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: InkWell(
              onTap: () {
                setState(() {
                  _selectedScheduleFilter = filter;
                });
              },
              borderRadius: BorderRadius.circular(999),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 9,
                ),
                decoration: BoxDecoration(
                  color: selected ? _primaryDark : Colors.white,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: selected ? _primaryDark : _border),
                ),
                child: Text(
                  '$filter ($count)',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: selected ? Colors.white : _textSecondary,
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildScheduleCard(ExamSchedule schedule) {
    final category = _scheduleCategory(schedule);
    final statusStyle = _scheduleStatusStyle(category);

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () => _openScheduleDetail(schedule),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: _border),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF172033).withValues(alpha: 0.025),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: const Color(0xFFEAF5FF),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(
                      _examIcon(schedule.examType),
                      color: _primaryDark,
                      size: 23,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      schedule.examName,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: _textPrimary,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: statusStyle.background,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      statusStyle.label,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: statusStyle.foreground,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              _scheduleInfoRow(
                Icons.calendar_today_outlined,
                _formatScheduleDate(schedule.scheduledAt),
              ),
              if (schedule.hospitalName != null) ...[
                const SizedBox(height: 8),
                _scheduleInfoRow(
                  Icons.local_hospital_outlined,
                  '${schedule.hospitalName!} · ${_departmentLabel(schedule.examType)}',
                ),
              ],
              if (schedule.doctorName != null) ...[
                const SizedBox(height: 8),
                _scheduleInfoRow(
                  Icons.person_outline_rounded,
                  schedule.doctorName!,
                ),
              ],
              if (category == '예정' &&
                  schedule.preparationGuide != null &&
                  schedule.preparationGuide!.trim().isNotEmpty) ...[
                const SizedBox(height: 14),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(
                        Icons.info_outline_rounded,
                        size: 18,
                        color: Color(0xFF7D8DA1),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          schedule.preparationGuide!,
                          style: const TextStyle(
                            fontSize: 12,
                            height: 1.45,
                            color: _textSecondary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  void _openScheduleDetail(ExamSchedule schedule) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ExamScheduleDetailScreen(
          schedule: schedule,
          onViewResult: () {
            Navigator.of(context).pop();
            if (!mounted) return;
            _tabController.animateTo(1);
            setState(() {
              _selectedTab = 1;
            });
          },
        ),
      ),
    );
  }

  Widget _scheduleInfoRow(IconData icon, String text) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 16, color: const Color(0xFF8B95A1)),
        const SizedBox(width: 7),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(
              fontSize: 13,
              height: 1.4,
              color: _textSecondary,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildResultTab() {
    return FutureBuilder<List<ExamResult>>(
      future: _resultsFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(
            child: CircularProgressIndicator(color: _primary),
          );
        }

        if (snapshot.hasError) {
          return _buildResultErrorState();
        }

        final results = snapshot.data ?? [];

        if (results.isEmpty) {
          return RefreshIndicator(
            color: _primaryDark,
            onRefresh: () async {
              setState(_loadResults);
              await _resultsFuture;
            },
            child: _buildEmptyResultState(),
          );
        }

        final visibleResults = results.where((exam) {
          if (_selectedResultFilter == '전체') return true;
          return _resultCategory(exam) == _selectedResultFilter;
        }).toList();

        return RefreshIndicator(
          color: _primaryDark,
          onRefresh: () async {
            setState(_loadResults);
            await _resultsFuture;
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(
              parent: BouncingScrollPhysics(),
            ),
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 30),
            children: [
              _buildResultFilters(results),
              const SizedBox(height: 18),
              if (visibleResults.isEmpty)
                _buildFilteredEmptyState('해당 분류의 검사 결과가 없어요.')
              else
                ...visibleResults.map(
                  (exam) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _buildResultCard(exam),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildResultFilters(List<ExamResult> results) {
    const filters = ['전체', '영상', '병리'];

    int countFor(String filter) {
      if (filter == '전체') return results.length;
      return results.where((item) => _resultCategory(item) == filter).length;
    }

    return Row(
      children: filters.map((filter) {
        final selected = _selectedResultFilter == filter;
        final count = countFor(filter);

        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(right: filter == filters.last ? 0 : 8),
            child: InkWell(
              onTap: () {
                setState(() {
                  _selectedResultFilter = filter;
                });
              },
              borderRadius: BorderRadius.circular(999),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 9),
                decoration: BoxDecoration(
                  color: selected ? _primaryDark : Colors.white,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: selected ? _primaryDark : _border),
                ),
                child: Text(
                  '$filter ($count)',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: selected ? Colors.white : _textSecondary,
                  ),
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildResultCard(ExamResult exam) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => ExamResultDetailScreen(exam: exam),
            ),
          );
        },
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: _border),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF172033).withValues(alpha: 0.025),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: const Color(0xFFF0FBF6),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.fact_check_outlined,
                      color: Color(0xFF20A66A),
                      size: 23,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      exam.examName,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: _textPrimary,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEAF8F1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      exam.resultStatusLabel,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF20A66A),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Icon(
                    Icons.calendar_today_outlined,
                    size: 16,
                    color: Color(0xFF8B95A1),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    _formatDate(exam.resultDate),
                    style: const TextStyle(
                      fontSize: 13,
                      color: Color(0xFF8B95A1),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                exam.resultSummary,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 13,
                  height: 1.5,
                  color: _textSecondary,
                ),
              ),
              const SizedBox(height: 12),
              const Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Text(
                    '결과 자세히 보기',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: _primaryDark,
                    ),
                  ),
                  SizedBox(width: 2),
                  Icon(
                    Icons.chevron_right_rounded,
                    size: 20,
                    color: _primaryDark,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFilteredEmptyState(String text) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 14),
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 36),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _border),
      ),
      child: Column(
        children: [
          const Icon(Icons.inbox_outlined, size: 40, color: Color(0xFFB0B8C1)),
          const SizedBox(height: 10),
          Text(
            text,
            style: const TextStyle(fontSize: 14, color: _textSecondary),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyScheduleState() {
    return RefreshIndicator(
      color: _primaryDark,
      onRefresh: () async {
        setState(_loadSchedules);
        await _schedulesFuture;
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 22, 16, 28),
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(22, 34, 22, 32),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: const Color(0xFFE2ECF5)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x0C1B4B72),
                  blurRadius: 16,
                  offset: Offset(0, 7),
                ),
              ],
            ),
            child: const Column(
              children: [
                CircleAvatar(
                  radius: 38,
                  backgroundColor: Color(0xFFEAF6FF),
                  child: Icon(
                    Icons.calendar_month_rounded,
                    size: 38,
                    color: Color(0xFF35AEE2),
                  ),
                ),
                SizedBox(height: 20),
                Text(
                  '등록된 검사 일정이 없어요.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Color(0xFF172033),
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                SizedBox(height: 9),
                Text(
                  '검사 일정이 등록되면\n이곳에서 확인할 수 있어요.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Color(0xFF8A96A8),
                    fontSize: 13,
                    height: 1.5,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildScheduleErrorState() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, size: 46, color: Color(0xFF8B95A1)),
          const SizedBox(height: 14),
          const Text(
            '검사 일정을 불러오지 못했습니다.',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 16),
          OutlinedButton(
            onPressed: () {
              setState(_loadSchedules);
            },
            child: const Text('다시 시도'),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyResultState() {
    return RefreshIndicator(
      color: _primaryDark,
      onRefresh: () async {
        setState(_loadResults);
        await _resultsFuture;
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 22, 16, 28),
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(22, 34, 22, 32),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: const Color(0xFFE2ECF5)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x0C1B4B72),
                  blurRadius: 16,
                  offset: Offset(0, 7),
                ),
              ],
            ),
            child: const Column(
              children: [
                CircleAvatar(
                  radius: 38,
                  backgroundColor: Color(0xFFEAF6FF),
                  child: Icon(
                    Icons.fact_check_rounded,
                    size: 38,
                    color: Color(0xFF35AEE2),
                  ),
                ),
                SizedBox(height: 20),
                Text(
                  '확인 가능한 검사 결과가 없어요.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Color(0xFF172033),
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                SizedBox(height: 9),
                Text(
                  '검사 결과가 등록되면\n이곳에서 확인할 수 있어요.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Color(0xFF8A96A8),
                    fontSize: 13,
                    height: 1.5,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildResultErrorState() {
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
              '검사 결과를 불러오지 못했습니다.',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: _textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              '잠시 후 다시 시도해주세요.',
              style: TextStyle(fontSize: 13, color: Color(0xFF8B95A1)),
            ),
            const SizedBox(height: 18),
            OutlinedButton(
              onPressed: _retryResults,
              child: const Text('다시 시도'),
            ),
          ],
        ),
      ),
    );
  }

  String _scheduleCategory(ExamSchedule schedule) {
    final raw = '${schedule.appointmentStatus} ${schedule.visitStatus}'
        .toUpperCase();

    if (raw.contains('CANCEL')) return '취소';
    if (raw.contains('COMPLETE') ||
        raw.contains('DONE') ||
        raw.contains('FINISH')) {
      return '완료';
    }
    return '예정';
  }

  _StatusStyle _scheduleStatusStyle(String category) {
    switch (category) {
      case '완료':
        return const _StatusStyle(
          label: '검사 완료',
          foreground: Color(0xFF20A66A),
          background: Color(0xFFEAF8F1),
        );
      case '취소':
        return const _StatusStyle(
          label: '예약 취소',
          foreground: Color(0xFFE5484D),
          background: Color(0xFFFFEEEE),
        );
      default:
        return const _StatusStyle(
          label: '검사 예정',
          foreground: _primaryDark,
          background: Color(0xFFEAF5FF),
        );
    }
  }

  String _resultCategory(ExamResult exam) {
    final type = exam.examType.toUpperCase();
    if (type.contains('PATHOLOGY') || type.contains('PDL1')) {
      return '병리';
    }
    return '영상';
  }

  IconData _examIcon(String type) {
    final value = type.toUpperCase();
    if (value.contains('PATHOLOGY') || value.contains('PDL1')) {
      return Icons.description_outlined;
    }
    return Icons.biotech_outlined;
  }

  String _departmentLabel(String type) {
    final value = type.toUpperCase();
    if (value.contains('PATHOLOGY') || value.contains('PDL1')) {
      return '병리과';
    }
    if (value.contains('PET')) {
      return '핵의학과';
    }
    return '영상의학과';
  }

  String _formatScheduleDate(DateTime date) {
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

  String _formatDate(DateTime date) {
    final local = date.toLocal();
    return '${local.year}.'
        '${local.month.toString().padLeft(2, '0')}.'
        '${local.day.toString().padLeft(2, '0')}';
  }
}

class _StatusStyle {
  const _StatusStyle({
    required this.label,
    required this.foreground,
    required this.background,
  });

  final String label;
  final Color foreground;
  final Color background;
}
