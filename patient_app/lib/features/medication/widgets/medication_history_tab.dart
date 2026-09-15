import 'package:flutter/material.dart';

import '../models/medication_intake_log.dart';
import '../services/medication_service.dart';

class MedicationHistoryTab extends StatefulWidget {
  const MedicationHistoryTab({super.key});

  @override
  State<MedicationHistoryTab> createState() =>
      _MedicationHistoryTabState();
}

class _MedicationHistoryTabState
    extends State<MedicationHistoryTab> {
  final MedicationService _medicationService =
      MedicationService();

  late DateTime _selectedDate;
  late Future<List<MedicationIntakeLog>> _historyFuture;

  @override
  void initState() {
    super.initState();

    final koreaNow = _toKoreaTime(
      DateTime.now(),
    );

    _selectedDate = DateTime(
      koreaNow.year,
      koreaNow.month,
      koreaNow.day,
    );

    _historyFuture = _loadHistory();
  }

  Future<List<MedicationIntakeLog>>
      _loadHistory() {
    return _medicationService.getMedicationIntakeLogs(
      date: _selectedDate,
    );
  }

  Future<void> _refresh() async {
    setState(() {
      _historyFuture = _loadHistory();
    });

    await _historyFuture;
  }

  void _selectDate(DateTime date) {
    setState(() {
      _selectedDate = DateTime(
        date.year,
        date.month,
        date.day,
      );

      _historyFuture = _loadHistory();
    });
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: FutureBuilder<List<MedicationIntakeLog>>(
        future: _historyFuture,
        builder: (context, snapshot) {
          return ListView(
            physics:
                const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(
              20,
              16,
              20,
              28,
            ),
            children: [
              _HistoryCalendar(
                selectedDate: _selectedDate,
                onDateChanged: _selectDate,
              ),

              const SizedBox(height: 20),

              Row(
                children: [
                  Expanded(
                    child: Text(
                      _formatSelectedDate(
                        _selectedDate,
                      ),
                      style: const TextStyle(
                        color: Color(0xFF191F28),
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),

                  if (snapshot.hasData)
                    Text(
                      '${snapshot.data!.length}건',
                      style: const TextStyle(
                        color: Color(0xFF6E4DB2),
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
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
                    child: CircularProgressIndicator(),
                  ),
                )
              else if (snapshot.hasError)
                _HistoryErrorView(
                  error: snapshot.error,
                  onRetry: _refresh,
                )
              else if ((snapshot.data ?? []).isEmpty)
                const _EmptyHistoryView()
              else
                ...(snapshot.data ?? []).map(
                  (log) => _MedicationHistoryCard(
                    log: log,
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  DateTime _toKoreaTime(DateTime dateTime) {
    return dateTime.toUtc().add(
      const Duration(hours: 9),
    );
  }

  String _formatSelectedDate(DateTime date) {
    final weekdays = [
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

class _HistoryCalendar extends StatelessWidget {
  final DateTime selectedDate;
  final ValueChanged<DateTime> onDateChanged;

  const _HistoryCalendar({
    required this.selectedDate,
    required this.onDateChanged,
  });

  @override
  Widget build(BuildContext context) {
    final koreaNow = DateTime.now().toUtc().add(
      const Duration(hours: 9),
    );

    final today = DateTime(
      koreaNow.year,
      koreaNow.month,
      koreaNow.day,
    );

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: Theme.of(context)
              .colorScheme
              .outlineVariant,
        ),
      ),
      child: CalendarDatePicker(
        initialDate: selectedDate,
        firstDate: DateTime(
          today.year - 2,
          1,
          1,
        ),
        lastDate: today,
        currentDate: today,
        onDateChanged: onDateChanged,
      ),
    );
  }
}

class _MedicationHistoryCard extends StatefulWidget {
  final MedicationIntakeLog log;

  const _MedicationHistoryCard({
    required this.log,
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
                      color: const Color(0xFFF0E9FF),
                      borderRadius:
                          BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.medication_outlined,
                      color: Color(0xFF6E4DB2),
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
            child: _isExpanded
                ? _HistoryDetails(log: log)
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
        color: Color(0xFFFAF8FD),
        border: Border(
          top: BorderSide(
            color: Color(0xFFE9E3F0),
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