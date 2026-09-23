import 'package:flutter/material.dart';

import 'models/appointment.dart';
import 'services/appointment_service.dart';
import 'appointment_detail_screen.dart';
import 'appointment_request_sheet.dart';

class AppointmentScreen extends StatefulWidget {
  const AppointmentScreen({super.key});

  @override
  State<AppointmentScreen> createState() => _AppointmentScreenState();
}

class _AppointmentScreenState extends State<AppointmentScreen> {
  final AppointmentService _appointmentService = AppointmentService();

  late Future<List<Appointment>> _appointmentsFuture;

  int _selectedTab = 0;
  _AppointmentFilter _selectedFilter = _AppointmentFilter.all;

  static const Color _primary = Color(0xFF2F8DFE);
  static const Color _background = Color(0xFFF5F9FD);
  static const Color _textPrimary = Color(0xFF191F28);
  static const Color _textSecondary = Color(0xFF4E5968);
  static const Color _textMuted = Color(0xFF8B95A1);
  static const Color _border = Color(0xFFE8EEF5);

  @override
  void initState() {
    super.initState();
    _loadAppointments();
  }

  void _loadAppointments() {
    _appointmentsFuture = _appointmentService.getAppointments();
  }

  void _retry() {
    setState(_loadAppointments);
  }

  Future<void> _refreshAppointments() async {
    setState(_loadAppointments);
    await _appointmentsFuture;
  }

  Future<void> _handleAppointmentCreated() async {
    setState(() {
      _loadAppointments();
      _selectedTab = 1;
      _selectedFilter = _AppointmentFilter.all;
    });

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('예약 요청이 완료되었습니다.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        children: [
          _buildTopHeader(),
          _buildMainTabs(),
          Expanded(
            child: Container(
              width: double.infinity,
              color: _selectedTab == 0 ? Colors.white : _background,
              child: IndexedStack(
                index: _selectedTab,
                children: [
                  _buildReservationTab(),
                  _buildHistoryTab(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTopHeader() {
    return Container(
      width: double.infinity,
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '진료 예약',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: _textPrimary,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            _selectedTab == 0
                ? '예약 가능한 날짜와 시간을 선택해주세요.'
                : '예약 현황과 지난 예약을 확인해보세요.',
            style: const TextStyle(
              fontSize: 13,
              height: 1.4,
              color: _textMuted,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMainTabs() {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: _border)),
      ),
      child: Row(
        children: [
          _buildMainTab(index: 0, label: '예약하기'),
          _buildMainTab(index: 1, label: '예약 내역'),
        ],
      ),
    );
  }

  Widget _buildMainTab({required int index, required String label}) {
    final selected = _selectedTab == index;

    return Expanded(
      child: InkWell(
        onTap: () {
          if (_selectedTab == index) return;
          setState(() {
            _selectedTab = index;
          });
        },
        child: Column(
          children: [
            const SizedBox(height: 4),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 11),
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                  color: selected ? _primary : _textMuted,
                ),
              ),
            ),
            AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              width: 82,
              height: 3,
              decoration: BoxDecoration(
                color: selected ? _primary : Colors.transparent,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildReservationTab() {
    return AppointmentRequestSheet(
      embedded: true,
      onCreated: _handleAppointmentCreated,
    );
  }

  Widget _buildHistoryTab() {
    return FutureBuilder<List<Appointment>>(
      future: _appointmentsFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(
            child: CircularProgressIndicator(color: _primary),
          );
        }

        if (snapshot.hasError) {
          return _buildErrorState();
        }

        final appointments = snapshot.data ?? <Appointment>[];
        return _buildHistoryContent(appointments);
      },
    );
  }

  Widget _buildHistoryContent(List<Appointment> appointments) {
    final sorted = [...appointments]
      ..sort((a, b) => a.scheduledAt.compareTo(b.scheduledAt));

    final upcomingCandidates = sorted.where(_isUpcomingAppointment).toList();
    final upcoming = upcomingCandidates.isEmpty ? null : upcomingCandidates.first;

    final listItems = sorted
        .where((appointment) => upcoming == null || appointment.id != upcoming.id)
        .toList()
        .reversed
        .where(_matchesSelectedFilter)
        .toList();

    return RefreshIndicator(
      color: _primary,
      onRefresh: _refreshAppointments,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 30),
        child: appointments.isEmpty
            ? _buildEmptyAppointmentsCard()
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.calendar_month_rounded,
                        size: 20,
                        color: _primary,
                      ),
                      const SizedBox(width: 8),
                      const Expanded(
                        child: Text(
                          '다가오는 예약',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                            color: _textPrimary,
                          ),
                        ),
                      ),
                      if (upcomingCandidates.isNotEmpty)
                        Text(
                          '${upcomingCandidates.length}건의 예약이 예정되어 있어요.',
                          style: const TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w500,
                            color: _textMuted,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 11),
                  if (upcoming != null)
                    _buildAppointmentCard(upcoming, emphasized: true)
                  else
                    _buildNoUpcomingAppointment(),
                  const SizedBox(height: 22),
                  _buildFilterRow(),
                  const SizedBox(height: 12),
                  if (listItems.isEmpty)
                    _buildNoFilteredAppointments()
                  else
                    ...listItems.map(
                      (appointment) => Padding(
                        padding: const EdgeInsets.only(bottom: 11),
                        child: _buildAppointmentCard(appointment),
                      ),
                    ),
                ],
              ),
      ),
    );
  }

  Widget _buildFilterRow() {
    return Row(
      children: [
        _buildFilterChip(_AppointmentFilter.all, '전체'),
        const SizedBox(width: 8),
        _buildFilterChip(_AppointmentFilter.pending, '요청중'),
        const SizedBox(width: 8),
        _buildFilterChip(_AppointmentFilter.past, '지난 예약'),
      ],
    );
  }

  Widget _buildFilterChip(_AppointmentFilter filter, String label) {
    final selected = _selectedFilter == filter;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () {
          setState(() {
            _selectedFilter = filter;
          });
        },
        borderRadius: BorderRadius.circular(999),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
          decoration: BoxDecoration(
            color: selected ? const Color(0xFFF0F7FF) : Colors.white,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: selected ? _primary : const Color(0xFFDCE4EC),
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
              color: selected ? _primary : _textSecondary,
            ),
          ),
        ),
      ),
    );
  }

  bool _matchesSelectedFilter(Appointment appointment) {
    switch (_selectedFilter) {
      case _AppointmentFilter.all:
        return true;
      case _AppointmentFilter.pending:
        return _isPendingAppointment(appointment);
      case _AppointmentFilter.past:
        return _isPastAppointment(appointment);
    }
  }

  bool _isPendingAppointment(Appointment appointment) {
    return appointment.appointmentStatus == 'REQUESTED' ||
        _hasPendingRequest(appointment, 'CHANGE') ||
        _hasPendingRequest(appointment, 'CANCEL') ||
        appointment.cancellationRequestedAt != null;
  }

  bool _isPastAppointment(Appointment appointment) {
    if (appointment.appointmentStatus == 'CANCELLED') return true;
    if (appointment.visitStatus == 'VISITED' ||
        appointment.visitStatus == 'COMPLETED' ||
        appointment.visitStatus == 'NO_SHOW') {
      return true;
    }

    // 처리 중인 변경/취소 요청은 시간이 지나도 '요청중'으로 유지합니다.
    if (_hasPendingRequest(appointment, 'CHANGE') ||
        _hasPendingRequest(appointment, 'CANCEL') ||
        appointment.cancellationRequestedAt != null) {
      return false;
    }

    return !appointment.scheduledAt.toLocal().isAfter(DateTime.now());
  }

  bool _isUpcomingAppointment(Appointment appointment) {
    if (appointment.appointmentStatus == 'CANCELLED') return false;
    if (appointment.visitStatus == 'VISITED' ||
        appointment.visitStatus == 'COMPLETED' ||
        appointment.visitStatus == 'NO_SHOW') {
      return false;
    }

    return appointment.scheduledAt.toLocal().isAfter(DateTime.now());
  }

  Widget _buildEmptyAppointmentsCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(24, 30, 24, 30),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _border),
      ),
      child: const Column(
        children: [
          _EmptyStateIcon(icon: Icons.calendar_month_rounded),
          SizedBox(height: 18),
          Text(
            '아직 예약 내역이 없어요.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: _textPrimary,
            ),
          ),
          SizedBox(height: 8),
          Text(
            '예약하기 탭에서 진료를 요청하면\n이곳에서 예약 현황을 확인할 수 있어요.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              height: 1.55,
              fontWeight: FontWeight.w500,
              color: _textMuted,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNoFilteredAppointments() {
    late final String title;
    late final String description;
    late final IconData icon;

    switch (_selectedFilter) {
      case _AppointmentFilter.all:
        title = '표시할 예약 내역이 없어요.';
        description = '새로운 예약 내역이 생기면\n이곳에서 확인할 수 있어요.';
        icon = Icons.event_note_rounded;
        break;
      case _AppointmentFilter.pending:
        title = '처리 중인 예약 요청이 없어요.';
        description = '예약 변경이나 취소 요청이 생기면\n이곳에서 진행 상태를 확인할 수 있어요.';
        icon = Icons.hourglass_empty_rounded;
        break;
      case _AppointmentFilter.past:
        title = '지난 예약 내역이 없어요.';
        description = '예약 시간이 지난 진료는\n이곳에 차례대로 표시돼요.';
        icon = Icons.history_rounded;
        break;
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(22, 26, 22, 26),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _border),
      ),
      child: Column(
        children: [
          _EmptyStateIcon(icon: icon, size: 58, iconSize: 27),
          const SizedBox(height: 15),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: _textPrimary,
            ),
          ),
          const SizedBox(height: 7),
          Text(
            description,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 12.5,
              height: 1.5,
              fontWeight: FontWeight.w500,
              color: _textMuted,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _openAppointmentDetail(Appointment appointment) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => AppointmentDetailScreen(appointment: appointment),
      ),
    );

    if (!mounted) return;
    setState(_loadAppointments);
  }

  Widget _buildAppointmentCard(
    Appointment appointment, {
    bool emphasized = false,
  }) {
    final status = _getDisplayStatus(appointment);
    final statusColor = _getStatusColor(appointment);
    final pendingChangeAt = _getPendingChangeScheduledAt(appointment);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => _openAppointmentDetail(appointment),
        borderRadius: BorderRadius.circular(18),
        child: Ink(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(15, 15, 12, 15),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: emphasized
                  ? _primary.withValues(alpha: 0.22)
                  : _border,
            ),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF6B83A5).withValues(alpha: 0.05),
                blurRadius: 16,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              _buildDateBox(appointment.scheduledAt.toLocal()),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            appointment.displayType,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: _textPrimary,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        _buildStatusBadge(status, statusColor),
                      ],
                    ),
                    const SizedBox(height: 5),
                    Text(
                      appointment.doctorName ?? '담당 의료진 미지정',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: _textSecondary,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        const Icon(
                          Icons.access_time_rounded,
                          size: 15,
                          color: _textMuted,
                        ),
                        const SizedBox(width: 5),
                        Text(
                          _formatTimeWithPeriod(appointment.scheduledAt.toLocal()),
                          style: const TextStyle(
                            fontSize: 12.5,
                            color: _textSecondary,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 5),
                    Row(
                      children: [
                        const Icon(
                          Icons.location_on_outlined,
                          size: 15,
                          color: _textMuted,
                        ),
                        const SizedBox(width: 5),
                        Expanded(
                          child: Text(
                            appointment.hospitalName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12.5,
                              color: _textSecondary,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (pendingChangeAt != null) ...[
                      const SizedBox(height: 8),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 9,
                          vertical: 7,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF0F7FF),
                          borderRadius: BorderRadius.circular(9),
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.edit_calendar_outlined,
                              size: 14,
                              color: _primary,
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                '변경 요청 → ${pendingChangeAt.month}/${pendingChangeAt.day} '
                                '${_formatTimeWithPeriod(pendingChangeAt)}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w700,
                                  color: _primary,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 5),
              const Icon(
                Icons.chevron_right_rounded,
                size: 22,
                color: Color(0xFFB0B8C1),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDateBox(DateTime date) {
    return Container(
      width: 58,
      height: 70,
      decoration: BoxDecoration(
        color: const Color(0xFFF0F7FF),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            '${date.month}월',
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: _textMuted,
            ),
          ),
          const SizedBox(height: 1),
          Text(
            '${date.day}',
            style: const TextStyle(
              fontSize: 22,
              height: 1.05,
              fontWeight: FontWeight.w900,
              color: _primary,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            '${_getDayOfWeek(date)}요일',
            style: const TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w600,
              color: _textMuted,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusBadge(String status, Color statusColor) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: statusColor.withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        status,
        style: TextStyle(
          fontSize: 10.5,
          fontWeight: FontWeight.w800,
          color: statusColor,
        ),
      ),
    );
  }

  Widget _buildNoUpcomingAppointment() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(22, 26, 22, 26),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _border),
      ),
      child: const Column(
        children: [
          _EmptyStateIcon(
            icon: Icons.event_available_rounded,
            size: 58,
            iconSize: 27,
          ),
          SizedBox(height: 15),
          Text(
            '다가오는 예약이 없어요.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: _textPrimary,
            ),
          ),
          SizedBox(height: 7),
          Text(
            '새로운 진료 예약이 확정되면\n이곳에서 일정을 확인할 수 있어요.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 12.5,
              height: 1.5,
              fontWeight: FontWeight.w500,
              color: _textMuted,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.error_outline_rounded,
              size: 48,
              color: _textMuted,
            ),
            const SizedBox(height: 14),
            const Text(
              '예약 정보를 불러오지 못했습니다.',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: _textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              '잠시 후 다시 시도해주세요.',
              style: TextStyle(fontSize: 13, color: _textMuted),
            ),
            const SizedBox(height: 18),
            OutlinedButton(
              onPressed: _retry,
              child: const Text('다시 시도'),
            ),
          ],
        ),
      ),
    );
  }

  bool _hasPendingRequest(Appointment appointment, String requestType) {
    final pending = appointment.pendingRequest;

    return pending != null &&
        pending.requestType.toUpperCase() == requestType &&
        pending.status.toUpperCase() == 'PENDING';
  }

  DateTime? _getPendingChangeScheduledAt(Appointment appointment) {
    if (!_hasPendingRequest(appointment, 'CHANGE')) return null;
    return appointment.pendingRequest?.requestedScheduledAt?.toLocal();
  }

  String _getDisplayStatus(Appointment appointment) {
    if (appointment.appointmentStatus == 'CANCELLED') {
      return '취소됨';
    }

    if (_hasPendingRequest(appointment, 'CANCEL') ||
        appointment.cancellationRequestedAt != null) {
      return '취소 요청중';
    }

    if (_hasPendingRequest(appointment, 'CHANGE')) {
      return '변경 요청중';
    }

    if (appointment.appointmentStatus == 'REQUESTED') {
      return '예약 요청중';
    }

    if (appointment.visitStatus == 'VISITED' ||
        appointment.visitStatus == 'COMPLETED') {
      return '방문 완료';
    }

    if (appointment.visitStatus == 'NO_SHOW') {
      return appointment.visitStatusLabel;
    }

    if (!appointment.scheduledAt.toLocal().isAfter(DateTime.now())) {
      return '지난 예약';
    }

    if (appointment.appointmentStatus == 'CONFIRMED') {
      return '확정됨';
    }

    return appointment.appointmentStatusLabel;
  }

  Color _getStatusColor(Appointment appointment) {
    if (appointment.appointmentStatus == 'CANCELLED') {
      return const Color(0xFFE5484D);
    }

    if (_hasPendingRequest(appointment, 'CANCEL') ||
        appointment.cancellationRequestedAt != null) {
      return const Color(0xFFF04452);
    }

    if (_hasPendingRequest(appointment, 'CHANGE')) {
      return _primary;
    }

    if (appointment.appointmentStatus == 'REQUESTED') {
      return _primary;
    }

    if (appointment.visitStatus == 'VISITED' ||
        appointment.visitStatus == 'COMPLETED') {
      return const Color(0xFF20A66A);
    }

    if (appointment.visitStatus == 'NO_SHOW' ||
        !appointment.scheduledAt.toLocal().isAfter(DateTime.now())) {
      return _textMuted;
    }

    return const Color(0xFF2B66F6);
  }
}

class _EmptyStateIcon extends StatelessWidget {
  final IconData icon;
  final double size;
  final double iconSize;

  const _EmptyStateIcon({
    required this.icon,
    this.size = 68,
    this.iconSize = 31,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        color: Color(0xFFEAF6FF),
        shape: BoxShape.circle,
      ),
      child: Icon(
        icon,
        size: iconSize,
        color: Color(0xFF35A9E8),
      ),
    );
  }
}

enum _AppointmentFilter { all, pending, past }

class ContainerPlaceholderIcon extends StatelessWidget {
  const ContainerPlaceholderIcon({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 38,
      height: 38,
      decoration: BoxDecoration(
        color: const Color(0xFFF0F7FF),
        borderRadius: BorderRadius.circular(11),
      ),
      child: const Icon(
        Icons.event_available_outlined,
        size: 20,
        color: Color(0xFF2F8DFE),
      ),
    );
  }
}

String _formatTime(DateTime date) {
  final hour = date.hour == 0
      ? 12
      : date.hour > 12
          ? date.hour - 12
          : date.hour;

  final minute = date.minute.toString().padLeft(2, '0');
  return '${hour.toString().padLeft(2, '0')}:$minute';
}

String _formatTimeWithPeriod(DateTime date) {
  final period = date.hour < 12 ? '오전' : '오후';
  return '$period ${_formatTime(date)}';
}

String _getDayOfWeek(DateTime date) {
  const days = ['월', '화', '수', '목', '금', '토', '일'];
  return days[date.weekday - 1];
}
