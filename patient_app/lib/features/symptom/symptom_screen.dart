import 'package:flutter/material.dart';

import 'models/symptom_log.dart';
import 'services/symptom_service.dart';
import 'symptom_date_utils.dart';
import 'widgets/symptom_statistics_tab.dart';

class SymptomScreen extends StatefulWidget {
  const SymptomScreen({
    super.key,
  });

  @override
  State<SymptomScreen> createState() => _SymptomScreenState();
}

class _SymptomScreenState extends State<SymptomScreen> {
  final SymptomService _service = SymptomService();

  final TextEditingController _otherSymptomController =
      TextEditingController();

  static const Color _primaryBlue = Color(0xFF3198F4);
  static const Color _strongBlue = Color(0xFF2F8DFE);
  static const Color _background = Color(0xFFF5F9FD);
  static const Color _textPrimary = Color(0xFF172033);
  static const Color _textSecondary = Color(0xFF748198);
  static const Color _border = Color(0xFFE5EDF5);

  static const String _otherType = '기타';

  final List<_SymptomItem> _symptomItems = const [
    _SymptomItem(
      name: '기침',
      icon: Icons.air_rounded,
      color: Color(0xFF20BFA9),
      background: Color(0xFFE4FAF5),
    ),
    _SymptomItem(
      name: '호흡곤란',
      icon: Icons.air_rounded,
      color: Color(0xFF4A8FF7),
      background: Color(0xFFEAF3FF),
    ),
    _SymptomItem(
      name: '흉통',
      icon: Icons.favorite_outline_rounded,
      color: Color(0xFFF0646D),
      background: Color(0xFFFFEBED),
    ),
    _SymptomItem(
      name: '가래',
      icon: Icons.water_drop_outlined,
      color: Color(0xFF27B88E),
      background: Color(0xFFE7F9F2),
    ),
    _SymptomItem(
      name: '객혈',
      icon: Icons.bloodtype_outlined,
      color: Color(0xFFF25D61),
      background: Color(0xFFFFECEC),
    ),
    _SymptomItem(
      name: '피로',
      icon: Icons.self_improvement_rounded,
      color: Color(0xFFF0A53A),
      background: Color(0xFFFFF4E2),
    ),
    _SymptomItem(
      name: '발열',
      icon: Icons.device_thermostat_rounded,
      color: Color(0xFFFF7D4D),
      background: Color(0xFFFFEFE9),
    ),
  ];

  List<SymptomLog> _symptoms = [];

  final Map<String, int> _scores = {};

  final Map<String, SymptomLog> _selectedDateRecords = {};

  bool _loading = true;
  bool _saving = false;

  int _tabIndex = 0;

  late DateTime _selectedDate;

  _SaveResult? _lastSaveResult;

  @override
  void initState() {
    super.initState();

    _selectedDate = _koreaToday();

    for (final item in _symptomItems) {
      _scores[item.name] = 0;
    }

    _load();
  }

  @override
  void dispose() {
    _otherSymptomController.dispose();

    super.dispose();
  }

  // =========================================================
  // 데이터 조회
  // =========================================================

  Future<void> _load({
    bool preserveSaveResult = false,
  }) async {
    if (mounted) {
      setState(() {
        _loading = true;
      });
    }

    try {
      final symptoms = await _service.getSymptomLogs();

      if (!mounted) {
        return;
      }

      setState(() {
        _symptoms = symptoms;

        _applySelectedDate(
          resetSaveResult: !preserveSaveResult,
        );

        _loading = false;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _loading = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            '증상 기록을 불러오지 못했습니다.',
          ),
        ),
      );
    }
  }

  // =========================================================
  // 날짜
  // =========================================================

  DateTime _koreaToday() {
    final koreaNow = toKoreaTime(
      DateTime.now(),
    );

    return DateTime(
      koreaNow.year,
      koreaNow.month,
      koreaNow.day,
    );
  }

  bool _sameDate(
    DateTime first,
    DateTime second,
  ) {
    return first.year == second.year &&
        first.month == second.month &&
        first.day == second.day;
  }

  bool get _isToday {
    return _sameDate(
      _selectedDate,
      _koreaToday(),
    );
  }

  void _applySelectedDate({
    bool resetSaveResult = true,
  }) {
    _selectedDateRecords.clear();

    if (resetSaveResult) {
      _lastSaveResult = null;
    }

    for (final item in _symptomItems) {
      _scores[item.name] = 0;
    }

    _otherSymptomController.text = '';

    final matchingRecords = _symptoms.where(
      (symptom) {
        final koreaTime = toKoreaTime(
          symptom.loggedAt,
        );

        final recordDate = DateTime(
          koreaTime.year,
          koreaTime.month,
          koreaTime.day,
        );

        return _sameDate(
          recordDate,
          _selectedDate,
        );
      },
    ).toList()
      ..sort(
        (a, b) => a.loggedAt.compareTo(
          b.loggedAt,
        ),
      );

    for (final symptom in matchingRecords) {
      _selectedDateRecords[
        symptom.symptomType
      ] = symptom;

      if (symptom.symptomType == _otherType) {
        _otherSymptomController.text =
            symptom.symptomDescription ?? '';

        continue;
      }

      if (_scores.containsKey(
        symptom.symptomType,
      )) {
        _scores[
          symptom.symptomType
        ] = symptom.severity;
      }
    }
  }

  void _moveDate(
    int offset,
  ) {
    final candidate = _selectedDate.add(
      Duration(
        days: offset,
      ),
    );

    final today = _koreaToday();

    if (candidate.isAfter(today)) {
      return;
    }

    setState(() {
      _selectedDate = DateTime(
        candidate.year,
        candidate.month,
        candidate.day,
      );

      _applySelectedDate();
    });
  }

  // =========================================================
  // 변경 상태
  // =========================================================

  bool _hasScoreChange(
    String symptomType,
  ) {
    final current = _scores[symptomType] ?? 0;

    final existing =
        _selectedDateRecords[symptomType];

    if (existing != null) {
      return current != existing.severity;
    }

    return current > 0;
  }

  String get _otherText {
    return _otherSymptomController.text.trim();
  }

  String get _savedOtherText {
    return _selectedDateRecords[_otherType]
            ?.symptomDescription
            ?.trim() ??
        '';
  }

  bool get _hasOtherChange {
    if (_selectedDateRecords[_otherType] != null) {
      return _otherText != _savedOtherText;
    }

    return _otherText.isNotEmpty;
  }

  bool get _hasUnsavedChanges {
    for (final item in _symptomItems) {
      if (_hasScoreChange(item.name)) {
        return true;
      }
    }

    return _hasOtherChange;
  }

  bool get _hasSavedRecords {
    return _selectedDateRecords.isNotEmpty;
  }

  // =========================================================
  // 증상 저장
  // =========================================================

  Future<void> _saveSymptoms() async {
    if (!_isToday || _saving) {
      return;
    }

    final scoreTargets = _symptomItems
        .where(
          (item) => _hasScoreChange(
            item.name,
          ),
        )
        .map(
          (item) => item.name,
        )
        .toList();

    if (scoreTargets.isEmpty && !_hasOtherChange) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            '변경한 내용이 없습니다.',
          ),
        ),
      );

      return;
    }

    final isUpdating = scoreTargets.any(
          (symptomType) =>
              _selectedDateRecords[symptomType] != null,
        ) ||
        (
          _hasOtherChange &&
              _selectedDateRecords[_otherType] != null
        );

    setState(() {
      _saving = true;
    });

    final savedRecords = <SymptomLog>[];

    try {
      // 점수형 증상 저장
      for (final symptomType in scoreTargets) {
        final existing =
            _selectedDateRecords[symptomType];

        final saved = await _service.saveDailySymptom(
          symptomType: symptomType,
          severity: _scores[symptomType] ?? 0,
          existingRecordId: existing?.id,
        );

        savedRecords.add(saved);
      }

      // 기타 증상 메모 저장
      if (_hasOtherChange) {
        final existing =
            _selectedDateRecords[_otherType];

        final saved = await _service.saveDailySymptom(
          symptomType: _otherType,

          // 기타 증상은 점수를 사용하지 않음.
          // DB severity 필수값 때문에 0으로 저장.
          severity: 0,

          existingRecordId: existing?.id,
          description: _otherText,
        );

        savedRecords.add(saved);
      }

      if (!mounted) {
        return;
      }

      _lastSaveResult = isUpdating
          ? _SaveResult.updated
          : _SaveResult.created;

      await _load(
        preserveSaveResult: true,
      );

      if (!mounted) {
        return;
      }

      final redRecords = savedRecords.where(
        (record) {
          return record.symptomType != _otherType &&
              record.riskLevel == 'RED';
        },
      ).toList();

      if (redRecords.isNotEmpty) {
        await _showRedRiskDialog(
          redRecords,
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              isUpdating
                  ? '증상 기록을 수정했습니다.'
                  : '오늘의 증상 기록을 저장했습니다.',
            ),
          ),
        );
      }
    } catch (_) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            '증상 기록 저장에 실패했습니다.',
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  // =========================================================
  // RED 위험 팝업
  // =========================================================

  Future<void> _showRedRiskDialog(
    List<SymptomLog> redRecords,
  ) async {
    final symptomNames = redRecords
        .map(
          (record) => record.symptomType,
        )
        .toSet()
        .join(', ');

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: Colors.white,
          surfaceTintColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(
              22,
            ),
          ),
          titlePadding: const EdgeInsets.fromLTRB(
            22,
            22,
            22,
            0,
          ),
          contentPadding: const EdgeInsets.fromLTRB(
            22,
            16,
            22,
            10,
          ),
          actionsPadding: const EdgeInsets.fromLTRB(
            18,
            4,
            18,
            16,
          ),
          title: Row(
            crossAxisAlignment:
                CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: const BoxDecoration(
                  color: Color(
                    0xFFFFECEE,
                  ),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.warning_amber_rounded,
                  color: Color(
                    0xFFE85D67,
                  ),
                  size: 24,
                ),
              ),
              const SizedBox(
                width: 12,
              ),
              const Expanded(
                child: Padding(
                  padding: EdgeInsets.only(
                    top: 7,
                  ),
                  child: Text(
                    '주의가 필요한 증상이 있어요',
                    style: TextStyle(
                      color: _textPrimary,
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
            ],
          ),
          content: Text(
            '$symptomNames 증상이 주의가 필요한 수준으로 '
            '기록되었습니다.\n\n'
            '증상이 심하거나 계속 악화되는 경우 '
            '의료진에게 문의해주세요.\n\n'
            '갑작스럽게 증상이 심해지거나 응급하다고 느껴지는 경우 '
            '119 또는 응급의료기관에 연락해주세요.',
            style: const TextStyle(
              color: _textSecondary,
              fontSize: 13,
              height: 1.6,
            ),
          ),
          actions: [
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () {
                  Navigator.of(
                    dialogContext,
                  ).pop();
                },
                style: FilledButton.styleFrom(
                  backgroundColor: _strongBlue,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(
                    0,
                    48,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius:
                        BorderRadius.circular(
                      14,
                    ),
                  ),
                ),
                child: const Text(
                  '확인',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  // =========================================================
  // 화면
  // =========================================================

  @override
  Widget build(
    BuildContext context,
  ) {
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
          '건강 리포트',
          style: TextStyle(
            color: _textPrimary,
            fontSize: 20,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.4,
          ),
        ),
      ),
      body: Column(
        children: [
          _buildTopTabs(),
          Expanded(
            child: _loading
                ? const Center(
                    child: CircularProgressIndicator(
                      color: _primaryBlue,
                    ),
                  )
                : _tabIndex == 0
                    ? _buildSymptomRecordTab()
                    : _buildStatisticsTab(),
          ),
        ],
      ),
    );
  }

  // =========================================================
  // 상단 탭
  // =========================================================

  Widget _buildTopTabs() {
    return Container(
      color: Colors.white,
      child: Row(
        children: [
          _buildTopTab(
            index: 0,
            title: '증상 기록',
          ),
          _buildTopTab(
            index: 1,
            title: '기록 통계',
          ),
        ],
      ),
    );
  }

  Widget _buildTopTab({
    required int index,
    required String title,
  }) {
    final selected = _tabIndex == index;

    return Expanded(
      child: InkWell(
        onTap: () {
          setState(() {
            _tabIndex = index;
          });
        },
        child: Column(
          children: [
            const SizedBox(
              height: 16,
            ),
            Text(
              title,
              style: TextStyle(
                color: selected
                    ? _textPrimary
                    : const Color(
                        0xFF9BA8B8,
                      ),
                fontSize: 14,
                fontWeight: selected
                    ? FontWeight.w800
                    : FontWeight.w600,
              ),
            ),
            const SizedBox(
              height: 13,
            ),
            AnimatedContainer(
              duration: const Duration(
                milliseconds: 180,
              ),
              height: 3,
              color: selected
                  ? _strongBlue
                  : Colors.transparent,
            ),
          ],
        ),
      ),
    );
  }

  // =========================================================
  // 증상 기록 탭
  // =========================================================

  Widget _buildSymptomRecordTab() {
    final riskBanner = _buildRiskBanner();

    return RefreshIndicator(
      color: _primaryBlue,
      onRefresh: _load,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        padding: const EdgeInsets.fromLTRB(
          20,
          22,
          20,
          32,
        ),
        child: Column(
          crossAxisAlignment:
              CrossAxisAlignment.start,
          children: [
            const Text(
              '오늘의 증상을 기록해보세요',
              style: TextStyle(
                color: _textPrimary,
                fontSize: 21,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.6,
              ),
            ),
            const SizedBox(
              height: 6,
            ),
            const Text(
              '꾸준한 기록으로 증상 변화를 확인할 수 있어요.',
              style: TextStyle(
                color: _textSecondary,
                fontSize: 13,
                height: 1.4,
              ),
            ),
            const SizedBox(
              height: 19,
            ),

            _buildDateSelector(),

            const SizedBox(
              height: 13,
            ),

            if (!_isToday) ...[
              _buildPastDateNotice(),
              const SizedBox(
                height: 12,
              ),
            ],

            if (riskBanner != null) ...[
              riskBanner,
              const SizedBox(
                height: 12,
              ),
            ],

            _buildSymptomCard(),

            const SizedBox(
              height: 14,
            ),

            _buildOtherSymptomCard(),

            if (_isToday) ...[
              const SizedBox(
                height: 18,
              ),
              _buildSaveButton(),
            ],

            const SizedBox(
              height: 14,
            ),

            const Center(
              child: Text(
                '증상 상태는 자기관리 참고용이며\n'
                '의료진의 진단을 대신하지 않습니다.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Color(
                    0xFF9AA7B7,
                  ),
                  fontSize: 10.5,
                  height: 1.45,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // =========================================================
  // 날짜 선택
  // =========================================================

  Widget _buildDateSelector() {
    return Container(
      height: 53,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(
          17,
        ),
        border: Border.all(
          color: _border,
        ),
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: () {
              _moveDate(-1);
            },
            icon: const Icon(
              Icons.chevron_left_rounded,
              color: _textSecondary,
            ),
          ),
          Expanded(
            child: Text(
              _formatSelectedDate(),
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: _textPrimary,
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          IconButton(
            onPressed: _isToday
                ? null
                : () {
                    _moveDate(1);
                  },
            icon: Icon(
              Icons.chevron_right_rounded,
              color: _isToday
                  ? const Color(
                      0xFFD4DDE6,
                    )
                  : _textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPastDateNotice() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: 14,
        vertical: 11,
      ),
      decoration: BoxDecoration(
        color: const Color(
          0xFFF0F7FE,
        ),
        borderRadius: BorderRadius.circular(
          13,
        ),
      ),
      child: const Row(
        children: [
          Icon(
            Icons.info_outline_rounded,
            color: _primaryBlue,
            size: 18,
          ),
          SizedBox(
            width: 8,
          ),
          Expanded(
            child: Text(
              '이전 날짜의 증상 기록은 조회만 가능합니다.',
              style: TextStyle(
                color: _textSecondary,
                fontSize: 11.5,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // =========================================================
  // 증상 목록
  // =========================================================

  Widget _buildSymptomCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: 12,
        vertical: 5,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(
          22,
        ),
        border: Border.all(
          color: _border,
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(
              0xFF5F86AA,
            ).withValues(
              alpha: 0.04,
            ),
            blurRadius: 18,
            offset: const Offset(
              0,
              5,
            ),
          ),
        ],
      ),
      child: Column(
        children: [
          for (
            int index = 0;
            index < _symptomItems.length;
            index++
          ) ...[
            _buildSymptomRow(
              _symptomItems[index],
            ),
            if (
              index !=
                  _symptomItems.length - 1
            )
              const Divider(
                height: 1,
                thickness: 1,
                color: Color(
                  0xFFF0F3F7,
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _buildSymptomRow(
    _SymptomItem item,
  ) {
    final score = _scores[item.name] ?? 0;

    final existing =
        _selectedDateRecords[item.name];

    final hasRecord = existing != null;

    final changed = _hasScoreChange(
      item.name,
    );

    return Padding(
      padding: const EdgeInsets.symmetric(
        vertical: 9,
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: item.background,
              shape: BoxShape.circle,
            ),
            child: Icon(
              item.icon,
              color: item.color,
              size: 21,
            ),
          ),

          const SizedBox(
            width: 10,
          ),

          SizedBox(
            width: 67,
            child: Column(
              crossAxisAlignment:
                  CrossAxisAlignment.start,
              children: [
                Text(
                  item.name,
                  style: const TextStyle(
                    color: _textPrimary,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),

                if (hasRecord || changed)
                  const SizedBox(
                    height: 2,
                  ),

                if (changed)
                  Text(
                    hasRecord
                        ? '수정 중'
                        : '입력 중',
                    style: const TextStyle(
                      color: _primaryBlue,
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                    ),
                  )
                else if (hasRecord)
                  _buildSavedStatusText(
                    existing,
                  ),
              ],
            ),
          ),

          Expanded(
            child: SliderTheme(
              data: SliderTheme.of(
                context,
              ).copyWith(
                activeTrackColor: const Color(
                  0xFF8BC5FC,
                ),
                inactiveTrackColor: const Color(
                  0xFFE7EDF3,
                ),
                disabledActiveTrackColor:
                    const Color(
                  0xFFB7C8D8,
                ),
                disabledInactiveTrackColor:
                    const Color(
                  0xFFE8EDF2,
                ),
                thumbColor: const Color(
                  0xFF67AFF6,
                ),
                disabledThumbColor:
                    const Color(
                  0xFFB7C8D8,
                ),
                overlayColor:
                    _primaryBlue.withValues(
                  alpha: 0.10,
                ),
                trackHeight: 4,
                thumbShape:
                    const RoundSliderThumbShape(
                  enabledThumbRadius: 6.5,
                ),
                overlayShape:
                    const RoundSliderOverlayShape(
                  overlayRadius: 14,
                ),
              ),
              child: Slider(
                value: score.toDouble(),
                min: 0,
                max: 10,
                divisions: 10,
                onChanged: _isToday
                    ? (value) {
                        setState(() {
                          _scores[item.name] =
                              value.round();

                          _lastSaveResult = null;
                        });
                      }
                    : null,
              ),
            ),
          ),

          const SizedBox(
            width: 4,
          ),

          Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: Color(
                0xFFF3F7FB,
              ),
              shape: BoxShape.circle,
            ),
            child: Text(
              '$score',
              style: const TextStyle(
                color: _textPrimary,
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSavedStatusText(
    SymptomLog symptom,
  ) {
    if (symptom.riskLevel == 'RED') {
      return const Text(
        '위험',
        style: TextStyle(
          color: Color(
            0xFFE85D67,
          ),
          fontSize: 9,
          fontWeight: FontWeight.w700,
        ),
      );
    }

    if (symptom.riskLevel == 'YELLOW') {
      return const Text(
        '주의',
        style: TextStyle(
          color: Color(
            0xFFD18A12,
          ),
          fontSize: 9,
          fontWeight: FontWeight.w700,
        ),
      );
    }

    return const Text(
      '기록됨',
      style: TextStyle(
        color: _primaryBlue,
        fontSize: 9,
        fontWeight: FontWeight.w600,
      ),
    );
  }

  // =========================================================
  // 기타 증상
  // =========================================================

  Widget _buildOtherSymptomCard() {
    final existing =
        _selectedDateRecords[_otherType];

    final changed = _hasOtherChange;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(
        16,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(
          20,
        ),
        border: Border.all(
          color: _border,
        ),
      ),
      child: Column(
        crossAxisAlignment:
            CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: const BoxDecoration(
                  color: Color(
                    0xFFF0EFFF,
                  ),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.edit_note_rounded,
                  color: Color(
                    0xFF8B8BF5,
                  ),
                ),
              ),
              const SizedBox(
                width: 10,
              ),
              const Expanded(
                child: Column(
                  crossAxisAlignment:
                      CrossAxisAlignment.start,
                  children: [
                    Text(
                      '기타 증상',
                      style: TextStyle(
                        color: _textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    SizedBox(
                      height: 2,
                    ),
                    Text(
                      '추가로 느끼는 증상이 있다면 적어주세요.',
                      style: TextStyle(
                        color: _textSecondary,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              if (changed)
                const Text(
                  '수정 중',
                  style: TextStyle(
                    color: _primaryBlue,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                )
              else if (existing != null)
                const Text(
                  '기록됨',
                  style: TextStyle(
                    color: _primaryBlue,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
            ],
          ),
          const SizedBox(
            height: 14,
          ),
          TextField(
            controller: _otherSymptomController,
            enabled: _isToday,
            minLines: 3,
            maxLines: 5,
            maxLength: 300,
            onChanged: (_) {
              setState(() {
                _lastSaveResult = null;
              });
            },
            decoration: InputDecoration(
              hintText:
                  '예: 어지러움, 목 불편감, 두통 등',
              hintStyle: const TextStyle(
                color: Color(
                  0xFFA5B0BE,
                ),
                fontSize: 12,
              ),
              filled: true,
              fillColor: const Color(
                0xFFF8FAFC,
              ),
              counterText: '',
              contentPadding: const EdgeInsets.all(
                14,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(
                  14,
                ),
                borderSide: const BorderSide(
                  color: _border,
                ),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(
                  14,
                ),
                borderSide: const BorderSide(
                  color: _border,
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(
                  14,
                ),
                borderSide: const BorderSide(
                  color: _primaryBlue,
                  width: 1.3,
                ),
              ),
              disabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(
                  14,
                ),
                borderSide: const BorderSide(
                  color: _border,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // =========================================================
  // 저장 버튼
  // =========================================================

  Widget _buildSaveButton() {
    final hasChanges = _hasUnsavedChanges;

    final savedState =
        _hasSavedRecords &&
        !hasChanges;

    String buttonText;
    IconData buttonIcon;

    if (_saving) {
      buttonText = '저장 중...';
      buttonIcon = Icons.hourglass_top_rounded;
    } else if (savedState) {
      if (_lastSaveResult ==
          _SaveResult.updated) {
        buttonText = '수정 내용 저장됨';
      } else {
        buttonText = '오늘 기록 저장됨';
      }

      buttonIcon = Icons.check_circle_rounded;
    } else if (
      _hasSavedRecords &&
      hasChanges
    ) {
      buttonText = '수정 내용 저장하기';
      buttonIcon = Icons.edit_rounded;
    } else {
      buttonText = '기록 저장하기';
      buttonIcon = Icons.save_rounded;
    }

    return SizedBox(
      width: double.infinity,
      height: 53,
      child: FilledButton.icon(
        onPressed:
            _saving || savedState
            ? null
            : _saveSymptoms,
        icon: _saving
            ? const SizedBox(
                width: 18,
                height: 18,
                child:
                    CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : Icon(
                buttonIcon,
                size: 19,
              ),
        label: Text(
          buttonText,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w800,
          ),
        ),
        style: FilledButton.styleFrom(
          backgroundColor: _strongBlue,
          foregroundColor: Colors.white,

          disabledBackgroundColor:
              savedState
              ? const Color(
                  0xFFEAF5FF,
                )
              : const Color(
                  0xFFAECDF7,
                ),

          disabledForegroundColor:
              savedState
              ? _primaryBlue
              : Colors.white,

          shape: RoundedRectangleBorder(
            borderRadius:
                BorderRadius.circular(
              15,
            ),
          ),
        ),
      ),
    );
  }

  // =========================================================
  // 위험 배너
  // =========================================================

  Widget? _buildRiskBanner() {
    final redRecords =
        _selectedDateRecords.values.where(
      (record) {
        return record.symptomType != _otherType &&
            record.riskLevel == 'RED';
      },
    ).toList();

    final yellowRecords =
        _selectedDateRecords.values.where(
      (record) {
        return record.symptomType != _otherType &&
            record.riskLevel == 'YELLOW';
      },
    ).toList();

    if (redRecords.isNotEmpty) {
      final names = redRecords
          .map(
            (record) => record.symptomType,
          )
          .toSet()
          .join(', ');

      return _RiskBanner(
        icon: Icons.warning_amber_rounded,
        title: '확인이 필요한 증상이 있어요',
        description: _isToday
            ? '오늘 기록한 $names 증상이 주의가 필요한 수준이에요.'
            : '$names 증상이 주의가 필요한 수준으로 기록되어 있어요.',
        foreground: const Color(
          0xFFE85D67,
        ),
        background: const Color(
          0xFFFFF1F2,
        ),
        border: const Color(
          0xFFFFD7DB,
        ),
      );
    }

    if (yellowRecords.isNotEmpty) {
      final names = yellowRecords
          .map(
            (record) => record.symptomType,
          )
          .toSet()
          .join(', ');

      return _RiskBanner(
        icon: Icons.info_outline_rounded,
        title: '주의해서 살펴볼 증상이 있어요',
        description: _isToday
            ? '오늘 기록한 $names 증상을 계속 관찰해주세요.'
            : '$names 증상이 주의 수준으로 기록되어 있어요.',
        foreground: const Color(
          0xFFD18A12,
        ),
        background: const Color(
          0xFFFFF8E8,
        ),
        border: const Color(
          0xFFFFE2A3,
        ),
      );
    }

    return null;
  }

  // =========================================================
  // 기록 통계
  // =========================================================

  Widget _buildStatisticsTab() {
    return SymptomStatisticsTab(
      symptoms: _symptoms,
      onRefresh: _load,
    );
  }

  // =========================================================
  // 날짜 텍스트
  // =========================================================

  String _formatSelectedDate() {
    const dayNames = [
      '월',
      '화',
      '수',
      '목',
      '금',
      '토',
      '일',
    ];

    return '${_selectedDate.year}년 '
        '${_selectedDate.month}월 '
        '${_selectedDate.day}일 '
        '(${dayNames[_selectedDate.weekday - 1]})';
  }
}

// ===========================================================
// 저장 결과 상태
// ===========================================================

enum _SaveResult {
  created,
  updated,
}

// ===========================================================
// 증상 UI 정보
// ===========================================================

class _SymptomItem {
  final String name;
  final IconData icon;
  final Color color;
  final Color background;

  const _SymptomItem({
    required this.name,
    required this.icon,
    required this.color,
    required this.background,
  });
}

// ===========================================================
// 위험 배너
// ===========================================================

class _RiskBanner extends StatelessWidget {
  final IconData icon;
  final String title;
  final String description;
  final Color foreground;
  final Color background;
  final Color border;

  const _RiskBanner({
    required this.icon,
    required this.title,
    required this.description,
    required this.foreground,
    required this.background,
    required this.border,
  });

  @override
  Widget build(
    BuildContext context,
  ) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(
        14,
      ),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(
          15,
        ),
        border: Border.all(
          color: border,
        ),
      ),
      child: Row(
        crossAxisAlignment:
            CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: Colors.white.withValues(
                alpha: 0.72,
              ),
              shape: BoxShape.circle,
            ),
            child: Icon(
              icon,
              color: foreground,
              size: 19,
            ),
          ),
          const SizedBox(
            width: 10,
          ),
          Expanded(
            child: Column(
              crossAxisAlignment:
                  CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: foreground,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(
                  height: 3,
                ),
                Text(
                  description,
                  style: const TextStyle(
                    color: Color(
                      0xFF748198,
                    ),
                    fontSize: 11.5,
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}