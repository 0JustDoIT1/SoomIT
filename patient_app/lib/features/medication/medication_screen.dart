import 'package:flutter/material.dart';

import 'models/medication_schedule.dart';
import 'services/medication_service.dart';

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
  
  Future<void> _markAsTaken(
    MedicationSchedule schedule,
  ) async {
    if (_submittingScheduleIds.contains(schedule.id)) {
      return;
    }
  
    setState(() {
      _submittingScheduleIds.add(schedule.id);
    });
  
    try {
      final now = DateTime.now();
  
      final timeParts = schedule.reminderTime.split(':');
      final hour = int.parse(timeParts[0]);
      final minute = int.parse(timeParts[1]);
  
      final scheduledAt = DateTime(
        now.year,
        now.month,
        now.day,
        hour,
        minute,
      );
  
      await _medicationService.markAsTaken(
        medicationScheduleId: schedule.id,
        scheduledAt: scheduledAt,
      );
  
      if (!mounted) return;
  
      setState(() {
        _takenScheduleIds.add(schedule.id);
      });
  
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('복용 완료로 기록되었습니다.'),
        ),
      );
    } catch (e) {
      if (!mounted) return;
  
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('복용 기록 저장에 실패했습니다.\n$e'),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _submittingScheduleIds.remove(schedule.id);
        });
      }
    }
  }

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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F8FA),
      appBar: AppBar(
        title: const Text(
          '복약 관리',
          style: TextStyle(
            fontWeight: FontWeight.w700,
          ),
        ),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: FutureBuilder<List<MedicationSchedule>>(
            future: _medicationFuture,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(
                  child: CircularProgressIndicator(),
                );
              }

              if (snapshot.hasError) {
                return ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(20),
                  children: [
                    const SizedBox(height: 120),
                    const Icon(
                      Icons.error_outline,
                      size: 48,
                    ),
                    const SizedBox(height: 16),
                    const Center(
                      child: Text(
                        '복약 정보를 불러오지 못했습니다.',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Center(
                      child: Text(
                        '${snapshot.error}',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                );
              }

              final schedules = snapshot.data ?? [];

              if (schedules.isEmpty) {
                return ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(20),
                  children: const [
                    SizedBox(height: 120),
                    Icon(
                      Icons.medication_outlined,
                      size: 52,
                    ),
                    SizedBox(height: 16),
                    Center(
                      child: Text(
                        '등록된 복약 일정이 없습니다.',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                );
              }

              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 16,
                ),
                children: [
                  const Text(
                    '처방받은 약과 복약 시간을 확인하세요.',
                    style: TextStyle(
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 24),

                  ...schedules.map(
                    (schedule) => _MedicationScheduleCard(
                      schedule: schedule,
                      isTaken:
                          schedule.todayStatus == 'TAKEN' ||
                          _takenScheduleIds.contains(schedule.id),
                      isSubmitting:
                          _submittingScheduleIds.contains(schedule.id),
                      onTaken: () => _markAsTaken(schedule),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}
  
class _MedicationScheduleCard extends StatelessWidget {
  final MedicationSchedule schedule;
  final bool isTaken;
  final bool isSubmitting;
  final VoidCallback onTaken;

  const _MedicationScheduleCard({
    required this.schedule,
    required this.isTaken,
    required this.isSubmitting,
    required this.onTaken,
  });

  @override
  Widget build(BuildContext context) {
    final displayTime = _formatTime(schedule.reminderTime);

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: Theme.of(context)
              .colorScheme
              .outlineVariant,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: Theme.of(context)
                        .colorScheme
                        .primaryContainer,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    Icons.access_time,
                    color: Theme.of(context)
                        .colorScheme
                        .primary,
                  ),
                ),
                const SizedBox(width: 12),

                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        '복약 시간',
                        style: TextStyle(
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        displayTime,
                        style: const TextStyle(
                          fontSize: 21,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),

                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: schedule.enabled
                        ? Theme.of(context)
                            .colorScheme
                            .primaryContainer
                        : Theme.of(context)
                            .colorScheme
                            .surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    schedule.enabled ? '알림 ON' : '알림 OFF',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 18),
            const Divider(),
            const SizedBox(height: 8),

            ...schedule.items.map(
              (item) => _MedicationItemView(
                item: item,
              ),
            ),
            const SizedBox(height: 16),

            SizedBox(
              width: double.infinity,
              height: 48,
              child: FilledButton.icon(
                onPressed: isTaken || isSubmitting
                    ? null
                    : onTaken,
                icon: isSubmitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                        ),
                      )
                    : Icon(
                        isTaken
                            ? Icons.check_circle
                            : Icons.check,
                      ),
                label: Text(
                  isSubmitting
                      ? '처리 중...'
                      : isTaken
                          ? '복용 완료'
                          : '복용 완료하기',
                ),
              ),
            ),
          ],
        ),
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

class _MedicationItemView extends StatelessWidget {
  final MedicationItem item;

  const _MedicationItemView({
    required this.item,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        vertical: 8,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.medication_outlined,
            size: 22,
          ),
          const SizedBox(width: 12),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.drugName,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),

                Text(
                  item.ingredientName,
                  style: const TextStyle(
                    fontSize: 13,
                  ),
                ),

                if (item.dose != null)
                  Padding(
                    padding: const EdgeInsets.only(
                      top: 6,
                    ),
                    child: Text(
                      '${_formatDose(item.dose!)} ${item.unit}',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),

                if (item.frequency != null)
                  Padding(
                    padding: const EdgeInsets.only(
                      top: 4,
                    ),
                    child: Text(
                      item.frequency!,
                      style: const TextStyle(
                        fontSize: 13,
                      ),
                    ),
                  ),

                if (item.instructions != null)
                  Padding(
                    padding: const EdgeInsets.only(
                      top: 4,
                    ),
                    child: Text(
                      item.instructions!,
                      style: const TextStyle(
                        fontSize: 13,
                      ),
                    ),
                  ),
              ],
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