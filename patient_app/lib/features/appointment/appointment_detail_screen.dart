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
    return _localCancellationRequested ||
        _appointment.cancellationRequestedAt != null;
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
        !_localChangeRequested &&
        _appointment.doctorId != null;
  }

  bool get _canRequestCancellation {
    return !_isFinished &&
        _isFutureAppointment &&
        !_isCancellationRequested &&
        !_localChangeRequested;
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
              ] else if (_localChangeRequested) ...[
                const SizedBox(height: 18),
                _buildRequestNotice(
                  icon: Icons.schedule_rounded,
                  text: '예약 변경 요청이 접수되었습니다.\n원무과 확인 후 일정이 변경됩니다.',
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

    final requested = await showModalBottomSheet<bool>(
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

    if (!mounted || requested != true) {
      return;
    }

    setState(() {
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
      return '취소 요청됨';
    }

    if (_localChangeRequested) {
      return '변경 요청됨';
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

    if (_localChangeRequested ||
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

      final availableDates =
          availability.dates.where((item) => item.slots.isNotEmpty).toList()
            ..sort((a, b) => a.date.compareTo(b.date));

      setState(() {
        _availability = availability;

        if (availableDates.isNotEmpty) {
          _selectedDate = availableDates.first.date;
        }

        _loading = false;
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

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.82,
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
          child: Text(
            _errorMessage!,
            textAlign: TextAlign.center,
            style: const TextStyle(color: _textSecondary, fontSize: 14),
          ),
        ),
      );
    }

    if (_availableDates.isEmpty) {
      return const Center(
        child: Text(
          '변경 가능한 예약 시간이 없습니다.',
          style: TextStyle(color: _textSecondary),
        ),
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '변경할 날짜',
            style: TextStyle(
              color: _textPrimary,
              fontSize: 15,
              fontWeight: FontWeight.w800,
            ),
          ),

          const SizedBox(height: 12),

          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _availableDates.map((item) {
              final selected =
                  _selectedDate != null && _sameDate(item.date, _selectedDate!);

              return ChoiceChip(
                label: Text(
                  '${item.date.month}/${item.date.day} '
                  '(${_weekday(item.date)})',
                ),
                selected: selected,
                selectedColor: const Color(0xFFEAF5FF),
                backgroundColor: Colors.white,
                side: BorderSide(
                  color: selected ? _strongBlue : const Color(0xFFDDE6EF),
                ),
                labelStyle: TextStyle(
                  color: selected ? _strongBlue : const Color(0xFF596A7E),
                  fontWeight: FontWeight.w600,
                ),
                onSelected: (_) {
                  setState(() {
                    _selectedDate = item.date;
                    _selectedSlot = null;
                  });
                },
              );
            }).toList(),
          ),

          const SizedBox(height: 24),

          const Text(
            '변경할 시간',
            style: TextStyle(
              color: _textPrimary,
              fontSize: 15,
              fontWeight: FontWeight.w800,
            ),
          ),

          const SizedBox(height: 12),

          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _selectedSlots.map((slot) {
              final selected = _selectedSlot == slot;

              return ChoiceChip(
                label: Text(_slotTime(slot)),
                selected: selected,
                selectedColor: const Color(0xFFEAF5FF),
                backgroundColor: Colors.white,
                side: BorderSide(
                  color: selected ? _strongBlue : const Color(0xFFDDE6EF),
                ),
                labelStyle: TextStyle(
                  color: selected ? _strongBlue : const Color(0xFF596A7E),
                  fontWeight: FontWeight.w700,
                ),
                onSelected: (_) {
                  setState(() {
                    _selectedSlot = slot;
                  });
                },
              );
            }).toList(),
          ),

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
              fillColor: const Color(0xFFF8FAFC),
              counterText: '',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide.none,
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Color(0xFFE4EBF2)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: _primaryBlue, width: 1.4),
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
              style: TextStyle(color: _textSecondary, fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _submit() async {
    final slot = _selectedSlot;

    if (slot == null) {
      return;
    }

    final reason = _reasonController.text.trim();

    setState(() {
      _submitting = true;
    });

    try {
      await widget.service.requestChange(
        appointmentId: widget.appointment.id,
        newScheduledAt: slot,
        reason: reason.isEmpty ? '환자 요청' : reason,
      );

      if (!mounted) {
        return;
      }

      Navigator.of(context).pop(true);
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

  String _slotTime(DateTime slot) {
    final local = slot.toLocal();

    final period = local.hour < 12 ? '오전' : '오후';

    final hour = local.hour == 0
        ? 12
        : local.hour > 12
        ? local.hour - 12
        : local.hour;

    return '$period $hour:'
        '${local.minute.toString().padLeft(2, '0')}';
  }
}

class _StatusStyle {
  final Color foreground;
  final Color background;

  const _StatusStyle({required this.foreground, required this.background});
}
