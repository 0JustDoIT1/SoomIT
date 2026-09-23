import 'package:flutter/material.dart';

import 'models/appointment.dart';
import 'models/appointment_availability.dart';
import 'services/appointment_service.dart';

class AppointmentDetailScreen extends StatefulWidget {
  final Appointment appointment;

  const AppointmentDetailScreen({super.key, required this.appointment});

  @override
  State<AppointmentDetailScreen> createState() =>
      _AppointmentDetailScreenState();
}

class _AppointmentDetailScreenState extends State<AppointmentDetailScreen> {
  final AppointmentService _appointmentService = AppointmentService();

  late Appointment _appointment;

  bool _isSubmitting = false;
  bool _localCancellationRequested = false;
  bool _localChangeRequested = false;

  static const Color _primaryBlue = Color(0xFF3198F4);

  static const Color _strongBlue = Color(0xFF2F8DFE);

  static const Color _background = Color(0xFFF5F9FD);

  static const Color _textPrimary = Color(0xFF172033);

  static const Color _textSecondary = Color(0xFF748198);

  static const Color _border = Color(0xFFE5EDF5);

  @override
  void initState() {
    super.initState();

    _appointment = widget.appointment;
  }

  bool get _isCancellationRequested {
    final pending = _appointment.pendingRequest;

    return _localCancellationRequested ||
        _appointment.cancellationRequestedAt != null ||
        (pending != null &&
            pending.requestType.toUpperCase() == 'CANCEL' &&
            pending.status.toUpperCase() == 'PENDING');
  }

  bool get _isChangeRequested {
    final pending = _appointment.pendingRequest;

    return _localChangeRequested ||
        (pending != null &&
            pending.requestType.toUpperCase() == 'CHANGE' &&
            pending.status.toUpperCase() == 'PENDING');
  }

  DateTime? get _requestedChangeScheduledAt {
    final pending = _appointment.pendingRequest;

    if (_isChangeRequested &&
        pending != null &&
        pending.requestedScheduledAt != null) {
      return pending.requestedScheduledAt!.toLocal();
    }

    return null;
  }

  String get _changeRequestNoticeText {
    final requestedAt = _requestedChangeScheduledAt;

    if (requestedAt == null) {
      return '예약 변경 요청이 접수되었습니다.\n'
          '원무과 확인 후 일정이 변경됩니다.';
    }

    return '예약 변경 요청이 접수되었습니다.\n'
        '변경 요청 일정: ${_formatDate(requestedAt)} ${_formatTime(requestedAt)}\n'
        '원무과 승인 전까지 현재 예약 일정이 유지됩니다.';
  }

  bool get _isFinished {
    return _appointment.appointmentStatus == 'CANCELLED' ||
        _appointment.visitStatus == 'VISITED' ||
        _appointment.visitStatus == 'COMPLETED';
  }

  bool get _isFutureAppointment {
    return _appointment.scheduledAt.toLocal().isAfter(DateTime.now());
  }

  bool get _canRequestChange {
    return !_isFinished &&
        _isFutureAppointment &&
        !_isCancellationRequested &&
        !_isChangeRequested &&
        _appointment.doctorId != null;
  }

  bool get _canRequestCancellation {
    return !_isFinished &&
        _isFutureAppointment &&
        !_isCancellationRequested;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _background,
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        foregroundColor: _textPrimary,
        titleSpacing: 0,
        title: const Text(
          '예약 상세',
          style: TextStyle(
            color: _textPrimary,
            fontSize: 20,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.4,
          ),
        ),
      ),
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildSummaryCard(),

              const SizedBox(height: 26),

              const Text(
                '예약 정보',
                style: TextStyle(
                  color: _textPrimary,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.4,
                ),
              ),

              const SizedBox(height: 12),

              _buildInfoCard(),

              if (_isCancellationRequested) ...[
                const SizedBox(height: 18),
                _buildRequestNotice(
                  icon: Icons.info_outline_rounded,
                  text: '예약 취소 요청이 접수되었습니다.\n원무과 확인 후 최종 취소됩니다.',
                  foreground: const Color(0xFFE85D67),
                  background: const Color(0xFFFFF3F4),
                  border: const Color(0xFFFFDADD),
                ),
              ] else if (_isChangeRequested) ...[
                const SizedBox(height: 18),
                _buildRequestNotice(
                  icon: Icons.schedule_rounded,
                  text: _changeRequestNoticeText,
                  foreground: _strongBlue,
                  background: const Color(0xFFEAF5FF),
                  border: const Color(0xFFD5EAFF),
                ),
              ],

              if (_canRequestChange || _canRequestCancellation) ...[
                const SizedBox(height: 24),

                if (_canRequestChange) _buildChangeButton(),

                if (_canRequestChange && _canRequestCancellation)
                  const SizedBox(height: 12),

                if (_canRequestCancellation) _buildCancelButton(),
              ],
            ],
          ),
        ),
      ),
    );
  }

  // =========================================================
  // 상단 예약 요약
  // =========================================================

  Widget _buildSummaryCard() {
    final date = _appointment.scheduledAt.toLocal();

    final statusStyle = _getStatusStyle();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFEAF7FF), Color(0xFFDDF2FF)],
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFD7ECFB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
            decoration: BoxDecoration(
              color: statusStyle.background,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              _displayStatus,
              style: TextStyle(
                color: statusStyle.foreground,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),

          const SizedBox(height: 17),

          Text(
            '${date.year}년 '
            '${date.month}월 '
            '${date.day}일 '
            '${_getDayOfWeek(date)}요일',
            style: const TextStyle(
              color: _textPrimary,
              fontSize: 22,
              height: 1.25,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.8,
            ),
          ),

          const SizedBox(height: 5),

          Text(
            _formatTime(date),
            style: const TextStyle(
              color: _strongBlue,
              fontSize: 21,
              fontWeight: FontWeight.w800,
            ),
          ),

          const SizedBox(height: 18),

          Container(height: 1, color: Colors.white.withValues(alpha: 0.85)),

          const SizedBox(height: 15),

          Row(
            children: [
              const Icon(
                Icons.local_hospital_outlined,
                color: Color(0xFF72869D),
                size: 19,
              ),

              const SizedBox(width: 8),

              Expanded(
                child: Text(
                  '${_safeText(_appointment.hospitalName, '병원 정보 없음')} · ${_appointment.displayType}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Color(0xFF52657B),
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // =========================================================
  // 예약 정보
  // =========================================================

  Widget _buildInfoCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 17, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: _border),
      ),
      child: Column(
        children: [
          _buildInfoRow(
            icon: Icons.local_hospital_outlined,
            label: '병원',
            value: _safeText(_appointment.hospitalName, '병원 정보 없음'),
          ),

          _buildDivider(),

          _buildInfoRow(
            icon: Icons.medical_services_outlined,
            label: '진료 종류',
            value: _appointment.displayType,
          ),

          _buildDivider(),

          _buildInfoRow(
            icon: Icons.person_outline_rounded,
            label: '의사',
            value: _appointment.doctorName ?? '담당 의료진 미지정',
          ),

          _buildDivider(),

          _buildInfoRow(
            icon: Icons.calendar_month_outlined,
            label: '날짜',
            value: _formatDate(_appointment.scheduledAt.toLocal()),
          ),

          _buildDivider(),

          _buildInfoRow(
            icon: Icons.schedule_rounded,
            label: '시간',
            value: _formatTime(_appointment.scheduledAt.toLocal()),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoRow({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: const Color(0xFFF0F7FE),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: _primaryBlue, size: 20),
          ),

          const SizedBox(width: 12),

          SizedBox(
            width: 70,
            child: Text(
              label,
              style: const TextStyle(
                color: _textSecondary,
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),

          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: _textPrimary,
                fontSize: 14,
                height: 1.35,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDivider() {
    return const Divider(height: 1, thickness: 1, color: Color(0xFFEDF2F7));
  }

  // =========================================================
  // 요청 상태 안내
  // =========================================================

  Widget _buildRequestNotice({
    required IconData icon,
    required String text,
    required Color foreground,
    required Color background,
    required Color border,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(17),
        border: Border.all(color: border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: foreground, size: 21),

          const SizedBox(width: 10),

          Expanded(
            child: Text(
              text,
              style: TextStyle(
                color: foreground,
                fontSize: 13,
                height: 1.5,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // =========================================================
  // 변경 버튼
  // =========================================================

  Widget _buildChangeButton() {
    return SizedBox(
      width: double.infinity,
      height: 54,
      child: FilledButton.icon(
        onPressed: _isSubmitting ? null : _openChangeSheet,
        icon: _isSubmitting
            ? const SizedBox.shrink()
            : const Icon(Icons.edit_calendar_outlined, size: 20),
        label: _isSubmitting
            ? const SizedBox(
                width: 21,
                height: 21,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : const Text(
                '예약 변경 요청',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
              ),
        style: FilledButton.styleFrom(
          backgroundColor: _strongBlue,
          foregroundColor: Colors.white,
          disabledBackgroundColor: const Color(0xFFA8C9F8),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(15),
          ),
        ),
      ),
    );
  }

  // =========================================================
  // 취소 버튼
  // =========================================================

  Widget _buildCancelButton() {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: OutlinedButton.icon(
        onPressed: _isSubmitting ? null : _showCancellationDialog,
        icon: const Icon(Icons.event_busy_outlined, size: 19),
        label: const Text(
          '예약 취소 요청',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
        ),
        style: OutlinedButton.styleFrom(
          foregroundColor: const Color(0xFFE85D67),
          backgroundColor: Colors.white,
          side: const BorderSide(color: Color(0xFFFFC9CE), width: 1.2),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(15),
          ),
        ),
      ),
    );
  }

  // =========================================================
  // 예약 변경
  // =========================================================

  Future<void> _openChangeSheet() async {
    final doctorId = _appointment.doctorId;

    if (doctorId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('담당 의료진 정보가 없어 예약을 변경할 수 없습니다.')),
      );

      return;
    }

    final updatedAppointment = await showModalBottomSheet<Appointment>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      useSafeArea: true,
      builder: (context) {
        return _AppointmentChangeSheet(
          appointment: _appointment,
          service: _appointmentService,
        );
      },
    );

    if (!mounted || updatedAppointment == null) {
      return;
    }

    setState(() {
      _appointment = updatedAppointment;
      _localChangeRequested = true;
    });

    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('예약 변경 요청이 접수되었습니다.')));
  }

  // =========================================================
  // 예약 취소
  // =========================================================

  Future<void> _showCancellationDialog() async {
    final reasonController = TextEditingController(text: '환자 요청');

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: Colors.white,
          surfaceTintColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          title: const Text(
            '예약 취소 요청',
            style: TextStyle(fontWeight: FontWeight.w800),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                '예약 취소를 요청하시겠습니까?\n'
                '원무과 확인 후 최종 취소됩니다.',
                style: TextStyle(height: 1.5, color: _textSecondary),
              ),

              const SizedBox(height: 16),

              TextField(
                controller: reasonController,
                maxLines: 2,
                decoration: InputDecoration(
                  labelText: '취소 사유',
                  filled: true,
                  fillColor: const Color(0xFFF8FAFC),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(13),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(13),
                    borderSide: const BorderSide(color: _border),
                  ),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(dialogContext).pop(false);
              },
              child: const Text('닫기'),
            ),

            TextButton(
              onPressed: () {
                Navigator.of(dialogContext).pop(true);
              },
              child: const Text(
                '취소 요청',
                style: TextStyle(
                  color: Color(0xFFE85D67),
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        );
      },
    );

    if (confirmed != true) {
      reasonController.dispose();
      return;
    }

    final reason = reasonController.text.trim();

    reasonController.dispose();

    await _requestCancellation(reason.isEmpty ? '환자 요청' : reason);
  }

  Future<void> _requestCancellation(String reason) async {
    setState(() {
      _isSubmitting = true;
    });

    try {
      final updated = await _appointmentService.requestCancellation(
        appointmentId: _appointment.id,
        cancellationReason: reason,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _appointment = updated;
        _localCancellationRequested = true;
        _localChangeRequested = false;
      });

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('예약 취소 요청이 접수되었습니다.')));
    } catch (_) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('예약 취소 요청에 실패했습니다.')));
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  // =========================================================
  // 상태
  // =========================================================

  String get _displayStatus {
    if (_isCancellationRequested) {
      return '취소 요청중';
    }

    if (_isChangeRequested) {
      return '변경 요청중';
    }

    if (_appointment.appointmentStatus == 'CANCELLED') {
      return '취소';
    }

    if (_appointment.visitStatus == 'VISITED' ||
        _appointment.visitStatus == 'COMPLETED') {
      return '완료';
    }

    if (_appointment.appointmentStatus == 'REQUESTED') {
      return '요청됨';
    }

    if (_appointment.appointmentStatus == 'CONFIRMED') {
      if (!_appointment.scheduledAt.toLocal().isAfter(DateTime.now())) {
        return '지난 예약';
      }

      return '확정';
    }

    return _appointment.appointmentStatusLabel;
  }

  _StatusStyle _getStatusStyle() {
    if (_isCancellationRequested ||
        _appointment.appointmentStatus == 'CANCELLED') {
      return const _StatusStyle(
        foreground: Color(0xFFE85D67),
        background: Color(0xFFFFEEF0),
      );
    }

    if (_isChangeRequested ||
        _appointment.appointmentStatus == 'REQUESTED') {
      return const _StatusStyle(
        foreground: Color(0xFF428BF5),
        background: Color(0xFFEAF3FF),
      );
    }

    if (_appointment.visitStatus == 'VISITED' ||
        _appointment.visitStatus == 'COMPLETED') {
      return const _StatusStyle(
        foreground: Color(0xFF6B7A8E),
        background: Color(0xFFF0F3F6),
      );
    }

    if (_appointment.appointmentStatus == 'CONFIRMED' &&
        !_appointment.scheduledAt.toLocal().isAfter(DateTime.now())) {
      return const _StatusStyle(
        foreground: Color(0xFF6B7A8E),
        background: Color(0xFFF0F3F6),
      );
    }

    return const _StatusStyle(
      foreground: Color(0xFF20B99A),
      background: Color(0xFFE8FAF5),
    );
  }

  // =========================================================
  // 포맷
  // =========================================================

  String _safeText(String? value, String fallback) {
    if (value == null || value.trim().isEmpty) {
      return fallback;
    }

    return value;
  }

  String _formatDate(DateTime date) {
    return '${date.year}년 '
        '${date.month}월 '
        '${date.day}일';
  }

  String _formatTime(DateTime date) {
    final local = date.toLocal();

    final period = local.hour < 12 ? '오전' : '오후';

    final hour = local.hour == 0
        ? 12
        : local.hour > 12
        ? local.hour - 12
        : local.hour;

    return '$period $hour:'
        '${local.minute.toString().padLeft(2, '0')}';
  }

  String _getDayOfWeek(DateTime date) {
    const days = ['월', '화', '수', '목', '금', '토', '일'];

    return days[date.weekday - 1];
  }
}

// ===========================================================
// 예약 변경 BottomSheet
// ===========================================================

class _AppointmentChangeSheet extends StatefulWidget {
  final Appointment appointment;
  final AppointmentService service;

  const _AppointmentChangeSheet({
    required this.appointment,
    required this.service,
  });

  @override
  State<_AppointmentChangeSheet> createState() =>
      _AppointmentChangeSheetState();
}

class _AppointmentChangeSheetState extends State<_AppointmentChangeSheet> {
  static const Color _primaryBlue = Color(0xFF3198F4);
  static const Color _strongBlue = Color(0xFF2F8DFE);
  static const Color _textPrimary = Color(0xFF172033);
  static const Color _textSecondary = Color(0xFF748198);
  static const Color _border = Color(0xFFE4EBF2);
  static const Color _surface = Color(0xFFF8FAFC);

  AppointmentAvailability? _availability;

  DateTime? _selectedDate;
  DateTime? _selectedSlot;

  bool _loading = true;
  bool _submitting = false;

  String? _errorMessage;

  final TextEditingController _reasonController = TextEditingController(
    text: '환자 요청',
  );

  @override
  void initState() {
    super.initState();
    _loadAvailability();
  }

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  Future<void> _loadAvailability() async {
    final doctorId = widget.appointment.doctorId;

    if (doctorId == null) {
      setState(() {
        _loading = false;
        _errorMessage = '담당 의료진 정보가 없습니다.';
      });
      return;
    }

    final today = _dateOnly(DateTime.now());
    final end = today.add(const Duration(days: 31));

    try {
      final availability = await widget.service.getAppointmentAvailability(
        doctorId: doctorId,
        start: today,
        end: end,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _availability = availability;

        // 변경 화면을 처음 열었을 때 날짜/시간을 자동 선택하지 않는다.
        _selectedDate = null;
        _selectedSlot = null;

        _loading = false;
        _errorMessage = null;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _loading = false;
        _errorMessage = '예약 가능 시간을 불러오지 못했습니다.';
      });
    }
  }

  List<AppointmentAvailabilityDate> get _availableDates {
    final availability = _availability;

    if (availability == null) {
      return [];
    }

    final dates =
        availability.dates.where((item) => item.slots.isNotEmpty).toList()
          ..sort((a, b) => a.date.compareTo(b.date));

    return dates;
  }

  List<DateTime> get _selectedSlots {
    final selectedDate = _selectedDate;

    if (selectedDate == null) {
      return [];
    }

    for (final item in _availableDates) {
      if (_sameDate(item.date, selectedDate)) {
        final slots = [...item.slots]..sort();
        return slots;
      }
    }

    return [];
  }

  List<AppointmentAvailabilitySlot> get _selectedAllSlots {
    final selectedDate = _selectedDate;
    final availability = _availability;

    if (selectedDate == null || availability == null) {
      return [];
    }

    for (final item in availability.dates) {
      if (_sameDate(item.date, selectedDate)) {
        final slots = [...item.allSlots]
          ..sort(
            (a, b) => _koreaTime(
              a.startAt,
            ).compareTo(
              _koreaTime(b.startAt),
            ),
          );

        return slots;
      }
    }

    return [];
  }

  Future<void> _openCalendar() async {
    final availability = _availability;

    if (availability == null) {
      return;
    }

    final availableDates =
        availability.dates
            .where((item) => item.slots.isNotEmpty)
            .map((item) => _dateOnly(item.date))
            .toList()
          ..sort();

    if (availableDates.isEmpty) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('선택 가능한 예약일이 없습니다.')));
      return;
    }

    // 변경 가능 일정 조회 범위와 동일하게 달력 범위를 잡는다.
    final firstDate = _dateOnly(DateTime.now());
    final lastDate = firstDate.add(const Duration(days: 31));

    final currentSelected = _selectedDate;
    final initialDate =
        currentSelected != null &&
            availableDates.any((date) => _sameDate(date, currentSelected))
        ? _dateOnly(currentSelected)
        : availableDates.first;

    DateTime displayedMonth = DateTime(
      initialDate.year,
      initialDate.month,
      1,
    );
    DateTime? temporarySelected = currentSelected == null
        ? null
        : _dateOnly(currentSelected);

    final selected = await showDialog<DateTime>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.35),
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            final firstMonth = DateTime(firstDate.year, firstDate.month, 1);
            final lastMonth = DateTime(lastDate.year, lastDate.month, 1);

            final canGoPrevious = displayedMonth.isAfter(firstMonth);
            final canGoNext = displayedMonth.isBefore(lastMonth);

            final firstDayOfMonth = DateTime(
              displayedMonth.year,
              displayedMonth.month,
              1,
            );
            final daysInMonth = DateTime(
              displayedMonth.year,
              displayedMonth.month + 1,
              0,
            ).day;

            // 일요일 시작 달력: 일=0, 월=1 ... 토=6
            final leadingBlankCount = firstDayOfMonth.weekday % 7;
            final totalCellCount =
                ((leadingBlankCount + daysInMonth + 6) ~/ 7) * 7;

            return Dialog(
              backgroundColor: Colors.transparent,
              insetPadding: const EdgeInsets.symmetric(horizontal: 20),
              child: Container(
                constraints: const BoxConstraints(maxWidth: 430),
                padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.08),
                      blurRadius: 24,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            '변경할 날짜 선택',
                            style: TextStyle(
                              color: _textPrimary,
                              fontSize: 19,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.4,
                            ),
                          ),
                        ),
                        IconButton(
                          onPressed: () {
                            Navigator.of(dialogContext).pop();
                          },
                          visualDensity: VisualDensity.compact,
                          icon: const Icon(
                            Icons.close_rounded,
                            color: Color(0xFF7B8798),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 10),

                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 13,
                        vertical: 11,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF5FAFF),
                        borderRadius: BorderRadius.circular(13),
                        border: Border.all(
                          color: const Color(0xFFDCEBFF),
                        ),
                      ),
                      child: const Row(
                        children: [
                          Icon(
                            Icons.info_outline_rounded,
                            size: 18,
                            color: _strongBlue,
                          ),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              '예약 가능한 날짜만 선택할 수 있어요.',
                              style: TextStyle(
                                color: Color(0xFF5D7086),
                                fontSize: 12,
                                height: 1.35,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 18),

                    Row(
                      children: [
                        _buildCalendarArrowButton(
                          icon: Icons.chevron_left_rounded,
                          enabled: canGoPrevious,
                          onTap: () {
                            setDialogState(() {
                              displayedMonth = DateTime(
                                displayedMonth.year,
                                displayedMonth.month - 1,
                                1,
                              );
                            });
                          },
                        ),
                        Expanded(
                          child: Text(
                            '${displayedMonth.year}년 '
                            '${displayedMonth.month}월',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: _textPrimary,
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        _buildCalendarArrowButton(
                          icon: Icons.chevron_right_rounded,
                          enabled: canGoNext,
                          onTap: () {
                            setDialogState(() {
                              displayedMonth = DateTime(
                                displayedMonth.year,
                                displayedMonth.month + 1,
                                1,
                              );
                            });
                          },
                        ),
                      ],
                    ),

                    const SizedBox(height: 14),

                    const Row(
                      children: [
                        _ChangeCalendarWeekday(
                          '일',
                          color: Color(0xFFE56B6F),
                        ),
                        _ChangeCalendarWeekday('월'),
                        _ChangeCalendarWeekday('화'),
                        _ChangeCalendarWeekday('수'),
                        _ChangeCalendarWeekday('목'),
                        _ChangeCalendarWeekday('금'),
                        _ChangeCalendarWeekday(
                          '토',
                          color: Color(0xFF5B8DEF),
                        ),
                      ],
                    ),

                    const SizedBox(height: 6),

                    GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 7,
                            mainAxisSpacing: 5,
                            crossAxisSpacing: 5,
                            childAspectRatio: 0.78,
                          ),
                      itemCount: totalCellCount,
                      itemBuilder: (context, index) {
                        if (index < leadingBlankCount ||
                            index >= leadingBlankCount + daysInMonth) {
                          return const SizedBox.shrink();
                        }

                        final day = index - leadingBlankCount + 1;
                        final date = DateTime(
                          displayedMonth.year,
                          displayedMonth.month,
                          day,
                        );

                        final inRange =
                            !date.isBefore(firstDate) &&
                            !date.isAfter(lastDate);

                        final status = inRange
                            ? _changeDateStatus(date)
                            : _ChangeDateStatus.outside;

                        final isAvailable =
                            status == _ChangeDateStatus.available;
                        final isSelected =
                            temporarySelected != null &&
                            _sameDate(date, temporarySelected!);

                        return _buildCalendarDateCell(
                          date: date,
                          status: status,
                          selected: isSelected,
                          onTap: isAvailable
                              ? () {
                                  setDialogState(() {
                                    temporarySelected = date;
                                  });
                                }
                              : null,
                        );
                      },
                    ),

                    const SizedBox(height: 14),

                    const Align(
                      alignment: Alignment.centerLeft,
                      child: Wrap(
                        spacing: 14,
                        runSpacing: 6,
                        children: [
                          _ChangeCalendarLegend(
                            color: _strongBlue,
                            text: '예약 가능',
                          ),
                          _ChangeCalendarLegend(
                            color: Color(0xFFE56B6F),
                            text: '휴진',
                          ),
                          _ChangeCalendarLegend(
                            color: Color(0xFF9CA3AF),
                            text: '예약 마감',
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 18),

                    Row(
                      children: [
                        Expanded(
                          child: SizedBox(
                            height: 48,
                            child: OutlinedButton(
                              onPressed: () {
                                Navigator.of(dialogContext).pop();
                              },
                              style: OutlinedButton.styleFrom(
                                foregroundColor: const Color(0xFF596A7E),
                                side: const BorderSide(
                                  color: Color(0xFFDDE6EF),
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(13),
                                ),
                              ),
                              child: const Text(
                                '취소',
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: SizedBox(
                            height: 48,
                            child: FilledButton(
                              onPressed: temporarySelected == null
                                  ? null
                                  : () {
                                      Navigator.of(
                                        dialogContext,
                                      ).pop(temporarySelected);
                                    },
                              style: FilledButton.styleFrom(
                                backgroundColor: _strongBlue,
                                foregroundColor: Colors.white,
                                disabledBackgroundColor:
                                    const Color(0xFFD9E5F2),
                                disabledForegroundColor:
                                    const Color(0xFF9AA8B8),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(13),
                                ),
                              ),
                              child: const Text(
                                '선택',
                                style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    if (selected == null || !mounted) {
      return;
    }

    setState(() {
      _selectedDate = _dateOnly(selected);

      // 날짜를 다시 선택하면 이전 시간 선택은 초기화한다.
      _selectedSlot = null;
    });
  }

  _ChangeDateStatus _changeDateStatus(DateTime date) {
    final target = _dateOnly(date);
    final availability = _availability;

    if (availability == null) {
      return _ChangeDateStatus.outside;
    }

    AppointmentAvailabilityDate? dateData;

    for (final item in availability.dates) {
      if (_sameDate(item.date, target)) {
        dateData = item;
        break;
      }
    }

    // 서버에서 날짜 자체가 내려오지 않은 경우: 휴진
    if (dateData == null) {
      return _ChangeDateStatus.closed;
    }

    // 날짜는 있지만 선택 가능한 시간이 없는 경우: 예약 마감
    if (dateData.slots.isEmpty) {
      return _ChangeDateStatus.full;
    }

    return _ChangeDateStatus.available;
  }

  Widget _buildCalendarArrowButton({
    required IconData icon,
    required bool enabled,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          width: 38,
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: enabled
                ? const Color(0xFFF6F9FC)
                : const Color(0xFFFAFBFC),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: enabled
                  ? const Color(0xFFE3EAF1)
                  : const Color(0xFFF0F2F4),
            ),
          ),
          child: Icon(
            icon,
            size: 22,
            color: enabled
                ? const Color(0xFF52657B)
                : const Color(0xFFC8CED6),
          ),
        ),
      ),
    );
  }

  Widget _buildCalendarDateCell({
    required DateTime date,
    required _ChangeDateStatus status,
    required bool selected,
    required VoidCallback? onTap,
  }) {
    Color backgroundColor = Colors.white;
    Color borderColor = Colors.transparent;
    Color numberColor = _textPrimary;
    String? statusText;
    Color statusColor = _textSecondary;

    if (selected) {
      backgroundColor = _strongBlue;
      borderColor = _strongBlue;
      numberColor = Colors.white;
    } else {
      switch (status) {
        case _ChangeDateStatus.available:
          backgroundColor = Colors.white;
          borderColor = const Color(0xFFDCE8F5);
          numberColor = _textPrimary;
          break;

        case _ChangeDateStatus.closed:
          backgroundColor = const Color(0xFFFFF7F7);
          borderColor = const Color(0xFFFFE1E1);
          numberColor = const Color(0xFFB8BFC8);
          statusText = '휴진';
          statusColor = const Color(0xFFE56B6F);
          break;

        case _ChangeDateStatus.full:
          backgroundColor = const Color(0xFFF7F8FA);
          borderColor = const Color(0xFFE8EAED);
          numberColor = const Color(0xFFB8BFC8);
          statusText = '마감';
          statusColor = const Color(0xFF9CA3AF);
          break;

        case _ChangeDateStatus.outside:
          backgroundColor = Colors.transparent;
          borderColor = Colors.transparent;
          numberColor = const Color(0xFFD0D5DC);
          break;
      }
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 140),
          decoration: BoxDecoration(
            color: backgroundColor,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: borderColor,
              width: selected ? 1.3 : 1,
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                '${date.day}',
                style: TextStyle(
                  color: numberColor,
                  fontSize: 14,
                  fontWeight: selected ? FontWeight.w800 : FontWeight.w700,
                ),
              ),
              if (!selected && statusText != null) ...[
                const SizedBox(height: 2),
                Text(
                  statusText,
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 8.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.86,
      ),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          children: [
            Container(
              margin: const EdgeInsets.only(top: 10),
              width: 42,
              height: 5,
              decoration: BoxDecoration(
                color: const Color(0xFFD9E1EA),
                borderRadius: BorderRadius.circular(99),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 17, 20, 15),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      '예약 변경 요청',
                      style: TextStyle(
                        color: _textPrimary,
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: _submitting
                        ? null
                        : () {
                            Navigator.of(context).pop();
                          },
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
            ),
            const Divider(height: 1, color: Color(0xFFEDF2F7)),
            Expanded(child: _buildSheetBody()),
          ],
        ),
      ),
    );
  }

  Widget _buildSheetBody() {
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: _primaryBlue),
      );
    }

    if (_errorMessage != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.error_outline_rounded,
                size: 42,
                color: _textSecondary,
              ),
              const SizedBox(height: 12),
              Text(
                _errorMessage!,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: _textSecondary,
                  fontSize: 14,
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (_availableDates.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            '변경 가능한 예약 시간이 없습니다.',
            textAlign: TextAlign.center,
            style: TextStyle(color: _textSecondary),
          ),
        ),
      );
    }

    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildCurrentAppointmentNotice(),
          const SizedBox(height: 24),

          const Text(
            '변경할 날짜',
            style: TextStyle(
              color: _textPrimary,
              fontSize: 15,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 10),

          _buildDateSelector(),

          const SizedBox(height: 24),

          const Text(
            '변경할 시간',
            style: TextStyle(
              color: _textPrimary,
              fontSize: 15,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 10),

          if (_selectedDate == null)
            _buildSelectionGuide(
              icon: Icons.schedule_outlined,
              text: '변경할 날짜를 먼저 선택해주세요.',
            )
          else if (_selectedSlots.isEmpty)
            _buildSelectionGuide(
              icon: Icons.event_busy_outlined,
              text: '선택한 날짜에 예약 가능한 시간이 없습니다.',
            )
          else
            _buildTimeSelection(),

          const SizedBox(height: 24),

          const Text(
            '변경 사유',
            style: TextStyle(
              color: _textPrimary,
              fontSize: 15,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 10),

          TextField(
            controller: _reasonController,
            maxLength: 200,
            maxLines: 3,
            decoration: InputDecoration(
              hintText: '변경 사유를 입력해주세요.',
              filled: true,
              fillColor: _surface,
              counterText: '',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide.none,
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: _border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(
                  color: _primaryBlue,
                  width: 1.4,
                ),
              ),
            ),
          ),

          const SizedBox(height: 24),

          SizedBox(
            width: double.infinity,
            height: 52,
            child: FilledButton(
              onPressed: _submitting || _selectedSlot == null ? null : _submit,
              style: FilledButton.styleFrom(
                backgroundColor: _strongBlue,
                foregroundColor: Colors.white,
                disabledBackgroundColor: const Color(0xFFD9E5F2),
                disabledForegroundColor: const Color(0xFF9AA8B8),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: _submitting
                  ? const SizedBox(
                      width: 21,
                      height: 21,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text(
                      '변경 요청하기',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
            ),
          ),

          const SizedBox(height: 10),

          const Center(
            child: Text(
              '요청 후 원무과 확인 시 예약이 변경됩니다.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: _textSecondary,
                fontSize: 11,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCurrentAppointmentNotice() {
    final current = widget.appointment.scheduledAt.toLocal();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      decoration: BoxDecoration(
        color: const Color(0xFFF7FAFF),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFDCEBFF)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.event_note_rounded,
            size: 19,
            color: _strongBlue,
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '현재 예약',
                  style: TextStyle(
                    color: _textSecondary,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '${current.year}년 ${current.month}월 ${current.day}일 '
                  '(${_weekday(current)}) · ${_slotTime(current)}',
                  style: const TextStyle(
                    color: _textPrimary,
                    fontSize: 13,
                    height: 1.4,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDateSelector() {
    final selectedDate = _selectedDate;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: _submitting ? null : _openCalendar,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            color: selectedDate == null
                ? Colors.white
                : const Color(0xFFF7FBFF),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selectedDate == null
                  ? const Color(0xFFDDE6EF)
                  : const Color(0xFFB9DBFF),
              width: selectedDate == null ? 1 : 1.2,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: const Color(0xFFEAF5FF),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: const Icon(
                  Icons.calendar_month_rounded,
                  size: 20,
                  color: _strongBlue,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: selectedDate == null
                    ? const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '날짜를 선택해주세요.',
                            style: TextStyle(
                              color: _textPrimary,
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          SizedBox(height: 3),
                          Text(
                            '예약 가능한 날짜만 선택할 수 있어요.',
                            style: TextStyle(
                              color: _textSecondary,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            '선택한 날짜',
                            style: TextStyle(
                              color: _textSecondary,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            '${selectedDate.year}년 '
                            '${selectedDate.month}월 '
                            '${selectedDate.day}일 '
                            '(${_weekday(selectedDate)})',
                            style: const TextStyle(
                              color: _textPrimary,
                              fontSize: 14,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
              ),
              const SizedBox(width: 8),
              const Icon(
                Icons.chevron_right_rounded,
                color: Color(0xFF9AA8B8),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSelectionGuide({
    required IconData icon,
    required String text,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE6EDF5)),
      ),
      child: Row(
        children: [
          Icon(
            icon,
            size: 20,
            color: const Color(0xFFA8B3C1),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 13,
                color: Color(0xFF8B95A1),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTimeSelection() {
    final slots = [..._selectedAllSlots]
      ..sort(
        (a, b) => _koreaTime(
          a.startAt,
        ).compareTo(
          _koreaTime(b.startAt),
        ),
      );

    final morningSlots = slots.where((slot) {
      return _koreaTime(slot.startAt).hour < 12;
    }).toList();

    final afternoonSlots = slots.where((slot) {
      return _koreaTime(slot.startAt).hour >= 12;
    }).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (morningSlots.isNotEmpty) ...[
          _buildTimePeriodTitle(
            icon: Icons.wb_sunny_outlined,
            title: '오전',
          ),
          const SizedBox(height: 10),
          _buildTimeGrid(morningSlots),
        ],

        if (morningSlots.isNotEmpty && afternoonSlots.isNotEmpty)
          const SizedBox(height: 22),

        if (afternoonSlots.isNotEmpty) ...[
          _buildTimePeriodTitle(
            icon: Icons.wb_twilight_outlined,
            title: '오후',
          ),
          const SizedBox(height: 10),
          _buildTimeGrid(afternoonSlots),
        ],
      ],
    );
  }

  Widget _buildTimePeriodTitle({
    required IconData icon,
    required String title,
  }) {
    return Row(
      children: [
        Icon(
          icon,
          size: 17,
          color: _strongBlue,
        ),
        const SizedBox(width: 6),
        Text(
          title,
          style: const TextStyle(
            color: _textPrimary,
            fontSize: 14,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }

  Widget _buildTimeGrid(
    List<AppointmentAvailabilitySlot> slots,
  ) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: slots.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 4,
        crossAxisSpacing: 8,
        mainAxisSpacing: 10,
        childAspectRatio: 1.65,
      ),
      itemBuilder: (context, index) {
        final slot = slots[index];
        final available = slot.isAvailable;

        final selected =
            available &&
            _selectedSlot != null &&
            _selectedSlot!.isAtSameMomentAs(slot.startAt);

        return InkWell(
          onTap: !available || _submitting
              ? null
              : () {
                  setState(() {
                    _selectedSlot = slot.startAt;
                  });
                },
          borderRadius: BorderRadius.circular(10),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 140),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: !available
                  ? const Color(0xFFF1F3F5)
                  : selected
                  ? const Color(0xFFEAF5FF)
                  : const Color(0xFFFBFAFF),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: !available
                    ? const Color(0xFFE1E5EA)
                    : selected
                    ? _strongBlue
                    : const Color(0xFFDCD9E7),
                width: selected ? 1.4 : 1,
              ),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  _slotTimeOnly(slot.startAt),
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: selected
                        ? FontWeight.w800
                        : FontWeight.w600,
                    color: !available
                        ? const Color(0xFFA6ADB7)
                        : selected
                        ? _strongBlue
                        : const Color(0xFF4E5968),
                  ),
                ),
                if (!available) ...[
                  const SizedBox(height: 1),
                  const Text(
                    '마감',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF9CA3AF),
                    ),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }


  Future<void> _submit() async {
    final slot = _selectedSlot;

    if (slot == null || _submitting) {
      return;
    }

    final reason = _reasonController.text.trim();

    setState(() {
      _submitting = true;
    });

    try {
      final updatedAppointment = await widget.service.requestChange(
        appointmentId: widget.appointment.id,
        newScheduledAt: slot,
        reason: reason.isEmpty ? '환자 요청' : reason,
      );

      if (!mounted) {
        return;
      }

      Navigator.of(context).pop(updatedAppointment);
    } catch (_) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('예약 변경 요청에 실패했습니다.')));
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
  }

  DateTime _dateOnly(DateTime date) {
    final local = date.toLocal();

    return DateTime(local.year, local.month, local.day);
  }

  bool _sameDate(DateTime first, DateTime second) {
    final a = first.toLocal();
    final b = second.toLocal();

    return a.year == b.year && a.month == b.month && a.day == b.day;
  }

  String _weekday(DateTime date) {
    const days = ['월', '화', '수', '목', '금', '토', '일'];

    return days[date.toLocal().weekday - 1];
  }

  DateTime _koreaTime(DateTime date) {
    return date.toUtc().add(const Duration(hours: 9));
  }

  String _slotTime(DateTime slot) {
    final koreaTime = _koreaTime(slot);

    final period = koreaTime.hour < 12 ? '오전' : '오후';

    final hour = koreaTime.hour == 0
        ? 12
        : koreaTime.hour > 12
        ? koreaTime.hour - 12
        : koreaTime.hour;

    return '$period $hour:'
        '${koreaTime.minute.toString().padLeft(2, '0')}';
  }

  String _slotTimeOnly(DateTime slot) {
    final koreaTime = _koreaTime(slot);

    final hour = koreaTime.hour == 0
        ? 12
        : koreaTime.hour > 12
        ? koreaTime.hour - 12
        : koreaTime.hour;

    return '${hour.toString().padLeft(2, '0')}:'
        '${koreaTime.minute.toString().padLeft(2, '0')}';
  }
}


enum _ChangeDateStatus { available, closed, full, outside }

class _ChangeCalendarWeekday extends StatelessWidget {
  final String text;
  final Color color;

  const _ChangeCalendarWeekday(
    this.text, {
    this.color = const Color(0xFF7B8798),
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Center(
        child: Text(
          text,
          style: TextStyle(
            color: color,
            fontSize: 11,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class _ChangeCalendarLegend extends StatelessWidget {
  final Color color;
  final String text;

  const _ChangeCalendarLegend({
    required this.color,
    required this.text,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 5),
        Text(
          text,
          style: const TextStyle(
            color: Color(0xFF6B7684),
            fontSize: 10.5,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _StatusStyle {
  final Color foreground;
  final Color background;

  const _StatusStyle({required this.foreground, required this.background});
}
