import 'package:flutter/material.dart';

import 'models/medication_schedule.dart';
import 'services/medication_service.dart';
import 'widgets/medication_history_tab.dart';

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

  Future<void> _markAsTaken(MedicationSchedule schedule) async {
    if (_submittingScheduleIds.contains(schedule.id)) {
      return;
    }

    setState(() {
      _submittingScheduleIds.add(schedule.id);
    });

    try {
      /*
       * 에뮬레이터 시간대가 GMT여도
       * 한국 날짜 기준으로 복약 예정 시각을 생성한다.
       */
      final koreaNow = DateTime.now().toUtc().add(const Duration(hours: 9));

      final timeParts = schedule.reminderTime.split(':');
      final hour = int.parse(timeParts[0]);
      final minute = int.parse(timeParts[1]);

      /*
       * 한국 시각을 UTC로 변환한다.
       * 예: 한국 오전 9시 → UTC 오전 0시
       */
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
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _takenScheduleIds.add(schedule.id);
      });

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('복용 완료로 기록되었습니다.')));
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

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: const Color(0xFFF7F8FA),
        appBar: AppBar(
          title: const Text(
            '복약 관리',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
          backgroundColor: Colors.white,
          surfaceTintColor: Colors.white,
          elevation: 0,
          bottom: const TabBar(
            indicatorColor: Color(0xFF6E4DB2),
            indicatorWeight: 3,
            labelColor: Color(0xFF6E4DB2),
            unselectedLabelColor: Color(0xFF8B95A1),
            labelStyle: TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
            tabs: [
              Tab(text: '오늘의 복약'),
              Tab(text: '복약 기록'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            SafeArea(
              child: RefreshIndicator(
                onRefresh: _refresh,
                child: FutureBuilder<List<MedicationSchedule>>(
                  future: _medicationFuture,
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const Center(child: CircularProgressIndicator());
                    }

                    if (snapshot.hasError) {
                      return _MedicationErrorView(error: snapshot.error);
                    }

                    final schedules = snapshot.data ?? [];

                    if (schedules.isEmpty) {
                      return const _EmptyMedicationView();
                    }

                    final takenCount = schedules.where(_isTaken).length;

                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 20,
                        vertical: 16,
                      ),
                      children: [
                        const Text(
                          '오늘 복용할 약을 확인하고 기록하세요.',
                          style: TextStyle(
                            color: Color(0xFF4E5968),
                            fontSize: 14,
                          ),
                        ),
                        const SizedBox(height: 22),

                        _TodayMedicationHeader(
                          takenCount: takenCount,
                          totalCount: schedules.length,
                        ),

                        const SizedBox(height: 16),

                        ...schedules.map(
                          (schedule) => _MedicationScheduleCard(
                            key: ValueKey(schedule.id),
                            schedule: schedule,
                            isTaken: _isTaken(schedule),
                            isSubmitting: _submittingScheduleIds.contains(
                              schedule.id,
                            ),
                            onTaken: () => _markAsTaken(schedule),
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),
            ),

            const SafeArea(child: MedicationHistoryTab()),
          ],
        ),
      ),
    );
  }
}

class _TodayMedicationHeader extends StatelessWidget {
  final int takenCount;
  final int totalCount;

  const _TodayMedicationHeader({
    required this.takenCount,
    required this.totalCount,
  });

  @override
  Widget build(BuildContext context) {
    final koreaNow = DateTime.now().toUtc().add(const Duration(hours: 9));

    final weekdays = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];

    final dateText =
        '${koreaNow.month}월 ${koreaNow.day}일 '
        '${weekdays[koreaNow.weekday - 1]}';

    return Row(
      children: [
        Expanded(
          child: Text(
            dateText,
            style: const TextStyle(
              color: Color(0xFF191F28),
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
          decoration: BoxDecoration(
            color: const Color(0xFFF0E9FF),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            '$takenCount / $totalCount 복용 완료',
            style: const TextStyle(
              color: Color(0xFF6E4DB2),
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
  }
}

class _MedicationScheduleCard extends StatefulWidget {
  final MedicationSchedule schedule;
  final bool isTaken;
  final bool isSubmitting;
  final VoidCallback onTaken;

  const _MedicationScheduleCard({
    super.key,
    required this.schedule,
    required this.isTaken,
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

    if (remainingCount == 0) {
      return firstDrugName;
    }

    return '$firstDrugName 외 $remainingCount개';
  }

  @override
  Widget build(BuildContext context) {
    final displayTime = _formatTime(schedule.reminderTime);

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 0,
      color: widget.isTaken ? const Color(0xFFF8FBF9) : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(
          color: widget.isTaken
              ? const Color(0xFFCDE8D7)
              : Theme.of(context).colorScheme.outlineVariant,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0E9FF),
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: const Icon(
                    Icons.medication_outlined,
                    color: Color(0xFF6E4DB2),
                  ),
                ),
                const SizedBox(width: 12),

                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _medicineTitle,
                        style: const TextStyle(
                          color: Color(0xFF191F28),
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Row(
                        children: [
                          const Icon(
                            Icons.schedule,
                            size: 17,
                            color: Color(0xFF6B7280),
                          ),
                          const SizedBox(width: 5),
                          Text(
                            displayTime,
                            style: const TextStyle(
                              color: Color(0xFF4E5968),
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),

                const SizedBox(width: 8),

                _AlarmStatusBadge(enabled: schedule.enabled),
              ],
            ),
          ),

          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 46,
                    child: FilledButton.icon(
                      onPressed: widget.isTaken || widget.isSubmitting
                          ? null
                          : widget.onTaken,
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF6E4DB2),
                        disabledBackgroundColor: const Color(0xFFE8F5ED),
                        disabledForegroundColor: const Color(0xFF268451),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      icon: widget.isSubmitting
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Icon(
                              widget.isTaken ? Icons.check_circle : Icons.check,
                            ),
                      label: Text(
                        widget.isSubmitting
                            ? '처리 중...'
                            : widget.isTaken
                            ? '복용 완료'
                            : '복용 완료하기',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),

                SizedBox(
                  width: 46,
                  height: 46,
                  child: OutlinedButton(
                    onPressed: () {
                      setState(() {
                        _isExpanded = !_isExpanded;
                      });
                    },
                    style: OutlinedButton.styleFrom(
                      padding: EdgeInsets.zero,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: AnimatedRotation(
                      turns: _isExpanded ? 0.5 : 0,
                      duration: const Duration(milliseconds: 200),
                      child: const Icon(Icons.keyboard_arrow_down),
                    ),
                  ),
                ),
              ],
            ),
          ),

          AnimatedSize(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeInOut,
            child: _isExpanded
                ? _MedicationDetails(items: schedule.items)
                : const SizedBox.shrink(),
          ),
        ],
      ),
    );
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
}

class _AlarmStatusBadge extends StatelessWidget {
  final bool enabled;

  const _AlarmStatusBadge({required this.enabled});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
      decoration: BoxDecoration(
        color: enabled ? const Color(0xFFF0E9FF) : const Color(0xFFF2F4F6),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            enabled
                ? Icons.notifications_active_outlined
                : Icons.notifications_off_outlined,
            size: 15,
            color: enabled ? const Color(0xFF6E4DB2) : const Color(0xFF8B95A1),
          ),
          const SizedBox(width: 4),
          Text(
            enabled ? 'ON' : 'OFF',
            style: TextStyle(
              color: enabled
                  ? const Color(0xFF6E4DB2)
                  : const Color(0xFF8B95A1),
              fontSize: 12,
              fontWeight: FontWeight.w700,
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
        color: Color(0xFFFAF8FD),
        border: Border(top: BorderSide(color: Color(0xFFE9E3F0))),
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
              color: Color(0xFF6E4DB2),
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
      padding: const EdgeInsets.all(20),
      children: const [
        SizedBox(height: 120),
        Icon(Icons.medication_outlined, size: 52),
        SizedBox(height: 16),
        Center(
          child: Text(
            '등록된 복약 일정이 없습니다.',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }
}
