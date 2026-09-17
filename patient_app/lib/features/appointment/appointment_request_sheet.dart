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

  List<AppointmentDoctor> _doctors = [];
  AppointmentDoctor? _selectedDoctor;
  AppointmentAvailability? _availability;
  DateTime? _selectedDate;
  DateTime? _selectedTime;

  bool _loadingDoctors = true;
  bool _loadingAvailability = false;
  bool _submitting = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadDoctors();
  }

  Future<void> _loadDoctors() async {
    try {
      final doctors = await _service.getAppointmentDoctors();

      if (!mounted) return;

      setState(() {
        _doctors = doctors;
        _selectedDoctor = doctors.isEmpty ? null : doctors.first;
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

  Future<void> _loadAvailability() async {
    final doctor = _selectedDoctor;

    if (doctor == null) return;

    final today = _dateOnly(DateTime.now());
    final end = today.add(const Duration(days: 31));

    setState(() {
      _loadingAvailability = true;
      _availability = null;
      _selectedDate = null;
      _selectedTime = null;
      _errorMessage = null;
    });

    try {
      final availability = await _service.getAppointmentAvailability(
        doctorId: doctor.id,
        start: today,
        end: end,
      );

      if (!mounted) return;

      setState(() {
        _availability = availability;

        // 날짜는 사용자가 직접 선택하도록 합니다.
        _selectedDate = null;
        _selectedTime = null;
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

  Future<void> _openCalendar() async {
    final availability = _availability;

    if (availability == null) return;

    final today = _dateOnly(DateTime.now());
    final lastDate = today.add(const Duration(days: 31));

    final availableDates =
        availability.dates
            .where((item) => item.slots.isNotEmpty)
            .map((item) => _dateOnly(item.date))
            .where((date) => !date.isBefore(today) && !date.isAfter(lastDate))
            .toList()
          ..sort();

    if (availableDates.isEmpty) {
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('선택 가능한 예약일이 없습니다.')));
      return;
    }

    final currentSelectedDate = _selectedDate;

    final initialDate =
        currentSelectedDate != null &&
            availableDates.any((date) => _isSameDate(date, currentSelectedDate))
        ? _dateOnly(currentSelectedDate)
        : availableDates.first;

    final selected = await showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: today,
      lastDate: lastDate,
      selectableDayPredicate: (date) {
        return availableDates.any(
          (availableDate) => _isSameDate(availableDate, date),
        );
      },
      helpText: '예약 날짜 선택',
      cancelText: '취소',
      confirmText: '선택',
    );

    if (selected == null || !mounted) {
      return;
    }

    setState(() {
      _selectedDate = _dateOnly(selected);
      _selectedTime = null;
    });
  }

  Future<void> _submit() async {
    final doctor = _selectedDoctor;
    final selectedTime = _selectedTime;

    if (doctor == null || selectedTime == null || _submitting) {
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
                  color: Color(0xFF191F28),
                ),
              ),

              const SizedBox(height: 6),

              const Text(
                '의료진의 실제 진료 가능 시간만 표시됩니다.',
                style: TextStyle(fontSize: 14, color: Color(0xFF8B95A1)),
              ),

              const SizedBox(height: 24),

              _buildDoctorSection(),

              const SizedBox(height: 24),

              _buildDateSection(),

              const SizedBox(height: 24),

              _buildTimeSection(),

              if (_errorMessage != null) ...[
                const SizedBox(height: 16),
                Text(
                  _errorMessage!,
                  style: const TextStyle(color: Color(0xFFE5484D)),
                ),
              ],

              const SizedBox(height: 24),

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

  Widget _buildDoctorSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildStepTitle(number: 1, title: '담당 의료진'),

        const SizedBox(height: 10),

        if (_loadingDoctors)
          const Center(child: CircularProgressIndicator())
        else if (_doctors.isEmpty)
          const Text(
            '예약 가능한 의료진이 없습니다.',
            style: TextStyle(color: Color(0xFF8B95A1)),
          )
        else
          DropdownButtonFormField<AppointmentDoctor>(
            initialValue: _selectedDoctor,
            decoration: _inputDecoration(),
            items: _doctors
                .map(
                  (doctor) => DropdownMenuItem<AppointmentDoctor>(
                    value: doctor,
                    child: Text(doctor.displayName),
                  ),
                )
                .toList(),
            onChanged: (doctor) {
              if (doctor == null) return;

              setState(() {
                _selectedDoctor = doctor;
              });

              _loadAvailability();
            },
          ),
      ],
    );
  }

  Widget _buildDateSection() {
    final availability = _availability;
    final today = _dateOnly(DateTime.now());

    final dates = List.generate(7, (index) => today.add(Duration(days: index)));

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
              icon: const Icon(Icons.calendar_month_rounded, size: 18),
              label: const Text('달력'),
            ),
          ],
        ),

        const SizedBox(height: 10),

        if (_loadingAvailability)
          const Center(child: CircularProgressIndicator())
        else
          SizedBox(
            height: 72,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: dates.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final date = dates[index];
                final dateData = availability?.findDate(date);

                final enabled = dateData?.slots.isNotEmpty ?? false;

                final selected =
                    _selectedDate != null && _isSameDate(_selectedDate!, date);

                return SizedBox(
                  width: 56,
                  child: OutlinedButton(
                    onPressed: enabled
                        ? () {
                            setState(() {
                              _selectedDate = date;
                              _selectedTime = null;
                            });
                          }
                        : null,
                    style: OutlinedButton.styleFrom(
                      padding: EdgeInsets.zero,
                      backgroundColor: selected
                          ? const Color(0xFFEAF2FF)
                          : null,
                      side: BorderSide(
                        color: selected
                            ? const Color(0xFF2B66F6)
                            : const Color(0xFFDDE3EC),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          _weekdayLabel(date),
                          style: const TextStyle(fontSize: 12),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${date.day}',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: selected ? const Color(0xFF2B66F6) : null,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),

        if (!_loadingAvailability &&
            availability != null &&
            _hasAvailableDates() &&
            !_hasAvailableDateInNextWeek()) ...[
          const SizedBox(height: 10),
          const Text(
            '가까운 날짜에 예약 가능한 일정이 없습니다. '
            '달력에서 이후 일정을 확인해주세요.',
            style: TextStyle(fontSize: 12, color: Color(0xFF8B95A1)),
          ),
        ],
      ],
    );
  }

  Widget _buildTimeSection() {
    final selectedDate = _selectedDate;

    final slots = selectedDate == null
        ? <DateTime>[]
        : _availability?.findDate(selectedDate)?.slots ?? [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildStepTitle(number: 3, title: '예약 가능 시간'),

        const SizedBox(height: 10),

        if (_loadingAvailability)
          const SizedBox.shrink()
        else if (!_hasAvailableDates())
          const Text(
            '예약 가능한 일정이 없습니다.',
            style: TextStyle(color: Color(0xFF8B95A1)),
          )
        else if (selectedDate == null)
          const Text(
            '예약 날짜를 선택해주세요.',
            style: TextStyle(color: Color(0xFF8B95A1)),
          )
        else if (slots.isEmpty)
          const Text(
            '선택한 날짜에 예약 가능한 시간이 없습니다.',
            style: TextStyle(color: Color(0xFF8B95A1)),
          )
        else ...[
          Text(
            _formatSelectedDate(selectedDate),
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Color(0xFF4E5968),
            ),
          ),

          const SizedBox(height: 10),

          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: slots.map((slot) {
              final selected =
                  _selectedTime != null &&
                  _selectedTime!.isAtSameMomentAs(slot);

              return ChoiceChip(
                label: Text(_formatTime(slot)),
                selected: selected,
                onSelected: (_) {
                  setState(() {
                    _selectedTime = slot;
                  });
                },
              );
            }).toList(),
          ),
        ],
      ],
    );
  }

  Widget _buildSubmitButton() {
    final enabled =
        _selectedDoctor != null &&
        _selectedDate != null &&
        _selectedTime != null &&
        !_submitting;

    return SizedBox(
      width: double.infinity,
      height: 52,
      child: FilledButton(
        onPressed: enabled ? _submit : null,
        style: FilledButton.styleFrom(
          backgroundColor: const Color(0xFF2B66F6),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
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

  Widget _buildStepTitle({required int number, required String title}) {
    return Row(
      children: [
        Container(
          width: 24,
          height: 24,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: Color(0xFFEAF2FF),
            shape: BoxShape.circle,
          ),
          child: Text(
            '$number',
            style: const TextStyle(
              color: Color(0xFF2B66F6),
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
            color: Color(0xFF191F28),
          ),
        ),
      ],
    );
  }

  InputDecoration _inputDecoration() {
    return InputDecoration(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFDDE3EC)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFDDE3EC)),
      ),
    );
  }

  bool _hasAvailableDates() {
    return _availability?.dates.any((item) => item.slots.isNotEmpty) ?? false;
  }

  bool _hasAvailableDateInNextWeek() {
    final today = _dateOnly(DateTime.now());
    final lastDay = today.add(const Duration(days: 6));

    return _availability?.dates.any((item) {
          final date = _dateOnly(item.date);

          return item.slots.isNotEmpty &&
              !date.isBefore(today) &&
              !date.isAfter(lastDay);
        }) ??
        false;
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
    final hour = dateTime.hour.toString().padLeft(2, '0');
    final minute = dateTime.minute.toString().padLeft(2, '0');

    return '$hour:$minute';
  }

  String _formatSelectedDate(DateTime date) {
    return '${date.year}년 '
        '${date.month}월 '
        '${date.day}일 '
        '${_weekdayLabel(date)}요일';
  }
}
