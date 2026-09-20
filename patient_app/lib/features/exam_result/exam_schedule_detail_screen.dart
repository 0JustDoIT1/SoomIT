import 'package:flutter/material.dart';

import 'models/exam_schedule.dart';

class ExamScheduleDetailScreen extends StatelessWidget {
  const ExamScheduleDetailScreen({
    super.key,
    required this.schedule,
    this.onViewResult,
  });

  final ExamSchedule schedule;
  final VoidCallback? onViewResult;

  static const Color _primary = Color(0xFF3198F4);
  static const Color _primaryDark = Color(0xFF2F8DFE);
  static const Color _textPrimary = Color(0xFF191F28);
  static const Color _textSecondary = Color(0xFF6B7684);
  static const Color _border = Color(0xFFE7EDF3);

  @override
  Widget build(BuildContext context) {
    final state = _scheduleState(schedule);

    return Scaffold(
      backgroundColor: const Color(0xFFF5F9FD),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        foregroundColor: _textPrimary,
        title: const Text(
          '검사 일정 상세',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildSummaryCard(state),
              const SizedBox(height: 26),
              if (state == _ScheduleState.scheduled) ...[
                _buildSectionTitle(
                  icon: Icons.info_outline_rounded,
                  title: '검사 안내',
                ),
                const SizedBox(height: 10),
                _buildScheduleGuideCard(),
                const SizedBox(height: 24),
                _buildSectionTitle(
                  icon: Icons.assignment_outlined,
                  title: '검사 준비사항',
                ),
                const SizedBox(height: 10),
                _buildPreparationCard(),
                const SizedBox(height: 14),
                _buildInfoNotice('예약 시간 10분 전까지 도착하여 접수를 완료해주세요.'),
              ] else if (state == _ScheduleState.completed) ...[
                _buildSectionTitle(
                  icon: Icons.info_outline_rounded,
                  title: '검사 안내',
                ),
                const SizedBox(height: 10),
                _buildCompletedGuideCard(),
                const SizedBox(height: 24),
                _buildSectionTitle(
                  icon: Icons.task_alt_rounded,
                  title: '검사 진행 상태',
                ),
                const SizedBox(height: 10),
                _buildProgressCard(),
                const SizedBox(height: 14),
                _buildCompletedNotice(),
                if (onViewResult != null) ...[
                  const SizedBox(height: 22),
                  _buildPrimaryButton(
                    label: '검사 결과 보기',
                    onPressed: onViewResult!,
                  ),
                ],
              ] else ...[
                _buildSectionTitle(
                  icon: Icons.event_busy_outlined,
                  title: '취소 정보',
                  color: const Color(0xFFE5484D),
                ),
                const SizedBox(height: 10),
                _buildCancelledCard(),
                const SizedBox(height: 14),
                _buildInfoNotice('다른 일정으로 다시 예약이 필요하시면 예약 메뉴에서 진행해주세요.'),
                const SizedBox(height: 22),
                _buildOutlineButton(
                  label: '다시 예약하기',
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('예약 메뉴에서 새로운 일정을 신청해주세요.')),
                    );
                  },
                ),
              ],
              const SizedBox(height: 12),
              _buildBackButton(context),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSummaryCard(_ScheduleState state) {
    final style = _statusStyle(state);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _border),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF172033).withValues(alpha: 0.035),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: const Color(0xFFEAF5FF),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  _examIcon(schedule.examType),
                  color: _primaryDark,
                  size: 25,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  schedule.examName,
                  style: const TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w800,
                    color: _textPrimary,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: style.background,
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Text(
                  style.label,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: style.foreground,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _summaryInfoRow(
            Icons.calendar_today_outlined,
            _formatDateTime(schedule.scheduledAt),
          ),
          if (schedule.hospitalName != null) ...[
            const SizedBox(height: 9),
            _summaryInfoRow(
              Icons.local_hospital_outlined,
              '${schedule.hospitalName!} · ${_departmentLabel(schedule.examType)}',
            ),
          ],
          if (schedule.doctorName != null) ...[
            const SizedBox(height: 9),
            _summaryInfoRow(Icons.person_outline_rounded, schedule.doctorName!),
          ],
        ],
      ),
    );
  }

  Widget _summaryInfoRow(IconData icon, String text) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 17, color: const Color(0xFF8B95A1)),
        const SizedBox(width: 8),
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

  Widget _buildSectionTitle({
    required IconData icon,
    required String title,
    Color color = _primaryDark,
  }) {
    return Row(
      children: [
        Icon(icon, size: 21, color: color),
        const SizedBox(width: 8),
        Text(
          title,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: _textPrimary,
          ),
        ),
      ],
    );
  }

  Widget _buildScheduleGuideCard() {
    return _whiteCard(
      child: Column(
        children: [
          _guideRow(
            icon: Icons.location_on_outlined,
            label: '검사 장소',
            value: schedule.hospitalName == null
                ? _departmentLabel(schedule.examType)
                : '${schedule.hospitalName!} · ${_departmentLabel(schedule.examType)}',
          ),
          const Divider(height: 1, color: _border),
          _guideRow(
            icon: Icons.badge_outlined,
            label: '접수 안내',
            value: '검사 당일 접수처에서 안내받아주세요.',
          ),
          const Divider(height: 1, color: _border),
          _guideRow(
            icon: Icons.schedule_outlined,
            label: '소요 시간',
            value: _durationGuide(schedule.examType),
          ),
        ],
      ),
    );
  }

  Widget _buildCompletedGuideCard() {
    return _whiteCard(
      child: Column(
        children: [
          _guideRow(
            icon: Icons.location_on_outlined,
            label: '검사 장소',
            value: schedule.hospitalName == null
                ? _departmentLabel(schedule.examType)
                : '${schedule.hospitalName!} · ${_departmentLabel(schedule.examType)}',
          ),
          const Divider(height: 1, color: _border),
          _guideRow(
            icon: Icons.task_alt_outlined,
            label: '검사 상태',
            value: '검사가 완료되었습니다.',
          ),
        ],
      ),
    );
  }

  Widget _buildPreparationCard() {
    final guide = schedule.preparationGuide?.trim();
    final items = <String>[
      if (guide != null && guide.isNotEmpty) guide,
      '평소 복용 중인 약이 있다면 담당 의료진의 안내에 따라주세요.',
    ];

    return _whiteCard(
      child: Column(
        children: List.generate(items.length, (index) {
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 15,
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 26,
                      height: 26,
                      decoration: const BoxDecoration(
                        color: Color(0xFFEAF5FF),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.info_outline_rounded,
                        size: 16,
                        color: _primaryDark,
                      ),
                    ),
                    const SizedBox(width: 11),
                    Expanded(
                      child: Text(
                        items[index],
                        style: const TextStyle(
                          fontSize: 14,
                          height: 1.55,
                          color: _textSecondary,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              if (index != items.length - 1)
                const Divider(height: 1, color: _border),
            ],
          );
        }),
      ),
    );
  }

  Widget _buildProgressCard() {
    final steps = const ['예약 확정', '검사 접수', '검사 진행', '검사 완료'];

    return _whiteCard(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Column(
          children: List.generate(steps.length, (index) {
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 9),
              child: Row(
                children: [
                  Container(
                    width: 26,
                    height: 26,
                    decoration: const BoxDecoration(
                      color: _primaryDark,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.check_rounded,
                      color: Colors.white,
                      size: 17,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      steps[index],
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: _textPrimary,
                      ),
                    ),
                  ),
                  if (index == 3)
                    Text(
                      _formatShortDate(schedule.scheduledAt),
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF8B95A1),
                      ),
                    ),
                ],
              ),
            );
          }),
        ),
      ),
    );
  }

  Widget _buildCompletedNotice() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: const Color(0xFFF0FBF6),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFD7F2E5)),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.check_circle_rounded, size: 20, color: Color(0xFF20A66A)),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              '검사가 정상적으로 완료되었습니다. 결과가 확정되면 검사 결과 탭에서 확인할 수 있습니다.',
              style: TextStyle(
                fontSize: 13,
                height: 1.5,
                color: _textSecondary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCancelledCard() {
    return _whiteCard(
      child: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: const BoxDecoration(
              color: Color(0xFFFFF2F2),
              borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.error_outline_rounded,
                  size: 20,
                  color: Color(0xFFE5484D),
                ),
                SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '취소 사유',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFFE5484D),
                        ),
                      ),
                      SizedBox(height: 5),
                      Text(
                        '예약이 취소된 검사 일정입니다.',
                        style: TextStyle(
                          fontSize: 13,
                          height: 1.5,
                          color: _textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          _guideRow(
            icon: Icons.event_busy_outlined,
            label: '예약 상태',
            value: schedule.appointmentStatusLabel,
            valueColor: const Color(0xFFE5484D),
          ),
          const Divider(height: 1, color: _border),
          _guideRow(
            icon: Icons.calendar_month_outlined,
            label: '기존 일정',
            value: _formatDateTime(schedule.scheduledAt),
          ),
        ],
      ),
    );
  }

  Widget _guideRow({
    required IconData icon,
    required String label,
    required String value,
    Color? valueColor,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 19, color: const Color(0xFF7D8DA1)),
          const SizedBox(width: 10),
          SizedBox(
            width: 74,
            child: Text(
              label,
              style: const TextStyle(fontSize: 13, color: Color(0xFF8B95A1)),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontSize: 13,
                height: 1.45,
                fontWeight: FontWeight.w600,
                color: valueColor ?? _textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _whiteCard({required Widget child}) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _border),
      ),
      clipBehavior: Clip.antiAlias,
      child: child,
    );
  }

  Widget _buildInfoNotice(String text) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: const Color(0xFFF3F8FF),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFDCEBFF)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline_rounded, size: 20, color: _primary),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 13,
                height: 1.5,
                color: _textSecondary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPrimaryButton({
    required String label,
    required VoidCallback onPressed,
  }) {
    return SizedBox(
      width: double.infinity,
      height: 50,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: _primaryDark,
          foregroundColor: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: Text(
          label,
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
        ),
      ),
    );
  }

  Widget _buildOutlineButton({
    required String label,
    required VoidCallback onPressed,
  }) {
    return SizedBox(
      width: double.infinity,
      height: 50,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: _primaryDark,
          side: const BorderSide(color: _primaryDark),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: Text(
          label,
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
        ),
      ),
    );
  }

  Widget _buildBackButton(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 50,
      child: TextButton(
        onPressed: () => Navigator.pop(context),
        style: TextButton.styleFrom(
          foregroundColor: _primaryDark,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: const Text(
          '목록으로 돌아가기',
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }

  static _ScheduleState _scheduleState(ExamSchedule schedule) {
    final raw = '${schedule.appointmentStatus} ${schedule.visitStatus}'
        .toUpperCase();

    if (raw.contains('CANCEL')) {
      return _ScheduleState.cancelled;
    }

    if (raw.contains('COMPLETE') ||
        raw.contains('DONE') ||
        raw.contains('FINISH')) {
      return _ScheduleState.completed;
    }

    return _ScheduleState.scheduled;
  }

  _StatusStyle _statusStyle(_ScheduleState state) {
    switch (state) {
      case _ScheduleState.completed:
        return const _StatusStyle(
          label: '검사 완료',
          foreground: Color(0xFF20A66A),
          background: Color(0xFFEAF8F1),
        );
      case _ScheduleState.cancelled:
        return const _StatusStyle(
          label: '예약 취소',
          foreground: Color(0xFFE5484D),
          background: Color(0xFFFFEEEE),
        );
      case _ScheduleState.scheduled:
        return const _StatusStyle(
          label: '검사 예정',
          foreground: _primaryDark,
          background: Color(0xFFEAF5FF),
        );
    }
  }

  IconData _examIcon(String type) {
    final value = type.toUpperCase();
    if (value.contains('PATHOLOGY') || value.contains('PDL1')) {
      return Icons.description_outlined;
    }
    if (value.contains('PET')) {
      return Icons.biotech_outlined;
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

  String _durationGuide(String type) {
    final value = type.toUpperCase();
    if (value.contains('XRAY')) return '약 10~20분';
    if (value == 'CT' || value.contains('CT')) return '약 30분';
    if (value.contains('PATHOLOGY') || value.contains('PDL1')) {
      return '검사 방법에 따라 달라질 수 있어요.';
    }
    return '검사 종류에 따라 달라질 수 있어요.';
  }

  String _formatDateTime(DateTime date) {
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

  String _formatShortDate(DateTime date) {
    final local = date.toLocal();
    return '${local.year}.'
        '${local.month.toString().padLeft(2, '0')}.'
        '${local.day.toString().padLeft(2, '0')}';
  }
}

enum _ScheduleState { scheduled, completed, cancelled }

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
