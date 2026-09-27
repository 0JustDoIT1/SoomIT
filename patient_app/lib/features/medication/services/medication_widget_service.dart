import 'package:home_widget/home_widget.dart';

import '../models/medication_schedule.dart';

class MedicationWidgetService {
  static const String _androidWidgetName =
      'MedicationWidgetProvider';

  Future<void> updateFromSchedules(
    List<MedicationSchedule> schedules,
  ) async {
    final enabledSchedules = schedules
        .where((schedule) => schedule.enabled)
        .toList()
      ..sort(
        (a, b) => _timeToMinutes(
          a.reminderTime,
        ).compareTo(
          _timeToMinutes(
            b.reminderTime,
          ),
        ),
      );

    // =========================================================
    // 오늘 일정 없음
    // =========================================================

    if (enabledSchedules.isEmpty) {
      await _saveWidgetData(
        hasSchedule: false,
        medicationName: '',
        medicationTime: '',
        medicationStatus: 'empty',
        takenCount: 0,
        totalCount: 0,
        progressText: '',
      );

      return;
    }

    final totalCount = enabledSchedules.length;

    final takenSchedules = enabledSchedules
        .where(
          (schedule) =>
              schedule.todayStatus.toUpperCase() ==
              'TAKEN',
        )
        .toList();

    final takenCount = takenSchedules.length;

    final allTaken =
        totalCount > 0 &&
        takenCount == totalCount;

    // =========================================================
    // 한국 현재 시간
    // =========================================================

    final koreaNow = DateTime.now()
        .toUtc()
        .add(
          const Duration(
            hours: 9,
          ),
        );

    final currentMinutes =
        koreaNow.hour * 60 +
        koreaNow.minute;

    // =========================================================
    // 아직 복용하지 않은 일정
    // =========================================================

    final notTakenSchedules = enabledSchedules
        .where(
          (schedule) =>
              schedule.todayStatus.toUpperCase() !=
              'TAKEN',
        )
        .toList();

    MedicationSchedule? upcomingSchedule;

    for (final schedule in notTakenSchedules) {
      if (_timeToMinutes(
            schedule.reminderTime,
          ) >=
          currentMinutes) {
        upcomingSchedule = schedule;
        break;
      }
    }

    MedicationSchedule? missedSchedule;

    for (final schedule in notTakenSchedules) {
      final status =
          schedule.todayStatus.toUpperCase();

      if (status == 'MISSED') {
        missedSchedule = schedule;
        break;
      }

      if (_timeToMinutes(
            schedule.reminderTime,
          ) <
          currentMinutes) {
        missedSchedule = schedule;
      }
    }

    // =========================================================
    // 위젯에 표시할 대표 일정
    // =========================================================

    late final MedicationSchedule displaySchedule;
    late final String widgetStatus;

    if (allTaken) {
      // 완료 상태에서도 마지막 복약 약명을 유지
      displaySchedule =
          enabledSchedules.last;

      widgetStatus = 'completed';
    } else if (upcomingSchedule != null) {
      displaySchedule =
          upcomingSchedule;

      widgetStatus = 'upcoming';
    } else if (missedSchedule != null) {
      displaySchedule =
          missedSchedule;

      widgetStatus = 'missed';
    } else {
      displaySchedule =
          enabledSchedules.last;

      final status =
          displaySchedule.todayStatus
              .toUpperCase();

      if (status == 'SKIPPED') {
        widgetStatus = 'skipped';
      } else if (status == 'TAKEN') {
        widgetStatus = 'taken';
      } else {
        widgetStatus = 'finished';
      }
    }

    final medicationName =
        _buildMedicationName(
      displaySchedule,
    );

    final medicationTime =
        _formatReminderTime(
      displaySchedule.reminderTime,
    );

    final progressText =
        '오늘 $takenCount/$totalCount회 복용';

    await _saveWidgetData(
      hasSchedule: true,
      medicationName: medicationName,
      medicationTime: medicationTime,
      medicationStatus: widgetStatus,
      takenCount: takenCount,
      totalCount: totalCount,
      progressText: progressText,
    );
  }

  // =============================================================
  // HomeWidget 저장
  // =============================================================

  Future<void> _saveWidgetData({
    required bool hasSchedule,
    required String medicationName,
    required String medicationTime,
    required String medicationStatus,
    required int takenCount,
    required int totalCount,
    required String progressText,
  }) async {
    await HomeWidget.saveWidgetData<bool>(
      'medication_has_schedule',
      hasSchedule,
    );

    await HomeWidget.saveWidgetData<String>(
      'medication_name',
      medicationName,
    );

    await HomeWidget.saveWidgetData<String>(
      'medication_time',
      medicationTime,
    );

    await HomeWidget.saveWidgetData<String>(
      'medication_status',
      medicationStatus,
    );

    await HomeWidget.saveWidgetData<int>(
      'medication_taken_count',
      takenCount,
    );

    await HomeWidget.saveWidgetData<int>(
      'medication_total_count',
      totalCount,
    );

    await HomeWidget.saveWidgetData<String>(
      'medication_progress_text',
      progressText,
    );

    await HomeWidget.updateWidget(
      name: _androidWidgetName,
    );
  }

  // =============================================================
  // 약 이름 생성
  //
  // Osimertinib 80.000mg
  // ↓
  // Osimertinib 80mg
  // =============================================================

  String _buildMedicationName(
    MedicationSchedule schedule,
  ) {
    if (schedule.items.isEmpty) {
      return '처방약';
    }

    final firstItem =
        schedule.items.first;

    final buffer = StringBuffer(
      firstItem.drugName,
    );

    final dose =
        _formatDose(
      firstItem.dose,
    );

    if (dose.isNotEmpty) {
      buffer.write(
        ' $dose${firstItem.unit}',
      );
    }

    final remainingCount =
        schedule.items.length - 1;

    if (remainingCount > 0) {
      buffer.write(
        ' 외 $remainingCount종',
      );
    }

    return buffer.toString();
  }

  String _formatDose(
    String? rawDose,
  ) {
    if (rawDose == null ||
        rawDose.trim().isEmpty) {
      return '';
    }

    final value =
        double.tryParse(
      rawDose,
    );

    if (value == null) {
      return rawDose;
    }

    if (value == value.roundToDouble()) {
      return value
          .toInt()
          .toString();
    }

    return value
        .toStringAsFixed(3)
        .replaceFirst(
          RegExp(r'0+$'),
          '',
        )
        .replaceFirst(
          RegExp(r'\.$'),
          '',
        );
  }

  // =============================================================
  // 01:20:00 → 01:20
  // =============================================================

  String _formatReminderTime(
    String value,
  ) {
    final parts =
        value.split(':');

    if (parts.length < 2) {
      return value;
    }

    return '${parts[0]}:${parts[1]}';
  }

  int _timeToMinutes(
    String value,
  ) {
    final parts =
        value.split(':');

    if (parts.length < 2) {
      return 0;
    }

    final hour =
        int.tryParse(
              parts[0],
            ) ??
            0;

    final minute =
        int.tryParse(
              parts[1],
            ) ??
            0;

    return hour * 60 + minute;
  }
}