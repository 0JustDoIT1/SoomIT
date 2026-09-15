import 'package:flutter/material.dart';

import 'models/appointment.dart';
import 'services/appointment_service.dart';

class AppointmentDetailScreen extends StatefulWidget {
  final Appointment appointment;

  const AppointmentDetailScreen({
    super.key,
    required this.appointment,
  });

  @override
  State<AppointmentDetailScreen> createState() =>
      _AppointmentDetailScreenState();
}

class _AppointmentDetailScreenState
    extends State<AppointmentDetailScreen> {
  final AppointmentService _appointmentService = AppointmentService();

  late Appointment _appointment;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _appointment = widget.appointment;
  }

  bool get _isCancellationRequested =>
      _appointment.cancellationRequestedAt != null;

  bool get _hasPendingRequest =>
      _appointment.pendingRequest?.status == 'PENDING';

  bool get _isPendingChangeRequest =>
      _appointment.pendingRequest?.requestType == 'CHANGE';

  bool get _isEligibleForCancellation {
    return _appointment.appointmentStatus != 'CANCELLED' &&
        !_isCancellationRequested &&
        _appointment.visitStatus == 'SCHEDULED';
  }

  bool get _isEligibleForChange {
    return _appointment.appointmentStatus != 'CANCELLED' &&
        !_isCancellationRequested &&
        _appointment.visitStatus == 'SCHEDULED' &&
        _appointment.createdByType == 'PATIENT';
  }

  bool get _canRequestCancellation =>
      _isEligibleForCancellation && !_hasPendingRequest;

  bool get _canRequestChange => _isEligibleForChange && !_hasPendingRequest;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F9FC),
      appBar: AppBar(
        title: const Text(
          '예약 상세',
          style: TextStyle(
            fontWeight: FontWeight.w700,
          ),
        ),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF191F28),
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildStatusCard(),
            const SizedBox(height: 20),
            _buildInfoCard(),
            const SizedBox(height: 24),

            if (_hasPendingRequest)
              ...[
                _buildPendingRequestCard(),
                const SizedBox(height: 12),
                if (_isEligibleForChange) _buildChangeButton(),
                if (_isEligibleForChange && _isEligibleForCancellation)
                  const SizedBox(height: 12),
                if (_isEligibleForCancellation) _buildCancelButton(),
              ]
            else if (_isCancellationRequested)
              _buildCancellationRequestedCard()
            else ...[
              if (_canRequestChange) _buildChangeButton(),

              if (_canRequestChange && _canRequestCancellation)
                const SizedBox(height: 12),

              if (_canRequestCancellation) _buildCancelButton(),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildStatusCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: const Color(0xFFE9EDF2),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '예약 상태',
            style: TextStyle(
              fontSize: 13,
              color: Color(0xFF8B95A1),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _hasPendingRequest
                ? _isPendingChangeRequest
                    ? '예약 변경 요청 처리중'
                    : '예약 취소 요청 처리중'
                : _isCancellationRequested
                    ? '취소 요청됨'
                : _appointment.appointmentStatusLabel,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: _hasPendingRequest || _isCancellationRequested
                  ? const Color(0xFFF04452)
                  : const Color(0xFF2B66F6),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: const Color(0xFFE9EDF2),
        ),
      ),
      child: Column(
        children: [
          _buildInfoRow(
            '병원',
            _appointment.hospitalName,
          ),
          _buildDivider(),
          _buildInfoRow(
            '진료 종류',
            _appointment.displayType,
          ),
          _buildDivider(),
          _buildInfoRow(
            '의사',
            _appointment.doctorName ?? '담당 의료진 미지정',
          ),
          _buildDivider(),
          _buildInfoRow(
            '날짜',
            _formatDate(_appointment.scheduledAt),
          ),
          _buildDivider(),
          _buildInfoRow(
            '시간',
            _formatTime(_appointment.scheduledAt),
          ),
        ],
      ),
    );
  }

  Widget _buildCancellationRequestedCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF4F5),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: const Color(0xFFFFD7DB),
        ),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.info_outline,
            color: Color(0xFFF04452),
          ),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              '예약 취소 요청이 접수되었습니다.\n원무과 확인 후 최종 취소됩니다.',
              style: TextStyle(
                fontSize: 14,
                height: 1.5,
                fontWeight: FontWeight.w600,
                color: Color(0xFFB4232D),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPendingRequestCard() {
    final request = _appointment.pendingRequest!;
    final requestTypeLabel = _isPendingChangeRequest ? '예약 변경 요청' : '예약 취소 요청';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF8E8),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: const Color(0xFFF4D68A),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$requestTypeLabel 처리중',
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: Color(0xFF8A5A00),
            ),
          ),
          if (request.requestedScheduledAt != null) ...[
            const SizedBox(height: 8),
            Text('희망 예약일시: ${_formatDate(request.requestedScheduledAt!)} ${_formatTime(request.requestedScheduledAt!)}'),
          ],
          const SizedBox(height: 6),
          Text('요청일시: ${_formatDate(request.requestedAt)} ${_formatTime(request.requestedAt)}'),
          if (request.reason != null && request.reason!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text('요청 사유: ${request.reason}'),
          ],
        ],
      ),
    );
  }

  Widget _buildChangeButton() {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton(
        onPressed: _isSubmitting || _hasPendingRequest
            ? null
            : _requestAppointmentChange,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF2B66F6),
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          elevation: 0,
        ),
        child: _isSubmitting
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : const Text(
                '예약 변경 요청',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
      ),
    );
  }

  Widget _buildCancelButton() {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: OutlinedButton(
        onPressed: _isSubmitting || _hasPendingRequest
            ? null
            : _showCancellationConfirmDialog,
        style: OutlinedButton.styleFrom(
          foregroundColor: const Color(0xFFF04452),
          side: const BorderSide(
            color: Color(0xFFF04452),
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: _isSubmitting
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                ),
              )
            : const Text(
                '예약 취소 요청',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
      ),
    );
  }

  Future<void> _requestAppointmentChange() async {
    final now = DateTime.now();

    final selectedDate = await showDatePicker(
      context: context,
      initialDate: now.add(
        const Duration(days: 1),
      ),
      firstDate: now,
      lastDate: now.add(
        const Duration(days: 365),
      ),
    );

    if (selectedDate == null || !mounted) {
      return;
    }

    final selectedTime = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(
        _appointment.scheduledAt,
      ),
    );

    if (selectedTime == null || !mounted) {
      return;
    }

    final newScheduledAt = DateTime(
      selectedDate.year,
      selectedDate.month,
      selectedDate.day,
      selectedTime.hour,
      selectedTime.minute,
    );

    if (!newScheduledAt.isAfter(now)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('현재 시간 이후의 예약 시간을 선택해주세요.'),
        ),
      );
      return;
    }

    final reason = await _showRequestReasonDialog(
      title: '예약 변경 요청 사유',
      hintText: '변경 요청 사유를 입력해 주세요.',
    );

    if (reason == null || !mounted) {
      return;
    }

    setState(() {
      _isSubmitting = true;
    });

    try {
      await _appointmentService.requestChange(
        appointmentId: _appointment.id,
        newScheduledAt: newScheduledAt,
        reason: reason,
      );

      final updatedAppointment = await _appointmentService.getAppointment(
        _appointment.id,
      );

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('예약 변경 요청이 접수되었습니다.'),
        ),
      );

      setState(() {
        _appointment = updatedAppointment;
      });
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('예약 변경 요청 중 오류가 발생했습니다.'),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  Future<void> _showCancellationConfirmDialog() async {
    final reason = await _showRequestReasonDialog(
      title: '예약 취소 요청 사유',
      hintText: '취소 요청 사유를 입력해 주세요.',
    );

    if (reason == null || !mounted) {
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('예약 취소 요청'),
          content: const Text(
            '예약 취소를 요청하시겠습니까?\n'
            '요청 후 원무과 확인을 거쳐 최종 취소됩니다.',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext, false);
              },
              child: const Text('아니요'),
            ),
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext, true);
              },
              child: const Text(
                '취소 요청',
                style: TextStyle(
                  color: Color(0xFFF04452),
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        );
      },
    );

    if (confirmed != true) {
      return;
    }

    await _requestCancellation(reason);
  }

  Future<void> _requestCancellation(String cancellationReason) async {
    setState(() {
      _isSubmitting = true;
    });

    try {
      await _appointmentService.requestCancellation(
        appointmentId: _appointment.id,
        cancellationReason: cancellationReason,
      );

      final updatedAppointment = await _appointmentService.getAppointment(
        _appointment.id,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _appointment = updatedAppointment;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('예약 취소 요청이 접수되었습니다.'),
        ),
      );
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('예약 취소 요청 중 오류가 발생했습니다.'),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  Future<String?> _showRequestReasonDialog({
    required String title,
    required String hintText,
  }) async {
    final controller = TextEditingController();

    final reason = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: Text(title),
              content: TextField(
                controller: controller,
                autofocus: true,
                maxLength: 1000,
                maxLines: 3,
                decoration: InputDecoration(
                  hintText: hintText,
                ),
                onChanged: (_) => setDialogState(() {}),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(dialogContext),
                  child: const Text('취소'),
                ),
                TextButton(
                  onPressed: controller.text.trim().isEmpty
                      ? null
                      : () => Navigator.pop(
                            dialogContext,
                            controller.text.trim(),
                          ),
                  child: const Text('확인'),
                ),
              ],
            );
          },
        );
      },
    );

    controller.dispose();
    return reason;
  }

  Widget _buildInfoRow(
    String label,
    String value,
  ) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        vertical: 4,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 90,
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 13,
                color: Color(0xFF8B95A1),
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Color(0xFF191F28),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDivider() {
    return const Padding(
      padding: EdgeInsets.symmetric(
        vertical: 14,
      ),
      child: Divider(
        height: 1,
        color: Color(0xFFE9EDF2),
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.year}년 ${date.month}월 ${date.day}일';
  }

  String _formatTime(DateTime date) {
    final period = date.hour < 12 ? '오전' : '오후';

    final hour = date.hour == 0
        ? 12
        : date.hour > 12
            ? date.hour - 12
            : date.hour;

    final minute = date.minute.toString().padLeft(2, '0');

    return '$period $hour:$minute';
  }
}
