import 'package:flutter/material.dart';

import 'models/medication_schedule.dart';
import 'services/medication_service.dart';
import 'widgets/medication_history_tab.dart';
import 'widgets/medication_taken_edit_sheet.dart';

enum _MedicationUiStatus { upcoming, taken, missed, skipped }

class MedicationScreen extends StatefulWidget {
  const MedicationScreen({super.key});

  @override
  State<MedicationScreen> createState() => _MedicationScreenState();
}

class _MedicationScreenState extends State<MedicationScreen> {
  final MedicationService _medicationService = MedicationService();

  late Future<List<MedicationSchedule>> _medicationFuture;

  final Set<String> _takenScheduleIds = {};
  final Set<String> _submittingScheduleIds = {};

  @override
  void initState() {
    super.initState();
    _medicationFuture = _medicationService.getMedicationSchedules();
  }

  Future<void> _refresh() async {
    setState(() {
      _medicationFuture = _medicationService.getMedicationSchedules();
    });

    await _medicationFuture;
  }

  bool _isTaken(MedicationSchedule schedule) {
    return schedule.todayStatus == 'TAKEN' ||
        _takenScheduleIds.contains(schedule.id);
  }

  _MedicationUiStatus _getUiStatus(MedicationSchedule schedule) {
    if (_isTaken(schedule)) {
      return _MedicationUiStatus.taken;
    }

    if (schedule.todayStatus == 'SKIPPED') {
      return _MedicationUiStatus.skipped;
    }

    if (schedule.todayStatus == 'MISSED') {
      return _MedicationUiStatus.missed;
    }

    // 기기/에뮬레이터의 로컬 시간대와 상관없이
    // 한국 시간의 시/분만 비교한다.
    // DateTime.now().toUtc().add(9시간)는 UTC 플래그를 유지하므로
    // 로컬 DateTime과 직접 비교하면 한국 기기에서 9시간 차이가 날 수 있다.
    final koreaNow = DateTime.now().toUtc().add(const Duration(hours: 9));
    final parts = schedule.reminderTime.split(':');

    if (parts.length < 2) {
      return _MedicationUiStatus.upcoming;
    }

    final hour = int.tryParse(parts[0]) ?? 0;
    final minute = int.tryParse(parts[1]) ?? 0;

    final currentSeconds =
        koreaNow.hour * 3600 + koreaNow.minute * 60 + koreaNow.second;
    final scheduledSeconds = hour * 3600 + minute * 60;

    return currentSeconds > scheduledSeconds
        ? _MedicationUiStatus.missed
        : _MedicationUiStatus.upcoming;
  }

  Future<void> _markAsTaken(
    MedicationSchedule schedule, {
    DateTime? takenAt,
  }) async {
    if (_submittingScheduleIds.contains(schedule.id)) {
      return;
    }

    setState(() {
      _submittingScheduleIds.add(schedule.id);
    });

    try {
      final koreaNow = DateTime.now().toUtc().add(const Duration(hours: 9));

      final timeParts = schedule.reminderTime.split(':');
      final hour = int.parse(timeParts[0]);
      final minute = int.parse(timeParts[1]);

      final scheduledAt = DateTime.utc(
        koreaNow.year,
        koreaNow.month,
        koreaNow.day,
        hour,
        minute,
      ).subtract(const Duration(hours: 9));

      await _medicationService.markAsTaken(
        medicationScheduleId: schedule.id,
        scheduledAt: scheduledAt,
        takenAt: takenAt,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _takenScheduleIds.add(schedule.id);
        _medicationFuture = _medicationService.getMedicationSchedules();
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            takenAt == null ? '복용 완료로 기록되었습니다.' : '실제 복용 시간으로 수정되었습니다.',
          ),
        ),
      );
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('복용 기록 저장에 실패했습니다.\n$e')));
    } finally {
      if (mounted) {
        setState(() {
          _submittingScheduleIds.remove(schedule.id);
        });
      }
    }
  }

  Future<void> _handleMedicationAction(MedicationSchedule schedule) async {
    final status = _getUiStatus(schedule);

    if (status == _MedicationUiStatus.missed) {
      final takenAt = await showMedicationTakenEditSheet(context);

      if (!mounted || takenAt == null) {
        return;
      }

      await _markAsTaken(schedule, takenAt: takenAt);

      return;
    }

    await _markAsTaken(schedule);
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: SafeArea(
        child: Column(
          children: [
            _buildTopHeader(),
            Expanded(
              child: Container(
                width: double.infinity,
                decoration: const BoxDecoration(
                  color: Color(0xFFF3F8FC),
                  borderRadius: BorderRadius.only(
                    topLeft: Radius.circular(24),
                    topRight: Radius.circular(24),
                  ),
                ),
                clipBehavior: Clip.antiAlias,
                child: TabBarView(
                  children: [
                    RefreshIndicator(
                      color: const Color(0xFF2F80ED),
                      onRefresh: _refresh,
                      child: FutureBuilder<List<MedicationSchedule>>(
                        future: _medicationFuture,
                        builder: (context, snapshot) {
                          if (snapshot.connectionState ==
                              ConnectionState.waiting) {
                            return const Center(
                              child: CircularProgressIndicator(
                                color: Color(0xFF2F80ED),
                              ),
                            );
                          }

                          if (snapshot.hasError) {
                            return _MedicationErrorView(error: snapshot.error);
                          }

                          final schedules = snapshot.data ?? [];

                          if (schedules.isEmpty) {
                            return const _EmptyMedicationView();
                          }

                          final takenCount = schedules
                              .where(
                                (schedule) =>
                                    _getUiStatus(schedule) ==
                                    _MedicationUiStatus.taken,
                              )
                              .length;

                          return ListView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
                            children: [
                              _TodayMedicationSummaryCard(
                                takenCount: takenCount,
                                totalCount: schedules.length,
                              ),
                              const SizedBox(height: 22),
                              Row(
                                children: [
                                  const Expanded(
                                    child: Text(
                                      '복약 일정',
                                      style: TextStyle(
                                        color: Color(0xFF172033),
                                        fontSize: 18,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                  Text(
                                    '총 ${schedules.length}건',
                                    style: const TextStyle(
                                      color: Color(0xFF97A3B4),
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              ...schedules.map(
                                (schedule) => _MedicationScheduleCard(
                                  key: ValueKey(schedule.id),
                                  schedule: schedule,
                                  status: _getUiStatus(schedule),
                                  isSubmitting: _submittingScheduleIds.contains(
                                    schedule.id,
                                  ),
                                  onTaken: () =>
                                      _handleMedicationAction(schedule),
                                ),
                              ),
                            ],
                          );
                        },
                      ),
                    ),
                    const MedicationHistoryTab(),
                  ],
                ),
              ),
            ),
          ],
        ),
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
                  '복약 관리',
                  style: TextStyle(
                    color: Color(0xFF172033),
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                SizedBox(height: 6),
                Text(
                  '오늘 복용할 약과 복약 기록을 확인해보세요.',
                  style: TextStyle(
                    color: Color(0xFF8A96A8),
                    fontSize: 13,
                    height: 1.4,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          const TabBar(
            indicatorColor: Color(0xFF2F80ED),
            indicatorWeight: 2.5,
            indicatorSize: TabBarIndicatorSize.label,
            dividerColor: Colors.transparent,
            labelColor: Color(0xFF2F80ED),
            unselectedLabelColor: Color(0xFF98A3B3),
            labelStyle: TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
            unselectedLabelStyle: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
            tabs: [
              Tab(text: '오늘의 복약'),
              Tab(text: '복약 기록'),
            ],
          ),
        ],
      ),
    );
  }
}

class _TodayMedicationSummaryCard extends StatelessWidget {
  final int takenCount;
  final int totalCount;

  const _TodayMedicationSummaryCard({
    required this.takenCount,
    required this.totalCount,
  });

  @override
  Widget build(BuildContext context) {
    final koreaNow = DateTime.now().toUtc().add(const Duration(hours: 9));
    final weekdays = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
    final dateText =
        '${koreaNow.year}년 ${koreaNow.month}월 ${koreaNow.day}일 ${weekdays[koreaNow.weekday - 1]}';
    final progress = totalCount == 0 ? 0.0 : takenCount / totalCount;
    final percent = (progress * 100).round();

    return Container(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 17),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFE7F5FF), Color(0xFFF2FAFF)],
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFD8EEFC)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x100D5EA6),
            blurRadius: 18,
            offset: Offset(0, 8),
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
                  color: Colors.white.withValues(alpha: 0.88),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.calendar_today_rounded,
                      size: 14,
                      color: Color(0xFF2F80ED),
                    ),
                    SizedBox(width: 6),
                    Text(
                      '오늘의 복약',
                      style: TextStyle(
                        color: Color(0xFF2F80ED),
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
              const Spacer(),
              Container(
                width: 58,
                height: 58,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.72),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.medication_rounded,
                  color: Color(0xFF32B8D8),
                  size: 31,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            dateText,
            style: const TextStyle(
              color: Color(0xFF172033),
              fontSize: 20,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 18),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              const Text(
                '오늘 복약',
                style: TextStyle(
                  color: Color(0xFF526174),
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(width: 9),
              Text(
                '$takenCount / $totalCount',
                style: const TextStyle(
                  color: Color(0xFF1E73EA),
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const Spacer(),
              Text(
                '$percent% 완료',
                style: const TextStyle(
                  color: Color(0xFF1E73EA),
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 9,
              backgroundColor: const Color(0xFFCFE2F3),
              valueColor: const AlwaysStoppedAnimation(Color(0xFF2F80ED)),
            ),
          ),
        ],
      ),
    );
  }
}

class _MedicationScheduleCard extends StatefulWidget {
  final MedicationSchedule schedule;
  final _MedicationUiStatus status;
  final bool isSubmitting;
  final VoidCallback onTaken;

  const _MedicationScheduleCard({
    super.key,
    required this.schedule,
    required this.status,
    required this.isSubmitting,
    required this.onTaken,
  });

  @override
  State<_MedicationScheduleCard> createState() =>
      _MedicationScheduleCardState();
}

class _MedicationScheduleCardState extends State<_MedicationScheduleCard> {
  bool _isExpanded = false;

  MedicationSchedule get schedule => widget.schedule;

  String get _medicineTitle {
    if (schedule.items.isEmpty) {
      return '처방약';
    }

    final firstDrugName = schedule.items.first.drugName;
    final remainingCount = schedule.items.length - 1;

    return remainingCount == 0
        ? firstDrugName
        : '$firstDrugName 외 $remainingCount개';
  }

  String get _quickDescription {
    if (schedule.items.isEmpty) {
      return '등록된 약 상세정보가 없습니다.';
    }

    final item = schedule.items.first;
    final parts = <String>[];

    if (item.dose != null && item.dose!.trim().isNotEmpty) {
      parts.add('${_formatDose(item.dose!)} ${item.unit}');
    }

    if (item.instructions != null && item.instructions!.trim().isNotEmpty) {
      parts.add(item.instructions!);
    } else if (item.frequency != null && item.frequency!.trim().isNotEmpty) {
      parts.add(item.frequency!);
    }

    return parts.isEmpty ? item.ingredientName : parts.join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    final style = _MedicationStatusStyle.from(widget.status);
    final displayTime = _formatTime(schedule.reminderTime);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: style.borderColor),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0C1B4B72),
            blurRadius: 14,
            offset: Offset(0, 6),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () {
                setState(() {
                  _isExpanded = !_isExpanded;
                });
              },
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 14, 12, 14),
                child: Row(
                  children: [
                    Container(
                      width: 62,
                      height: 66,
                      decoration: BoxDecoration(
                        color: style.timeBackground,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(style.icon, size: 18, color: style.accentColor),
                          const SizedBox(height: 4),
                          Text(
                            _formatTimeShort(schedule.reminderTime),
                            style: TextStyle(
                              color: style.accentColor,
                              fontSize: 15,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _medicineTitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Color(0xFF172033),
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 5),
                          Text(
                            _quickDescription,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Color(0xFF7A8798),
                              fontSize: 12.5,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(height: 7),
                          Row(
                            children: [
                              _MedicationStatusBadge(style: style),
                              const SizedBox(width: 6),
                              Flexible(
                                child: Text(
                                  displayTime,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Color(0xFF9AA5B4),
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    AnimatedRotation(
                      turns: _isExpanded ? 0.5 : 0,
                      duration: const Duration(milliseconds: 200),
                      child: const Icon(
                        Icons.keyboard_arrow_down_rounded,
                        color: Color(0xFF8090A4),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeInOut,
            child: _isExpanded
                ? Column(
                    children: [
                      _MedicationDetails(items: schedule.items),
                      Container(
                        color: const Color(0xFFF8FBFE),
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                        child: Column(
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: _SmallInfoChip(
                                    icon: schedule.enabled
                                        ? Icons.notifications_active_outlined
                                        : Icons.notifications_off_outlined,
                                    text: schedule.enabled ? '알림 ON' : '알림 OFF',
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: _SmallInfoChip(
                                    icon: Icons.schedule_rounded,
                                    text: displayTime,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            SizedBox(
                              width: double.infinity,
                              height: 46,
                              child: FilledButton.icon(
                                onPressed:
                                    widget.status ==
                                            _MedicationUiStatus.taken ||
                                        widget.status ==
                                            _MedicationUiStatus.skipped ||
                                        widget.isSubmitting
                                    ? null
                                    : widget.onTaken,
                                style: FilledButton.styleFrom(
                                  backgroundColor: const Color(0xFF2F80ED),
                                  disabledBackgroundColor: const Color(
                                    0xFFE7F6EE,
                                  ),
                                  disabledForegroundColor: const Color(
                                    0xFF24935B,
                                  ),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(13),
                                  ),
                                ),
                                icon: widget.isSubmitting
                                    ? const SizedBox(
                                        width: 18,
                                        height: 18,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Colors.white,
                                        ),
                                      )
                                    : Icon(
                                        widget.status ==
                                                _MedicationUiStatus.taken
                                            ? Icons.check_circle_rounded
                                            : widget.status ==
                                                  _MedicationUiStatus.missed
                                            ? Icons.edit_rounded
                                            : Icons.check_rounded,
                                      ),
                                label: Text(
                                  widget.isSubmitting
                                      ? '처리 중...'
                                      : widget.status ==
                                            _MedicationUiStatus.taken
                                      ? '복용 완료'
                                      : widget.status ==
                                            _MedicationUiStatus.missed
                                      ? '복용 완료로 수정'
                                      : widget.status ==
                                            _MedicationUiStatus.skipped
                                      ? '복용 생략'
                                      : '복용 완료하기',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                            ),
                            if (widget.status ==
                                _MedicationUiStatus.missed) ...[
                              const SizedBox(height: 9),
                              const Text(
                                '실제로 복용했지만 기록하지 못했다면 완료 상태로 수정할 수 있어요.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: Color(0xFF8A96A8),
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  )
                : const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }

  String _formatTime(String time) {
    final parts = time.split(':');
    if (parts.length < 2) return time;

    final hour = int.tryParse(parts[0]) ?? 0;
    final minute = parts[1];
    final period = hour < 12 ? '오전' : '오후';
    final displayHour = hour == 0
        ? 12
        : hour > 12
        ? hour - 12
        : hour;

    return '$period $displayHour:$minute';
  }

  String _formatTimeShort(String time) {
    final parts = time.split(':');
    if (parts.length < 2) return time;
    return '${parts[0].padLeft(2, '0')}:${parts[1].padLeft(2, '0')}';
  }

  String _formatDose(String dose) {
    final value = double.tryParse(dose);
    if (value == null) return dose;
    if (value % 1 == 0) return value.toInt().toString();
    return value.toString();
  }
}

class _MedicationStatusStyle {
  final String label;
  final Color accentColor;
  final Color badgeBackground;
  final Color timeBackground;
  final Color borderColor;
  final IconData icon;

  const _MedicationStatusStyle({
    required this.label,
    required this.accentColor,
    required this.badgeBackground,
    required this.timeBackground,
    required this.borderColor,
    required this.icon,
  });

  factory _MedicationStatusStyle.from(_MedicationUiStatus status) {
    switch (status) {
      case _MedicationUiStatus.taken:
        return const _MedicationStatusStyle(
          label: '복용 완료',
          accentColor: Color(0xFF1B9B6B),
          badgeBackground: Color(0xFFE5F8F1),
          timeBackground: Color(0xFFEAF9F5),
          borderColor: Color(0xFFD8EEE7),
          icon: Icons.check_circle_rounded,
        );
      case _MedicationUiStatus.missed:
        return const _MedicationStatusStyle(
          label: '미복용',
          accentColor: Color(0xFFEF5B64),
          badgeBackground: Color(0xFFFFECEE),
          timeBackground: Color(0xFFFFF1F2),
          borderColor: Color(0xFFFFE0E3),
          icon: Icons.error_rounded,
        );
      case _MedicationUiStatus.skipped:
        return const _MedicationStatusStyle(
          label: '복용 생략',
          accentColor: Color(0xFF7E8A9A),
          badgeBackground: Color(0xFFF0F2F5),
          timeBackground: Color(0xFFF4F6F8),
          borderColor: Color(0xFFE5E9EF),
          icon: Icons.remove_circle_outline_rounded,
        );
      case _MedicationUiStatus.upcoming:
        return const _MedicationStatusStyle(
          label: '복용 예정',
          accentColor: Color(0xFF2F80ED),
          badgeBackground: Color(0xFFEAF4FF),
          timeBackground: Color(0xFFEDF6FF),
          borderColor: Color(0xFFDCEBFA),
          icon: Icons.schedule_rounded,
        );
    }
  }
}

class _MedicationStatusBadge extends StatelessWidget {
  final _MedicationStatusStyle style;

  const _MedicationStatusBadge({required this.style});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: style.badgeBackground,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        style.label,
        style: TextStyle(
          color: style.accentColor,
          fontSize: 11,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _SmallInfoChip extends StatelessWidget {
  final IconData icon;
  final String text;

  const _SmallInfoChip({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE6EDF5)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 15, color: const Color(0xFF60748A)),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              text,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Color(0xFF60748A),
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MedicationDetails extends StatelessWidget {
  final List<MedicationItem> items;

  const _MedicationDetails({required this.items});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
      decoration: const BoxDecoration(
        color: Color(0xFFF8FBFE),
        border: Border(top: BorderSide(color: Color(0xFFE4EDF6))),
      ),
      child: items.isEmpty
          ? const Text(
              '등록된 상세 약 정보가 없습니다.',
              style: TextStyle(color: Color(0xFF6B7280), fontSize: 13),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '상세정보',
                  style: TextStyle(
                    color: Color(0xFF191F28),
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 12),

                ...items.asMap().entries.map((entry) {
                  final index = entry.key;
                  final item = entry.value;

                  return Column(
                    children: [
                      if (index > 0) ...[
                        const SizedBox(height: 16),
                        const Divider(height: 1),
                        const SizedBox(height: 16),
                      ],
                      _MedicationItemDetails(item: item),
                    ],
                  );
                }),
              ],
            ),
    );
  }
}

class _MedicationItemDetails extends StatelessWidget {
  final MedicationItem item;

  const _MedicationItemDetails({required this.item});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(
              Icons.medication_outlined,
              size: 20,
              color: Color(0xFF2F80ED),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                item.drugName,
                style: const TextStyle(
                  color: Color(0xFF191F28),
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),

        _DetailRow(label: '성분명', value: item.ingredientName),

        if (item.dose != null)
          _DetailRow(
            label: '1회 복용량',
            value: '${_formatDose(item.dose!)} ${item.unit}',
          ),

        _DetailRow(label: '투여 경로', value: item.route),

        if (item.frequency != null && item.frequency!.trim().isNotEmpty)
          _DetailRow(label: '복용 횟수', value: item.frequency!),

        if (item.instructions != null && item.instructions!.trim().isNotEmpty)
          _DetailRow(label: '복용 방법', value: item.instructions!),
      ],
    );
  }

  String _formatDose(String dose) {
    final value = double.tryParse(dose);

    if (value == null) {
      return dose;
    }

    if (value % 1 == 0) {
      return value.toInt().toString();
    }

    return value.toString();
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;

  const _DetailRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 88,
            child: Text(
              label,
              style: const TextStyle(color: Color(0xFF8B95A1), fontSize: 13),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                color: Color(0xFF333D4B),
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MedicationErrorView extends StatelessWidget {
  final Object? error;

  const _MedicationErrorView({required this.error});

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(20),
      children: [
        const SizedBox(height: 120),
        const Icon(Icons.error_outline, size: 48),
        const SizedBox(height: 16),
        const Center(
          child: Text(
            '복약 정보를 불러오지 못했습니다.',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
        ),
        const SizedBox(height: 8),
        Center(
          child: Text(
            '$error',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 13),
          ),
        ),
      ],
    );
  }
}

class _EmptyMedicationView extends StatelessWidget {
  const _EmptyMedicationView();

  @override
  Widget build(BuildContext context) {
    return ListView(
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
                  Icons.medication_rounded,
                  size: 38,
                  color: Color(0xFF35AEE2),
                ),
              ),
              SizedBox(height: 20),
              Text(
                '오늘 예정된 복약이 없어요.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Color(0xFF172033),
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
              SizedBox(height: 9),
              Text(
                '처방된 복약 일정이 등록되면\n이곳에서 확인할 수 있어요.',
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
        const SizedBox(height: 18),
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: const Color(0xFFEAF6FF),
            borderRadius: BorderRadius.circular(20),
          ),
          child: const Row(
            children: [
              Icon(
                Icons.notifications_active_outlined,
                color: Color(0xFF2F80ED),
              ),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  '복약 알림을 켜두면 예정된 시간에 복용을 놓치지 않도록 도와드려요.',
                  style: TextStyle(
                    color: Color(0xFF526174),
                    fontSize: 12.5,
                    height: 1.45,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
