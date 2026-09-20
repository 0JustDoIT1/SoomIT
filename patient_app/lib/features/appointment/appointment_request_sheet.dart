import 'package:flutter/material.dart';

import 'models/appointment_availability.dart';
import 'models/appointment_doctor.dart';
import 'services/appointment_service.dart';

class AppointmentRequestSheet extends StatefulWidget {
  const AppointmentRequestSheet({super.key});

  @override
  State<AppointmentRequestSheet> createState() =>
      _AppointmentRequestSheetState();
}

class _AppointmentRequestSheetState extends State<AppointmentRequestSheet> {
  final AppointmentService _service = AppointmentService();

  static const Color _primary = Color(0xFF4DA8FF);
  static const Color _primaryDark = Color(0xFF2F8DFE);
  static const Color _primaryLight = Color(0xFFEAF5FF);

  static const Color _textPrimary = Color(0xFF191F28);
  static const Color _textSecondary = Color(0xFF6B7684);
  static const Color _border = Color(0xFFE2E8F0);
  static const Color _surface = Color(0xFFF8FBFF);

  List<AppointmentDoctor> _doctors = [];
  AppointmentDoctor? _selectedDoctor;

  AppointmentAvailability? _availability;

  DateTime? _selectedDate;
  DateTime? _selectedTime;

  late DateTime _weekStart;

  bool _loadingDoctors = true;
  bool _loadingAvailability = false;
  bool _submitting = false;
  bool _doctorListExpanded = false;

  String? _errorMessage;

  @override
  void initState() {
    super.initState();

    _weekStart = _startOfWeek(_dateOnly(_koreaNow()));

    _loadDoctors();
  }

  // =========================================================
  // 한국 시간 / 예약 정책
  // =========================================================

  DateTime _koreaNow() {
    return DateTime.now().toUtc().add(const Duration(hours: 9));
  }

  /// 예약 가능한 첫 날짜
  ///
  /// 18시 이전:
  ///   내일부터 가능
  ///
  /// 18시 이후:
  ///   모레부터 가능
  DateTime _firstBookableDate() {
    final now = _koreaNow();
    final today = _dateOnly(now);

    if (now.hour >= 18) {
      return today.add(const Duration(days: 2));
    }

    return today.add(const Duration(days: 1));
  }

  /// 예약 가능한 마지막 날짜
  ///
  /// 첫 예약 가능일을 포함하여 정확히 30일
  DateTime _lastBookableDate() {
    return _firstBookableDate().add(const Duration(days: 29));
  }

  bool _isAllowedByReservationPolicy(DateTime date) {
    final target = _dateOnly(date);
    final first = _firstBookableDate();
    final last = _lastBookableDate();

    return !target.isBefore(first) && !target.isAfter(last);
  }

  // =========================================================
  // 의료진 조회
  // =========================================================

  Future<void> _loadDoctors() async {
    try {
      final doctors = await _service.getAppointmentDoctors();

      if (!mounted) return;

      setState(() {
        _doctors = doctors;

        _selectedDoctor = null;

        _loadingDoctors = false;
      });

      if (_selectedDoctor != null) {
        await _loadAvailability();
      }
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _loadingDoctors = false;
        _errorMessage = '의료진 목록을 불러오지 못했습니다.';
      });
    }
  }

  // =========================================================
  // 예약 가능 일정 조회
  // =========================================================

  Future<void> _loadAvailability() async {
    final doctor = _selectedDoctor;

    if (doctor == null) return;

    final firstBookableDate = _firstBookableDate();

    final lastBookableDate = _lastBookableDate();

    setState(() {
      _loadingAvailability = true;

      _availability = null;

      _selectedDate = null;
      _selectedTime = null;

      _errorMessage = null;

      _weekStart = _startOfWeek(firstBookableDate);
    });

    try {
      final availability = await _service.getAppointmentAvailability(
        doctorId: doctor.id,

        // 예약 가능한 첫날부터
        start: firstBookableDate,

        // 정확히 30일까지
        end: lastBookableDate,
      );

      if (!mounted) return;

      setState(() {
        _availability = availability;

        _selectedDate = null;
        _selectedTime = null;

        // 첫 예약 가능 주 자동 표시
        _weekStart = _findClosestAvailableWeek(availability);

        _loadingAvailability = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _loadingAvailability = false;

        _errorMessage = '예약 가능 시간을 불러오지 못했습니다.';
      });
    }
  }

  // =========================================================
  // 가장 가까운 예약 가능 주
  // =========================================================

  DateTime _findClosestAvailableWeek(AppointmentAvailability availability) {
    final firstBookableDate = _firstBookableDate();

    final firstWeekStart = _startOfWeek(firstBookableDate);

    final availableDates =
        availability.dates
            .where(
              (item) =>
                  item.slots.isNotEmpty &&
                  _isAllowedByReservationPolicy(item.date),
            )
            .map((item) => _dateOnly(item.date))
            .toList()
          ..sort();

    if (availableDates.isEmpty) {
      return firstWeekStart;
    }

    final hasAvailableInFirstWeek = availableDates.any((date) {
      return _isSameDate(_startOfWeek(date), firstWeekStart);
    });

    if (hasAvailableInFirstWeek) {
      return firstWeekStart;
    }

    return _startOfWeek(availableDates.first);
  }

  // =========================================================
  // 달력
  // =========================================================

  Future<void> _openCalendar() async {
    final availability = _availability;

    if (availability == null) return;

    final firstDate = _firstBookableDate();

    final lastDate = _lastBookableDate();

    final availableDates =
        availability.dates
            .where((item) => item.slots.isNotEmpty)
            .map((item) => _dateOnly(item.date))
            .where(
              (date) => !date.isBefore(firstDate) && !date.isAfter(lastDate),
            )
            .toList()
          ..sort();

    if (availableDates.isEmpty) {
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('선택 가능한 예약일이 없습니다.')));

      return;
    }

    final currentSelected = _selectedDate;

    final initialDate =
        currentSelected != null &&
            availableDates.any((date) => _isSameDate(date, currentSelected))
        ? currentSelected
        : availableDates.first;

    final selected = await showDatePicker(
      context: context,

      initialDate: initialDate,

      firstDate: firstDate,
      lastDate: lastDate,

      selectableDayPredicate: (date) {
        return availableDates.any(
          (availableDate) => _isSameDate(availableDate, date),
        );
      },

      helpText: '예약 날짜 선택',
      cancelText: '취소',
      confirmText: '선택',

      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: _primary,
              onPrimary: Colors.white,
              surface: Colors.white,
              onSurface: _textPrimary,
            ),
          ),
          child: child!,
        );
      },
    );

    if (selected == null || !mounted) {
      return;
    }

    setState(() {
      _selectedDate = _dateOnly(selected);

      _selectedTime = null;

      _weekStart = _startOfWeek(selected);
    });
  }

  // =========================================================
  // 예약 요청
  // =========================================================

  Future<void> _submit() async {
    final doctor = _selectedDoctor;

    final selectedTime = _selectedTime;

    final selectedDate = _selectedDate;

    if (doctor == null ||
        selectedTime == null ||
        selectedDate == null ||
        _submitting) {
      return;
    }

    if (!_isAllowedByReservationPolicy(selectedDate)) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('선택한 날짜는 예약할 수 없습니다.')));

      return;
    }

    setState(() {
      _submitting = true;
    });

    try {
      await _service.requestAppointment(
        doctorId: doctor.id,
        scheduledAt: selectedTime,
      );

      if (!mounted) return;

      Navigator.pop(context, true);
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _submitting = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            '예약 요청에 실패했습니다. '
            '다른 시간을 선택해주세요.',
          ),
        ),
      );

      await _loadAvailability();
    }
  }

  // =========================================================
  // 화면
  // =========================================================

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 12, 20, 20 + bottomInset),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,

            crossAxisAlignment: CrossAxisAlignment.start,

            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0xFFD1D6DC),
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
              ),

              const SizedBox(height: 20),

              const Text(
                '진료 예약 요청',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: _textPrimary,
                ),
              ),

              const SizedBox(height: 6),

              const Text(
                '예약 가능한 날짜와 시간을 선택해주세요.',
                style: TextStyle(
                  fontSize: 14,
                  color: _textSecondary,
                  height: 1.45,
                ),
              ),

              const SizedBox(height: 12),

              _buildReservationPolicyNotice(),

              const SizedBox(height: 24),

              _buildDoctorSection(),

              const SizedBox(height: 26),

              _buildDateSection(),

              const SizedBox(height: 26),

              _buildTimeSection(),

              if (_errorMessage != null) ...[
                const SizedBox(height: 16),

                Text(
                  _errorMessage!,
                  style: const TextStyle(
                    color: Color(0xFFE5484D),
                    fontSize: 13,
                  ),
                ),
              ],

              const SizedBox(height: 28),

              _buildSubmitButton(),

              const SizedBox(height: 10),

              const Center(
                child: Text(
                  '요청 후 원무과 승인 시 예약이 확정됩니다.',
                  style: TextStyle(fontSize: 12, color: Color(0xFF8B95A1)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // =========================================================
  // 예약 안내
  // =========================================================

  Widget _buildReservationPolicyNotice() {
    return Container(
      width: double.infinity,

      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),

      decoration: BoxDecoration(
        color: _surface,

        borderRadius: BorderRadius.circular(14),

        border: Border.all(color: const Color(0xFFDDEEFF)),
      ),

      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,

        children: [
          Icon(Icons.info_outline_rounded, size: 18, color: _primary),

          SizedBox(width: 8),

          Expanded(
            child: Text(
              '당일 예약은 불가능하며, '
              '다음 날 예약은 전날 오후 6시까지 신청할 수 있습니다.',
              style: TextStyle(
                fontSize: 12,
                height: 1.45,
                color: _textSecondary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // =========================================================
  // 1. 담당 의료진
  // =========================================================

  Widget _buildDoctorSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildStepTitle(number: 1, title: '담당 의료진'),
        const SizedBox(height: 10),
        if (_loadingDoctors)
          const Center(child: CircularProgressIndicator(color: _primary))
        else if (_doctors.isEmpty)
          const Text(
            '예약 가능한 의료진이 없습니다.',
            style: TextStyle(color: Color(0xFF8B95A1)),
          )
        else ...[
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () {
                setState(() {
                  _doctorListExpanded = !_doctorListExpanded;
                });
              },
              borderRadius: BorderRadius.circular(14),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: _doctorListExpanded
                        ? _primary
                        : const Color(0xFFE2E8F0),
                    width: _doctorListExpanded ? 1.4 : 1,
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: const BoxDecoration(
                        color: _primaryLight,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.medical_services_outlined,
                        size: 20,
                        color: _primaryDark,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _selectedDoctor?.displayName ?? '의료진을 선택해주세요',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: _selectedDoctor == null
                                  ? FontWeight.w500
                                  : FontWeight.w700,
                              color: _selectedDoctor == null
                                  ? const Color(0xFF9CA3AF)
                                  : _textPrimary,
                            ),
                          ),
                          if (_selectedDoctor != null) ...[
                            const SizedBox(height: 3),
                            const Text(
                              '선택된 담당 의료진',
                              style: TextStyle(
                                fontSize: 11,
                                color: _textSecondary,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    AnimatedRotation(
                      turns: _doctorListExpanded ? 0.5 : 0,
                      duration: const Duration(milliseconds: 180),
                      child: const Icon(
                        Icons.keyboard_arrow_down_rounded,
                        color: _textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          ClipRect(
            child: AnimatedSize(
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOutCubic,
              child: _doctorListExpanded
                  ? Container(
                      margin: const EdgeInsets.only(top: 8),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFFE2E8F0)),
                        boxShadow: const [
                          BoxShadow(
                            color: Color(0x0A000000),
                            blurRadius: 12,
                            offset: Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Column(
                        children: List.generate(_doctors.length, (index) {
                          final doctor = _doctors[index];
                          final selected = _selectedDoctor?.id == doctor.id;
                          final isLast = index == _doctors.length - 1;

                          return Column(
                            children: [
                              Material(
                                color: Colors.transparent,
                                child: InkWell(
                                  onTap: () async {
                                    setState(() {
                                      _selectedDoctor = doctor;
                                      _doctorListExpanded = false;
                                    });

                                    await _loadAvailability();
                                  },
                                  borderRadius: BorderRadius.vertical(
                                    top: index == 0
                                        ? const Radius.circular(14)
                                        : Radius.zero,
                                    bottom: isLast
                                        ? const Radius.circular(14)
                                        : Radius.zero,
                                  ),
                                  child: Container(
                                    width: double.infinity,
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 14,
                                      vertical: 13,
                                    ),
                                    decoration: BoxDecoration(
                                      color: selected
                                          ? _primaryLight
                                          : Colors.transparent,
                                      borderRadius: BorderRadius.vertical(
                                        top: index == 0
                                            ? const Radius.circular(14)
                                            : Radius.zero,
                                        bottom: isLast
                                            ? const Radius.circular(14)
                                            : Radius.zero,
                                      ),
                                    ),
                                    child: Row(
                                      children: [
                                        Container(
                                          width: 36,
                                          height: 36,
                                          decoration: BoxDecoration(
                                            color: selected
                                                ? Colors.white
                                                : const Color(0xFFF5F9FD),
                                            shape: BoxShape.circle,
                                          ),
                                          child: Icon(
                                            Icons.person_outline_rounded,
                                            size: 19,
                                            color: selected
                                                ? _primaryDark
                                                : _textSecondary,
                                          ),
                                        ),
                                        const SizedBox(width: 11),
                                        Expanded(
                                          child: Text(
                                            doctor.displayName,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(
                                              fontSize: 15,
                                              fontWeight: selected
                                                  ? FontWeight.w700
                                                  : FontWeight.w500,
                                              color: _textPrimary,
                                            ),
                                          ),
                                        ),
                                        if (selected)
                                          const Icon(
                                            Icons.check_circle_rounded,
                                            size: 21,
                                            color: _primaryDark,
                                          ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                              if (!isLast)
                                const Divider(
                                  height: 1,
                                  thickness: 1,
                                  indent: 61,
                                  color: Color(0xFFF0F3F6),
                                ),
                            ],
                          );
                        }),
                      ),
                    )
                  : const SizedBox.shrink(),
            ),
          ),
        ],
      ],
    );
  }

  // =========================================================
  // 2. 예약 날짜
  // =========================================================

  Widget _buildDateSection() {
    final availability = _availability;

    if (_selectedDoctor == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildStepTitle(number: 2, title: '예약 날짜'),
          const SizedBox(height: 10),
          _buildSelectionGuide(
            icon: Icons.calendar_month_outlined,
            text: '담당 의료진을 먼저 선택해주세요.',
          ),
        ],
      );
    }

    final weekDates = List.generate(
      7,
      (index) => _weekStart.add(Duration(days: index)),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,

      children: [
        Row(
          children: [
            Expanded(child: _buildStepTitle(number: 2, title: '예약 날짜')),

            TextButton.icon(
              onPressed: availability == null || _loadingAvailability
                  ? null
                  : _openCalendar,

              style: TextButton.styleFrom(
                foregroundColor: _primaryDark,

                padding: const EdgeInsets.symmetric(horizontal: 6),
              ),

              icon: const Icon(Icons.calendar_month_rounded, size: 18),

              label: const Text(
                '달력',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),

        const SizedBox(height: 10),

        if (_loadingAvailability)
          const Center(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 18),
              child: CircularProgressIndicator(color: _primary),
            ),
          )
        else ...[
          _buildWeekNavigation(),

          const SizedBox(height: 12),

          Row(
            children: [
              for (int i = 0; i < weekDates.length; i++) ...[
                Expanded(child: _buildDateCell(weekDates[i])),

                if (i != weekDates.length - 1) const SizedBox(width: 5),
              ],
            ],
          ),

          const SizedBox(height: 10),

          _buildDateLegend(),

          // 선택 날짜
          if (_selectedDate != null) ...[
            const SizedBox(height: 14),

            Container(
              width: double.infinity,

              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),

              decoration: BoxDecoration(
                color: const Color(0xFFF7FAFF),

                borderRadius: BorderRadius.circular(14),

                border: Border.all(color: const Color(0xFFDCEBFF)),
              ),

              child: Row(
                children: [
                  const Icon(
                    Icons.event_available_rounded,
                    size: 19,
                    color: _primary,
                  ),

                  const SizedBox(width: 9),

                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,

                    children: [
                      const Text(
                        '선택한 날짜',
                        style: TextStyle(fontSize: 11, color: _textSecondary),
                      ),

                      const SizedBox(height: 3),

                      Text(
                        _formatSelectedDate(_selectedDate!),

                        style: const TextStyle(
                          fontSize: 14,

                          fontWeight: FontWeight.w700,

                          color: _textPrimary,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],

          if (!_hasAvailableDates()) ...[
            const SizedBox(height: 12),

            const Text(
              '예약 가능한 일정이 없습니다.',
              style: TextStyle(fontSize: 13, color: Color(0xFF8B95A1)),
            ),
          ],
        ],
      ],
    );
  }

  // =========================================================
  // 주 이동
  // =========================================================

  Widget _buildWeekNavigation() {
    final firstDate = _firstBookableDate();

    final lastDate = _lastBookableDate();

    final firstWeekStart = _startOfWeek(firstDate);

    final lastWeekStart = _startOfWeek(lastDate);

    final canPrevious = _weekStart.isAfter(firstWeekStart);

    final nextWeek = _weekStart.add(const Duration(days: 7));

    final canNext = !nextWeek.isAfter(lastWeekStart);

    return Row(
      children: [
        IconButton(
          onPressed: canPrevious
              ? () {
                  setState(() {
                    _weekStart = _weekStart.subtract(const Duration(days: 7));

                    _selectedDate = null;

                    _selectedTime = null;
                  });
                }
              : null,

          visualDensity: VisualDensity.compact,

          icon: const Icon(Icons.chevron_left_rounded),
        ),

        Expanded(
          child: Center(
            child: Text(
              _formatWeekRange(_weekStart),

              style: const TextStyle(
                fontSize: 14,

                fontWeight: FontWeight.w700,

                color: _textPrimary,
              ),
            ),
          ),
        ),

        IconButton(
          onPressed: canNext
              ? () {
                  setState(() {
                    _weekStart = nextWeek;

                    _selectedDate = null;

                    _selectedTime = null;
                  });
                }
              : null,

          visualDensity: VisualDensity.compact,

          icon: const Icon(Icons.chevron_right_rounded),
        ),
      ],
    );
  }

  // =========================================================
  // 날짜 버튼
  // =========================================================

  Widget _buildDateCell(DateTime date) {
    final status = _dateStatus(date);

    final selected = _selectedDate != null && _isSameDate(_selectedDate!, date);

    final enabled = status == _DateStatus.available;

    Color backgroundColor = Colors.white;

    Color borderColor = _border;

    Color textColor = _textPrimary;

    Color subTextColor = _textSecondary;

    if (selected) {
      backgroundColor = _primaryLight;

      borderColor = _primary;

      textColor = _primaryDark;

      subTextColor = _primaryDark;
    } else {
      switch (status) {
        case _DateStatus.available:
          backgroundColor = Colors.white;

          borderColor = const Color(0xFFD8E5F3);

          break;

        case _DateStatus.closed:
          backgroundColor = const Color(0xFFFFF7F7);

          borderColor = const Color(0xFFFFE1E1);

          textColor = const Color(0xFFB8BFC8);

          subTextColor = const Color(0xFFE56B6F);

          break;

        case _DateStatus.full:
          backgroundColor = const Color(0xFFF7F8FA);

          borderColor = const Color(0xFFE8EAED);

          textColor = const Color(0xFFB8BFC8);

          subTextColor = const Color(0xFF9CA3AF);

          break;

        case _DateStatus.policyBlocked:
          backgroundColor = const Color(0xFFF7F8FA);

          borderColor = const Color(0xFFE8EAED);

          textColor = const Color(0xFFB8BFC8);

          subTextColor = const Color(0xFF9CA3AF);

          break;
      }
    }

    return InkWell(
      onTap: enabled
          ? () {
              setState(() {
                _selectedDate = date;

                _selectedTime = null;
              });
            }
          : null,

      borderRadius: BorderRadius.circular(12),

      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),

        height: 74,

        decoration: BoxDecoration(
          color: backgroundColor,

          borderRadius: BorderRadius.circular(12),

          border: Border.all(color: borderColor, width: selected ? 1.4 : 1),
        ),

        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,

          children: [
            Text(
              _weekdayLabel(date),

              style: TextStyle(
                fontSize: 11,

                fontWeight: FontWeight.w500,

                color: subTextColor,
              ),
            ),

            const SizedBox(height: 4),

            Text(
              '${date.day}',

              style: TextStyle(
                fontSize: 16,

                fontWeight: FontWeight.w700,

                color: textColor,
              ),
            ),

            const SizedBox(height: 3),

            Text(
              _dateStatusLabel(status),

              maxLines: 1,

              overflow: TextOverflow.ellipsis,

              style: TextStyle(
                fontSize: 8.5,

                fontWeight: FontWeight.w600,

                color: subTextColor,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDateLegend() {
    return const Wrap(
      spacing: 14,
      runSpacing: 6,

      children: [
        _LegendItem(color: _primary, text: '예약 가능'),

        _LegendItem(color: Color(0xFFE56B6F), text: '휴진'),

        _LegendItem(color: Color(0xFF9CA3AF), text: '예약 마감'),
      ],
    );
  }

  // =========================================================
  // 3. 예약 가능 시간
  // =========================================================

  Widget _buildTimeSection() {
    if (_selectedDoctor == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildStepTitle(number: 3, title: '예약 가능 시간'),
          const SizedBox(height: 14),
          _buildSelectionGuide(
            icon: Icons.schedule_rounded,
            text: '담당 의료진을 먼저 선택해주세요.',
          ),
        ],
      );
    }

    final selectedDate = _selectedDate;

    final slots = selectedDate == null
        ? <DateTime>[]
        : _availability?.findDate(selectedDate)?.slots ?? [];

    // 오전
    final morningSlots = slots.where((slot) {
      final koreaTime = slot.toUtc().add(const Duration(hours: 9));

      return koreaTime.hour < 12;
    }).toList();

    // 오후
    final afternoonSlots = slots.where((slot) {
      final koreaTime = slot.toUtc().add(const Duration(hours: 9));

      return koreaTime.hour >= 12;
    }).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,

      children: [
        _buildStepTitle(number: 3, title: '예약 가능 시간'),

        const SizedBox(height: 14),

        if (_loadingAvailability)
          const SizedBox.shrink()
        else if (!_hasAvailableDates())
          const Text(
            '예약 가능한 일정이 없습니다.',
            style: TextStyle(color: Color(0xFF8B95A1)),
          )
        else if (selectedDate == null)
          _buildEmptyTimeMessage()
        else if (slots.isEmpty)
          const Text(
            '선택한 날짜에 예약 가능한 시간이 없습니다.',
            style: TextStyle(color: Color(0xFF8B95A1)),
          )
        else ...[
          if (morningSlots.isNotEmpty) ...[
            _buildTimePeriodTitle(icon: Icons.wb_sunny_outlined, title: '오전'),

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
      ],
    );
  }

  Widget _buildTimePeriodTitle({
    required IconData icon,
    required String title,
  }) {
    return Row(
      children: [
        Icon(icon, size: 17, color: _primary),

        const SizedBox(width: 6),

        Text(
          title,

          style: const TextStyle(
            fontSize: 14,

            fontWeight: FontWeight.w700,

            color: _textPrimary,
          ),
        ),
      ],
    );
  }

  /// 항상 4열 고정.
  /// 마지막 줄 1~3개여도
  /// 가운데 정렬되지 않고
  /// 왼쪽부터 그대로 표시됨.
  Widget _buildTimeGrid(List<DateTime> slots) {
    return GridView.builder(
      shrinkWrap: true,

      physics: const NeverScrollableScrollPhysics(),

      itemCount: slots.length,

      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 4,

        crossAxisSpacing: 8,

        mainAxisSpacing: 10,

        childAspectRatio: 1.85,
      ),

      itemBuilder: (context, index) {
        final slot = slots[index];

        final selected =
            _selectedTime != null && _selectedTime!.isAtSameMomentAs(slot);

        return _buildTimeButton(slot: slot, selected: selected);
      },
    );
  }

  Widget _buildEmptyTimeMessage() {
    return Container(
      width: double.infinity,

      padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 16),

      decoration: BoxDecoration(
        color: _surface,

        borderRadius: BorderRadius.circular(14),
      ),

      child: const Row(
        children: [
          Icon(Icons.schedule_rounded, size: 20, color: Color(0xFFA8B3C1)),

          SizedBox(width: 8),

          Text(
            '예약 날짜를 먼저 선택해주세요.',
            style: TextStyle(fontSize: 13, color: Color(0xFF8B95A1)),
          ),
        ],
      ),
    );
  }

  Widget _buildTimeButton({required DateTime slot, required bool selected}) {
    return InkWell(
      onTap: () {
        setState(() {
          _selectedTime = slot;
        });
      },

      borderRadius: BorderRadius.circular(10),

      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),

        alignment: Alignment.center,

        decoration: BoxDecoration(
          color: selected ? _primaryLight : const Color(0xFFFBFAFF),

          borderRadius: BorderRadius.circular(10),

          border: Border.all(
            color: selected ? _primary : const Color(0xFFDCD9E7),

            width: selected ? 1.4 : 1,
          ),
        ),

        child: Text(
          _formatTime(slot),

          style: TextStyle(
            fontSize: 13,

            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,

            color: selected ? _primaryDark : const Color(0xFF4E5968),
          ),
        ),
      ),
    );
  }

  // =========================================================
  // 예약 요청 버튼
  // =========================================================

  Widget _buildSubmitButton() {
    final enabled =
        _selectedDoctor != null &&
        _selectedDate != null &&
        _selectedTime != null &&
        !_submitting;

    return SizedBox(
      width: double.infinity,

      height: 54,

      child: FilledButton(
        onPressed: enabled ? _submit : null,

        style: FilledButton.styleFrom(
          backgroundColor: _primary,

          disabledBackgroundColor: const Color(0xFFE5E7EB),

          disabledForegroundColor: const Color(0xFF9CA3AF),

          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(15),
          ),
        ),

        child: _submitting
            ? const SizedBox(
                width: 22,
                height: 22,

                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : const Text(
                '예약 요청',

                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
      ),
    );
  }

  // =========================================================
  // 공통 UI
  // =========================================================

  Widget _buildStepTitle({required int number, required String title}) {
    return Row(
      children: [
        Container(
          width: 24,
          height: 24,

          alignment: Alignment.center,

          decoration: const BoxDecoration(
            color: _primaryLight,

            shape: BoxShape.circle,
          ),

          child: Text(
            '$number',

            style: const TextStyle(
              color: _primaryDark,

              fontSize: 12,

              fontWeight: FontWeight.w700,
            ),
          ),
        ),

        const SizedBox(width: 8),

        Text(
          title,

          style: const TextStyle(
            fontSize: 15,

            fontWeight: FontWeight.w700,

            color: _textPrimary,
          ),
        ),
      ],
    );
  }

  Widget _buildSelectionGuide({required IconData icon, required String text}) {
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
          Icon(icon, size: 20, color: const Color(0xFFA8B3C1)),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(fontSize: 13, color: Color(0xFF8B95A1)),
            ),
          ),
        ],
      ),
    );
  }

  // =========================================================
  // 날짜 상태
  // =========================================================

  _DateStatus _dateStatus(DateTime date) {
    final target = _dateOnly(date);

    // 30일 예약 범위 밖
    if (!_isAllowedByReservationPolicy(target)) {
      return _DateStatus.policyBlocked;
    }

    final dateData = _availability?.findDate(target);

    // 서버에서 일정 자체가 없는 날
    if (dateData == null) {
      return _DateStatus.closed;
    }

    // 슬롯은 있지만
    // 모두 소진된 경우
    if (dateData.slots.isEmpty) {
      return _DateStatus.full;
    }

    return _DateStatus.available;
  }

  String _dateStatusLabel(_DateStatus status) {
    switch (status) {
      case _DateStatus.available:
        return '가능';

      case _DateStatus.closed:
        return '휴진';

      case _DateStatus.full:
        return '마감';

      case _DateStatus.policyBlocked:
        return '예약불가';
    }
  }

  // =========================================================
  // Helper
  // =========================================================

  bool _hasAvailableDates() {
    return _availability?.dates.any(
          (item) =>
              item.slots.isNotEmpty && _isAllowedByReservationPolicy(item.date),
        ) ??
        false;
  }

  DateTime _startOfWeek(DateTime date) {
    final onlyDate = _dateOnly(date);

    return onlyDate.subtract(Duration(days: onlyDate.weekday - 1));
  }

  DateTime _dateOnly(DateTime date) {
    return DateTime(date.year, date.month, date.day);
  }

  bool _isSameDate(DateTime first, DateTime second) {
    return first.year == second.year &&
        first.month == second.month &&
        first.day == second.day;
  }

  String _weekdayLabel(DateTime date) {
    const labels = ['월', '화', '수', '목', '금', '토', '일'];

    return labels[date.weekday - 1];
  }

  String _formatTime(DateTime dateTime) {
    final koreaTime = dateTime.toUtc().add(const Duration(hours: 9));

    final hour = koreaTime.hour.toString().padLeft(2, '0');

    final minute = koreaTime.minute.toString().padLeft(2, '0');

    return '$hour:$minute';
  }

  String _formatSelectedDate(DateTime date) {
    return '${date.year}년 '
        '${date.month}월 '
        '${date.day}일 '
        '(${_weekdayLabel(date)})';
  }

  String _formatWeekRange(DateTime start) {
    final end = start.add(const Duration(days: 6));

    if (start.month == end.month) {
      return '${start.month}월 '
          '${start.day}일 - '
          '${end.day}일';
    }

    return '${start.month}월 '
        '${start.day}일 - '
        '${end.month}월 '
        '${end.day}일';
  }
}

enum _DateStatus { available, closed, full, policyBlocked }

class _LegendItem extends StatelessWidget {
  final Color color;
  final String text;

  const _LegendItem({required this.color, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,

      children: [
        Container(
          width: 7,
          height: 7,

          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),

        const SizedBox(width: 5),

        Text(
          text,

          style: const TextStyle(fontSize: 11, color: Color(0xFF8B95A1)),
        ),
      ],
    );
  }
}
