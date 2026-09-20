import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../models/medication_intake_log.dart';
import '../services/medication_service.dart';
import 'medication_taken_edit_sheet.dart';

class MedicationHistoryTab extends StatefulWidget {
  const MedicationHistoryTab({super.key});

  @override
  State<MedicationHistoryTab> createState() =>
      _MedicationHistoryTabState();
}

class _MedicationHistoryTabState extends State<MedicationHistoryTab> {
  final MedicationService _medicationService = MedicationService();

  late DateTime _selectedDate;
  late DateTime _visibleMonth;
  late Future<List<MedicationIntakeLog>> _historyFuture;
  late Future<List<MedicationIntakeLog>> _calendarLogsFuture;

  final Set<String> _updatingLogIds = <String>{};

  @override
  void initState() {
    super.initState();

    final today = _todayKoreaDate;

    _selectedDate = today;
    _visibleMonth = DateTime(today.year, today.month, 1);

    _historyFuture = _loadHistory();
    _calendarLogsFuture = _loadCalendarLogs();
  }

  DateTime get _todayKoreaDate {
    final koreaNow = DateTime.now().toUtc().add(
      const Duration(hours: 9),
    );

    return DateTime(
      koreaNow.year,
      koreaNow.month,
      koreaNow.day,
    );
  }

  Future<List<MedicationIntakeLog>> _loadHistory() {
    return _medicationService.getMedicationIntakeLogs(
      date: _selectedDate,
    );
  }

  Future<List<MedicationIntakeLog>> _loadCalendarLogs() {
    return _medicationService.getMedicationIntakeLogs();
  }

  Future<void> _refresh() async {
    late Future<List<MedicationIntakeLog>> historyFuture;
    late Future<List<MedicationIntakeLog>> calendarFuture;

    setState(() {
      historyFuture = _loadHistory();
      calendarFuture = _loadCalendarLogs();

      _historyFuture = historyFuture;
      _calendarLogsFuture = calendarFuture;
    });

    await Future.wait([
      historyFuture,
      calendarFuture,
    ]);
  }

  void _selectDate(DateTime date) {
    final normalizedDate = DateTime(
      date.year,
      date.month,
      date.day,
    );

    if (_isAfterDate(normalizedDate, _todayKoreaDate)) {
      return;
    }

    setState(() {
      _selectedDate = normalizedDate;
      _visibleMonth = DateTime(
        normalizedDate.year,
        normalizedDate.month,
        1,
      );
      _historyFuture = _loadHistory();
    });
  }

  void _changeMonth(int offset) {
    final today = _todayKoreaDate;
    final minMonth = DateTime(today.year - 2, 1, 1);
    final maxMonth = DateTime(today.year, today.month, 1);

    final nextMonth = DateTime(
      _visibleMonth.year,
      _visibleMonth.month + offset,
      1,
    );

    if (nextMonth.isBefore(minMonth) || nextMonth.isAfter(maxMonth)) {
      return;
    }

    final daysInNextMonth = DateTime(
      nextMonth.year,
      nextMonth.month + 1,
      0,
    ).day;

    final nextDay = math.min(
      _selectedDate.day,
      daysInNextMonth,
    );

    var nextSelectedDate = DateTime(
      nextMonth.year,
      nextMonth.month,
      nextDay,
    );

    if (_isAfterDate(nextSelectedDate, today)) {
      nextSelectedDate = today;
    }

    setState(() {
      _visibleMonth = nextMonth;
      _selectedDate = nextSelectedDate;
      _historyFuture = _loadHistory();
    });
  }

  bool get _canGoPreviousMonth {
    final today = _todayKoreaDate;
    final minMonth = DateTime(today.year - 2, 1, 1);

    return _visibleMonth.isAfter(minMonth);
  }

  bool get _canGoNextMonth {
    final today = _todayKoreaDate;
    final currentMonth = DateTime(
      today.year,
      today.month,
      1,
    );

    return _visibleMonth.isBefore(currentMonth);
  }

  bool _isAfterDate(DateTime a, DateTime b) {
    return DateTime(a.year, a.month, a.day).isAfter(
      DateTime(b.year, b.month, b.day),
    );
  }

  Future<void> _correctMissedLog(
    MedicationIntakeLog log,
  ) async {
    if (_updatingLogIds.contains(log.id)) {
      return;
    }

    final selectedTakenAt = await showMedicationTakenEditSheet(
      context,
      initialTakenAt: log.takenAt ?? log.scheduledAt,
    );

    if (!mounted || selectedTakenAt == null) {
      return;
    }

    setState(() {
      _updatingLogIds.add(log.id);
    });

    try {
      await _medicationService.markAsTaken(
        medicationScheduleId: log.medicationScheduleId,
        scheduledAt: log.scheduledAt,
        takenAt: selectedTakenAt,
      );

      if (!mounted) {
        return;
      }

      late Future<List<MedicationIntakeLog>> historyFuture;
      late Future<List<MedicationIntakeLog>> calendarFuture;

      setState(() {
        historyFuture = _loadHistory();
        calendarFuture = _loadCalendarLogs();

        _historyFuture = historyFuture;
        _calendarLogsFuture = calendarFuture;
      });

      await Future.wait([
        historyFuture,
        calendarFuture,
      ]);

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            '복용 완료로 수정되었습니다.',
          ),
        ),
      );
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '복약 기록 수정에 실패했습니다.\n$e',
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _updatingLogIds.remove(log.id);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: const Color(0xFF2F80ED),
      onRefresh: _refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(
          16,
          18,
          16,
          28,
        ),
        children: [
          FutureBuilder<List<MedicationIntakeLog>>(
            future: _calendarLogsFuture,
            builder: (context, snapshot) {
              return _MonthlyMedicationCalendar(
                selectedDate: _selectedDate,
                visibleMonth: _visibleMonth,
                today: _todayKoreaDate,
                logs: snapshot.data ?? const <MedicationIntakeLog>[],
                isLoading:
                    snapshot.connectionState == ConnectionState.waiting,
                canGoPreviousMonth: _canGoPreviousMonth,
                canGoNextMonth: _canGoNextMonth,
                onDateSelected: _selectDate,
                onPreviousMonth: () => _changeMonth(-1),
                onNextMonth: () => _changeMonth(1),
              );
            },
          ),

          const SizedBox(height: 22),

          FutureBuilder<List<MedicationIntakeLog>>(
            future: _historyFuture,
            builder: (context, snapshot) {
              final logs = snapshot.data ?? const <MedicationIntakeLog>[];

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          _formatSelectedDate(
                            _selectedDate,
                          ),
                          style: const TextStyle(
                            color: Color(0xFF172033),
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      if (snapshot.hasData)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEAF4FF),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            '${logs.length}건',
                            style: const TextStyle(
                              color: Color(0xFF2F80ED),
                              fontSize: 12.5,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                    ],
                  ),

                  const SizedBox(height: 12),

                  if (snapshot.connectionState ==
                      ConnectionState.waiting)
                    const Padding(
                      padding: EdgeInsets.symmetric(
                        vertical: 48,
                      ),
                      child: Center(
                        child: CircularProgressIndicator(
                          color: Color(0xFF2F80ED),
                        ),
                      ),
                    )
                  else if (snapshot.hasError)
                    _HistoryErrorView(
                      error: snapshot.error,
                      onRetry: _refresh,
                    )
                  else if (logs.isEmpty)
                    const _EmptyHistoryView()
                  else
                    ...logs.map(
                      (log) => _MedicationHistoryCard(
                        key: ValueKey(log.id),
                        log: log,
                        isUpdating: _updatingLogIds.contains(log.id),
                        onCorrect: () => _correctMissedLog(log),
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  String _formatSelectedDate(DateTime date) {
    const weekdays = [
      '월요일',
      '화요일',
      '수요일',
      '목요일',
      '금요일',
      '토요일',
      '일요일',
    ];

    return '${date.month}월 ${date.day}일 '
        '${weekdays[date.weekday - 1]}';
  }
}

class _MonthlyMedicationCalendar extends StatelessWidget {
  final DateTime selectedDate;
  final DateTime visibleMonth;
  final DateTime today;
  final List<MedicationIntakeLog> logs;
  final bool isLoading;
  final bool canGoPreviousMonth;
  final bool canGoNextMonth;
  final ValueChanged<DateTime> onDateSelected;
  final VoidCallback onPreviousMonth;
  final VoidCallback onNextMonth;

  const _MonthlyMedicationCalendar({
    required this.selectedDate,
    required this.visibleMonth,
    required this.today,
    required this.logs,
    required this.isLoading,
    required this.canGoPreviousMonth,
    required this.canGoNextMonth,
    required this.onDateSelected,
    required this.onPreviousMonth,
    required this.onNextMonth,
  });

  @override
  Widget build(BuildContext context) {
    final firstDay = DateTime(
      visibleMonth.year,
      visibleMonth.month,
      1,
    );

    final daysInMonth = DateTime(
      visibleMonth.year,
      visibleMonth.month + 1,
      0,
    ).day;

    final leadingEmptyCount = firstDay.weekday % 7;
    final rawCellCount = leadingEmptyCount + daysInMonth;
    final rowCount = (rawCellCount / 7).ceil();
    final cellCount = rowCount * 7;

    return Container(
      padding: const EdgeInsets.fromLTRB(
        14,
        16,
        14,
        14,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: const Color(0xFFDCEBFA),
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0C1B4B72),
            blurRadius: 16,
            offset: Offset(0, 7),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            children: [
              _MonthArrowButton(
                icon: Icons.chevron_left_rounded,
                enabled: canGoPreviousMonth,
                onTap: onPreviousMonth,
              ),
              Expanded(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      '${visibleMonth.year}년 ${visibleMonth.month}월',
                      style: const TextStyle(
                        color: Color(0xFF172033),
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (isLoading) ...[
                      const SizedBox(width: 9),
                      const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Color(0xFF2F80ED),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              _MonthArrowButton(
                icon: Icons.chevron_right_rounded,
                enabled: canGoNextMonth,
                onTap: onNextMonth,
              ),
            ],
          ),

          const SizedBox(height: 18),

          const _WeekdayHeader(),

          const SizedBox(height: 8),

          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: cellCount,
            gridDelegate:
                const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 7,
              childAspectRatio: 0.88,
              crossAxisSpacing: 2,
              mainAxisSpacing: 3,
            ),
            itemBuilder: (context, index) {
              final dayNumber =
                  index - leadingEmptyCount + 1;

              if (dayNumber < 1 ||
                  dayNumber > daysInMonth) {
                return const SizedBox.shrink();
              }

              final date = DateTime(
                visibleMonth.year,
                visibleMonth.month,
                dayNumber,
              );

              final isFuture = _isAfterDate(
                date,
                today,
              );

              final isSelected = _isSameDate(
                date,
                selectedDate,
              );

              final isToday = _isSameDate(
                date,
                today,
              );

              final statuses = _statusesForDate(date);

              return _CalendarDayCell(
                date: date,
                isSelected: isSelected,
                isToday: isToday,
                isDisabled: isFuture,
                statuses: statuses,
                onTap: isFuture
                    ? null
                    : () => onDateSelected(date),
              );
            },
          ),

          const SizedBox(height: 14),

          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(
              horizontal: 12,
              vertical: 11,
            ),
            decoration: BoxDecoration(
              color: const Color(0xFFF6FAFE),
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Wrap(
              alignment: WrapAlignment.center,
              spacing: 16,
              runSpacing: 8,
              children: [
                _CalendarLegendItem(
                  color: Color(0xFF2F80ED),
                  label: '복용완료',
                ),
                _CalendarLegendItem(
                  color: Color(0xFFEF5B64),
                  label: '미복용',
                ),
                _CalendarLegendItem(
                  color: Color(0xFFE6A23C),
                  label: '건너뜀',
                ),
                _CalendarLegendItem(
                  color: Color(0xFF9AA5B4),
                  label: '대기',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  List<String> _statusesForDate(DateTime date) {
    final statuses = <String>{};

    for (final log in logs) {
      final koreaDate = log.scheduledAt
          .toUtc()
          .add(const Duration(hours: 9));

      final logDate = DateTime(
        koreaDate.year,
        koreaDate.month,
        koreaDate.day,
      );

      if (_isSameDate(logDate, date)) {
        statuses.add(log.status);
      }
    }

    const order = [
      'TAKEN',
      'MISSED',
      'SKIPPED',
      'PENDING',
    ];

    return order
        .where(statuses.contains)
        .take(3)
        .toList();
  }

  bool _isSameDate(DateTime a, DateTime b) {
    return a.year == b.year &&
        a.month == b.month &&
        a.day == b.day;
  }

  bool _isAfterDate(DateTime a, DateTime b) {
    return DateTime(a.year, a.month, a.day).isAfter(
      DateTime(b.year, b.month, b.day),
    );
  }
}

class _WeekdayHeader extends StatelessWidget {
  const _WeekdayHeader();

  @override
  Widget build(BuildContext context) {
    const weekdays = [
      '일',
      '월',
      '화',
      '수',
      '목',
      '금',
      '토',
    ];

    return Row(
      children: List.generate(
        weekdays.length,
        (index) {
          final textColor = index == 0
              ? const Color(0xFFE2555D)
              : index == 6
                  ? const Color(0xFF477ED8)
                  : const Color(0xFF8A96A8);

          return Expanded(
            child: Center(
              child: Text(
                weekdays[index],
                style: TextStyle(
                  color: textColor,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _CalendarDayCell extends StatelessWidget {
  final DateTime date;
  final bool isSelected;
  final bool isToday;
  final bool isDisabled;
  final List<String> statuses;
  final VoidCallback? onTap;

  const _CalendarDayCell({
    required this.date,
    required this.isSelected,
    required this.isToday,
    required this.isDisabled,
    required this.statuses,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final numberColor = _numberColor();

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            vertical: 2,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              AnimatedContainer(
                duration: const Duration(
                  milliseconds: 180,
                ),
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: isSelected
                      ? const Color(0xFF2F80ED)
                      : Colors.transparent,
                  shape: BoxShape.circle,
                  border: isToday && !isSelected
                      ? Border.all(
                          color: const Color(0xFF2F80ED),
                          width: 1.5,
                        )
                      : null,
                  boxShadow: isSelected
                      ? const [
                          BoxShadow(
                            color: Color(0x332F80ED),
                            blurRadius: 8,
                            offset: Offset(0, 3),
                          ),
                        ]
                      : null,
                ),
                child: Text(
                  '${date.day}',
                  style: TextStyle(
                    color: numberColor,
                    fontSize: 13.5,
                    fontWeight: isSelected || isToday
                        ? FontWeight.w800
                        : FontWeight.w600,
                  ),
                ),
              ),

              const SizedBox(height: 3),

              SizedBox(
                height: 6,
                child: statuses.isEmpty
                    ? const SizedBox.shrink()
                    : Row(
                        mainAxisSize: MainAxisSize.min,
                        children: statuses
                            .map(
                              (status) => Container(
                                width: 5,
                                height: 5,
                                margin:
                                    const EdgeInsets.symmetric(
                                  horizontal: 1.5,
                                ),
                                decoration: BoxDecoration(
                                  color: isSelected
                                      ? Colors.white
                                          .withValues(alpha: 0.95)
                                      : _statusColor(status),
                                  shape: BoxShape.circle,
                                ),
                              ),
                            )
                            .toList(),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _numberColor() {
    if (isSelected) {
      return Colors.white;
    }

    if (isDisabled) {
      return const Color(0xFFC5CDD8);
    }

    if (date.weekday == DateTime.sunday) {
      return const Color(0xFFE2555D);
    }

    if (date.weekday == DateTime.saturday) {
      return const Color(0xFF477ED8);
    }

    return const Color(0xFF263244);
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'TAKEN':
        return const Color(0xFF2F80ED);
      case 'MISSED':
        return const Color(0xFFEF5B64);
      case 'SKIPPED':
        return const Color(0xFFE6A23C);
      default:
        return const Color(0xFF9AA5B4);
    }
  }
}

class _MonthArrowButton extends StatelessWidget {
  final IconData icon;
  final bool enabled;
  final VoidCallback onTap;

  const _MonthArrowButton({
    required this.icon,
    required this.enabled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: enabled
          ? const Color(0xFFF3F8FC)
          : const Color(0xFFF7F9FB),
      shape: const CircleBorder(),
      child: InkWell(
        onTap: enabled ? onTap : null,
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: 38,
          height: 38,
          child: Icon(
            icon,
            size: 22,
            color: enabled
                ? const Color(0xFF2F80ED)
                : const Color(0xFFC8D0DA),
          ),
        ),
      ),
    );
  }
}

class _CalendarLegendItem extends StatelessWidget {
  final Color color;
  final String label;

  const _CalendarLegendItem({
    required this.color,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: const TextStyle(
            color: Color(0xFF6F7D8F),
            fontSize: 11,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _MedicationHistoryCard extends StatefulWidget {
  final MedicationIntakeLog log;
  final bool isUpdating;
  final VoidCallback onCorrect;

  const _MedicationHistoryCard({
    super.key,
    required this.log,
    required this.isUpdating,
    required this.onCorrect,
  });

  @override
  State<_MedicationHistoryCard> createState() =>
      _MedicationHistoryCardState();
}

class _MedicationHistoryCardState
    extends State<_MedicationHistoryCard> {
  bool _isExpanded = false;

  @override
  Widget build(BuildContext context) {
    final log = widget.log;
    final statusStyle = _statusStyle(log.status);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 0,
      color: Colors.white,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: Theme.of(context)
              .colorScheme
              .outlineVariant,
        ),
      ),
      child: Column(
        children: [
          InkWell(
            onTap: () {
              setState(() {
                _isExpanded = !_isExpanded;
              });
            },
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                crossAxisAlignment:
                    CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: const Color(0xFFEAF4FF),
                      borderRadius:
                          BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.medication_outlined,
                      color: Color(0xFF2F80ED),
                    ),
                  ),

                  const SizedBox(width: 12),

                  Expanded(
                    child: Column(
                      crossAxisAlignment:
                          CrossAxisAlignment.start,
                      children: [
                        Text(
                          log.medicineTitle,
                          style: const TextStyle(
                            color: Color(0xFF191F28),
                            fontSize: 16,
                            fontWeight:
                                FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          '예정 ${_formatTime(log.reminderTime)}',
                          style: const TextStyle(
                            color: Color(0xFF4E5968),
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          _takenTimeText(log),
                          style: const TextStyle(
                            color: Color(0xFF8B95A1),
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(width: 8),

                  Column(
                    crossAxisAlignment:
                        CrossAxisAlignment.end,
                    children: [
                      Container(
                        padding:
                            const EdgeInsets.symmetric(
                          horizontal: 9,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color:
                              statusStyle.backgroundColor,
                          borderRadius:
                              BorderRadius.circular(20),
                        ),
                        child: Text(
                          log.statusLabel,
                          style: TextStyle(
                            color:
                                statusStyle.foregroundColor,
                            fontSize: 12,
                            fontWeight:
                                FontWeight.w700,
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      AnimatedRotation(
                        turns:
                            _isExpanded ? 0.5 : 0,
                        duration: const Duration(
                          milliseconds: 200,
                        ),
                        child: const Icon(
                          Icons.keyboard_arrow_down,
                          color: Color(0xFF8B95A1),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),

          AnimatedSize(
            duration: const Duration(
              milliseconds: 220,
            ),
            curve: Curves.easeInOut,
            child: _isExpanded
                ? Column(
                    children: [
                      _HistoryDetails(log: log),
                      if (log.status == 'MISSED')
                        Container(
                          width: double.infinity,
                          color: const Color(0xFFF8FBFE),
                          padding: const EdgeInsets.fromLTRB(
                            16,
                            0,
                            16,
                            16,
                          ),
                          child: Column(
                            children: [
                              SizedBox(
                                width: double.infinity,
                                height: 46,
                                child: FilledButton.icon(
                                  onPressed: widget.isUpdating
                                      ? null
                                      : widget.onCorrect,
                                  style: FilledButton.styleFrom(
                                    backgroundColor:
                                        const Color(0xFF2F80ED),
                                    shape: RoundedRectangleBorder(
                                      borderRadius:
                                          BorderRadius.circular(13),
                                    ),
                                  ),
                                  icon: widget.isUpdating
                                      ? const SizedBox(
                                          width: 18,
                                          height: 18,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                            color: Colors.white,
                                          ),
                                        )
                                      : const Icon(
                                          Icons.edit_rounded,
                                        ),
                                  label: Text(
                                    widget.isUpdating
                                        ? '수정 중...'
                                        : '복용 완료로 수정',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 8),
                              const Text(
                                '실제로 복용했다면 날짜와 시간을 선택해 기록을 수정할 수 있어요.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: Color(0xFF8A96A8),
                                  fontSize: 11.5,
                                  height: 1.4,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
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

  String _takenTimeText(MedicationIntakeLog log) {
    if (log.takenAt == null) {
      return '실제 복용 시각이 기록되지 않았습니다.';
    }

    final koreaTime = log.takenAt!
        .toUtc()
        .add(const Duration(hours: 9));

    final hour =
        koreaTime.hour.toString().padLeft(2, '0');
    final minute =
        koreaTime.minute.toString().padLeft(2, '0');

    return '실제 복용 $hour:$minute';
  }

  String _formatTime(String time) {
    final parts = time.split(':');

    if (parts.length < 2) {
      return time;
    }

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

  _HistoryStatusStyle _statusStyle(String status) {
    switch (status) {
      case 'TAKEN':
        return const _HistoryStatusStyle(
          foregroundColor: Color(0xFF268451),
          backgroundColor: Color(0xFFE8F5ED),
        );

      case 'MISSED':
        return const _HistoryStatusStyle(
          foregroundColor: Color(0xFFC44B35),
          backgroundColor: Color(0xFFFFE9E5),
        );

      case 'SKIPPED':
        return const _HistoryStatusStyle(
          foregroundColor: Color(0xFF8A5A18),
          backgroundColor: Color(0xFFFFF1D6),
        );

      default:
        return const _HistoryStatusStyle(
          foregroundColor: Color(0xFF4E5968),
          backgroundColor: Color(0xFFF2F4F6),
        );
    }
  }
}

class _HistoryDetails extends StatelessWidget {
  final MedicationIntakeLog log;

  const _HistoryDetails({
    required this.log,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(
        16,
        14,
        16,
        16,
      ),
      decoration: const BoxDecoration(
        color: Color(0xFFF8FBFE),
        border: Border(
          top: BorderSide(
            color: Color(0xFFE4EDF6),
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment:
            CrossAxisAlignment.start,
        children: [
          const Text(
            '약 상세정보',
            style: TextStyle(
              color: Color(0xFF191F28),
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 12),

          ...log.items.map(
            (item) => Padding(
              padding:
                  const EdgeInsets.only(bottom: 12),
              child: Column(
                crossAxisAlignment:
                    CrossAxisAlignment.start,
                children: [
                  Text(
                    item.drugName,
                    style: const TextStyle(
                      color: Color(0xFF333D4B),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    item.ingredientName,
                    style: const TextStyle(
                      color: Color(0xFF6B7280),
                      fontSize: 13,
                    ),
                  ),
                  if (item.dose != null)
                    Text(
                      '${_formatDose(item.dose!)} '
                      '${item.unit}',
                      style: const TextStyle(
                        color: Color(0xFF6B7280),
                        fontSize: 13,
                      ),
                    ),
                  if (item.instructions != null &&
                      item.instructions!
                          .trim()
                          .isNotEmpty)
                    Text(
                      item.instructions!,
                      style: const TextStyle(
                        color: Color(0xFF6B7280),
                        fontSize: 13,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
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

class _HistoryErrorView extends StatelessWidget {
  final Object? error;
  final Future<void> Function() onRetry;

  const _HistoryErrorView({
    required this.error,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          const Icon(
            Icons.error_outline,
            size: 38,
          ),
          const SizedBox(height: 12),
          const Text(
            '복약 기록을 불러오지 못했습니다.',
            style: TextStyle(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '$error',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Color(0xFF6B7280),
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 14),
          OutlinedButton(
            onPressed: onRetry,
            child: const Text('다시 시도'),
          ),
        ],
      ),
    );
  }
}

class _EmptyHistoryView extends StatelessWidget {
  const _EmptyHistoryView();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: 20,
        vertical: 34,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: Theme.of(context)
              .colorScheme
              .outlineVariant,
        ),
      ),
      child: const Column(
        children: [
          Icon(
            Icons.history,
            size: 42,
            color: Color(0xFF8B95A1),
          ),
          SizedBox(height: 12),
          Text(
            '선택한 날짜의 복약 기록이 없습니다.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Color(0xFF4E5968),
              fontWeight: FontWeight.w600,
            ),
          ),
          SizedBox(height: 6),
          Text(
            '기록이 없다고 반드시 미복용을 의미하지는 않습니다.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Color(0xFF8B95A1),
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}

class _HistoryStatusStyle {
  final Color foregroundColor;
  final Color backgroundColor;

  const _HistoryStatusStyle({
    required this.foregroundColor,
    required this.backgroundColor,
  });
}