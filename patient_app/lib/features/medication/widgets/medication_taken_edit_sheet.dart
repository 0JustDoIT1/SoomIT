import 'package:flutter/material.dart';

Future<DateTime?> showMedicationTakenEditSheet(
  BuildContext context, {
  DateTime? initialTakenAt,
}) {
  return showModalBottomSheet<DateTime>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (context) {
      return _MedicationTakenEditSheet(initialTakenAt: initialTakenAt);
    },
  );
}

class _MedicationTakenEditSheet extends StatefulWidget {
  final DateTime? initialTakenAt;

  const _MedicationTakenEditSheet({this.initialTakenAt});

  @override
  State<_MedicationTakenEditSheet> createState() =>
      _MedicationTakenEditSheetState();
}

class _MedicationTakenEditSheetState extends State<_MedicationTakenEditSheet> {
  late DateTime _selectedDate;
  late TimeOfDay _selectedTime;

  String? _validationMessage;

  @override
  void initState() {
    super.initState();

    final koreaNow = _koreaNow();

    final initialKoreaTime = widget.initialTakenAt == null
        ? koreaNow
        : _toKoreaTime(widget.initialTakenAt!);

    _selectedDate = DateTime(
      initialKoreaTime.year,
      initialKoreaTime.month,
      initialKoreaTime.day,
    );

    _selectedTime = TimeOfDay(
      hour: initialKoreaTime.hour,
      minute: initialKoreaTime.minute,
    );
  }

  DateTime _koreaNow() {
    return DateTime.now().toUtc().add(const Duration(hours: 9));
  }

  DateTime _toKoreaTime(DateTime dateTime) {
    return dateTime.toUtc().add(const Duration(hours: 9));
  }

  DateTime get _selectedKoreaDateTime {
    return DateTime(
      _selectedDate.year,
      _selectedDate.month,
      _selectedDate.day,
      _selectedTime.hour,
      _selectedTime.minute,
    );
  }

  bool get _isFutureTime {
    return _selectedKoreaDateTime.isAfter(_koreaNow());
  }

  Future<void> _selectDate() async {
    final koreaNow = _koreaNow();

    final today = DateTime(koreaNow.year, koreaNow.month, koreaNow.day);

    final pickedDate = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(koreaNow.year - 2, 1, 1),
      lastDate: today,
      helpText: '실제 복용 날짜',
      cancelText: '취소',
      confirmText: '선택',
    );

    if (!mounted || pickedDate == null) {
      return;
    }

    setState(() {
      _selectedDate = DateTime(
        pickedDate.year,
        pickedDate.month,
        pickedDate.day,
      );

      _validationMessage = null;
    });
  }

  Future<void> _selectTime() async {
    final pickedTime = await showTimePicker(
      context: context,
      initialTime: _selectedTime,
      helpText: '실제 복용 시간',
      cancelText: '취소',
      confirmText: '선택',
    );

    if (!mounted || pickedTime == null) {
      return;
    }

    setState(() {
      _selectedTime = pickedTime;
      _validationMessage = null;
    });
  }

  void _setNow() {
    final koreaNow = _koreaNow();

    setState(() {
      _selectedDate = DateTime(koreaNow.year, koreaNow.month, koreaNow.day);

      _selectedTime = TimeOfDay(hour: koreaNow.hour, minute: koreaNow.minute);

      _validationMessage = null;
    });
  }

  void _save() {
    if (_isFutureTime) {
      setState(() {
        _validationMessage = '현재 시간 이후는 실제 복용 시간으로 기록할 수 없습니다.';
      });

      return;
    }

    /*
     * 사용자가 선택한 값은 한국 시간이다.
     *
     * 예:
     * 한국 2026-09-20 13:25
     * → UTC 2026-09-20 04:25
     *
     * 기기/에뮬레이터 시간대와 관계없이
     * 한국 시간을 정확한 UTC 시각으로 변환해서 반환한다.
     */
    final takenAtUtc = DateTime.utc(
      _selectedDate.year,
      _selectedDate.month,
      _selectedDate.day,
      _selectedTime.hour,
      _selectedTime.minute,
    ).subtract(const Duration(hours: 9));

    Navigator.pop(context, takenAtUtc);
  }

  @override
  Widget build(BuildContext context) {
    final bottomPadding = MediaQuery.viewInsetsOf(context).bottom;

    return Container(
      padding: EdgeInsets.fromLTRB(20, 10, 20, 24 + bottomPadding),
      decoration: const BoxDecoration(
        color: Color(0xFFF8FBFE),
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 42,
              height: 5,
              decoration: BoxDecoration(
                color: const Color(0xFFD8E0EA),
                borderRadius: BorderRadius.circular(20),
              ),
            ),
          ),

          const SizedBox(height: 22),

          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: const Color(0xFFEAF4FF),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(
                  Icons.edit_calendar_rounded,
                  color: Color(0xFF2F80ED),
                  size: 23,
                ),
              ),

              const SizedBox(width: 12),

              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '복용 완료로 수정',
                      style: TextStyle(
                        color: Color(0xFF172033),
                        fontSize: 19,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    SizedBox(height: 4),
                    Text(
                      '실제로 약을 복용한 시간을 선택해주세요.',
                      style: TextStyle(
                        color: Color(0xFF8A96A8),
                        fontSize: 12.5,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),

              IconButton(
                onPressed: () {
                  Navigator.pop(context);
                },
                icon: const Icon(Icons.close_rounded, color: Color(0xFF7B8797)),
              ),
            ],
          ),

          const SizedBox(height: 24),

          _SelectionTile(
            icon: Icons.calendar_today_rounded,
            label: '복용 날짜',
            value: _formatDate(_selectedDate),
            onTap: _selectDate,
          ),

          const SizedBox(height: 12),

          _SelectionTile(
            icon: Icons.schedule_rounded,
            label: '복용 시간',
            value: _formatTime(_selectedTime),
            onTap: _selectTime,
          ),

          const SizedBox(height: 14),

          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: _setNow,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: const Text('현재 시간으로 설정'),
              style: TextButton.styleFrom(
                foregroundColor: const Color(0xFF2F80ED),
              ),
            ),
          ),

          if (_validationMessage != null) ...[
            const SizedBox(height: 4),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: const Color(0xFFFFECEE),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(
                    Icons.info_outline_rounded,
                    color: Color(0xFFEF5B64),
                    size: 19,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _validationMessage!,
                      style: const TextStyle(
                        color: Color(0xFFD64B55),
                        fontSize: 12,
                        height: 1.4,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 20),

          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 50,
                  child: OutlinedButton(
                    onPressed: () {
                      Navigator.pop(context);
                    },
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF60748A),
                      side: const BorderSide(color: Color(0xFFDDE6EF)),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: const Text(
                      '취소',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              ),

              const SizedBox(width: 10),

              Expanded(
                flex: 2,
                child: SizedBox(
                  height: 50,
                  child: FilledButton.icon(
                    onPressed: _save,
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF2F80ED),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    icon: const Icon(Icons.check_rounded, size: 19),
                    label: const Text(
                      '복용 완료로 저장',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _formatDate(DateTime date) {
    const weekdays = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];

    return '${date.year}년 '
        '${date.month}월 '
        '${date.day}일 '
        '${weekdays[date.weekday - 1]}';
  }

  String _formatTime(TimeOfDay time) {
    final period = time.hour < 12 ? '오전' : '오후';

    final displayHour = time.hour == 0
        ? 12
        : time.hour > 12
        ? time.hour - 12
        : time.hour;

    final minute = time.minute.toString().padLeft(2, '0');

    return '$period $displayHour:$minute';
  }
}

class _SelectionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final VoidCallback onTap;

  const _SelectionTile({
    required this.icon,
    required this.label,
    required this.value,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFFE2ECF5)),
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: const Color(0xFFEDF6FF),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: const Color(0xFF2F80ED), size: 20),
              ),

              const SizedBox(width: 13),

              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(
                        color: Color(0xFF8A96A8),
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      value,
                      style: const TextStyle(
                        color: Color(0xFF172033),
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),

              const Icon(Icons.chevron_right_rounded, color: Color(0xFFA1ADBC)),
            ],
          ),
        ),
      ),
    );
  }
}
