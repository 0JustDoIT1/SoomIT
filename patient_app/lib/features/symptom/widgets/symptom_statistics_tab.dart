import 'package:flutter/material.dart';

import '../models/symptom_log.dart';
import '../symptom_date_utils.dart';
import 'symptom_trend_chart.dart';

class SymptomStatisticsTab extends StatefulWidget {
  final List<SymptomLog> symptoms;
  final Future<void> Function() onRefresh;

  const SymptomStatisticsTab({
    super.key,
    required this.symptoms,
    required this.onRefresh,
  });

  @override
  State<SymptomStatisticsTab> createState() =>
      _SymptomStatisticsTabState();
}

class _SymptomStatisticsTabState extends State<SymptomStatisticsTab> {
  static const Color _primary = Color(0xFF3198F4);
  static const Color _strongBlue = Color(0xFF2F8DFE);
  static const Color _text = Color(0xFF172033);
  static const Color _subText = Color(0xFF748198);
  static const Color _border = Color(0xFFE5EDF5);
  static const String _otherType = '기타';

  static const List<_SymptomUi> _items = [
    _SymptomUi('기침', Icons.air_rounded, Color(0xFF20BFA9), Color(0xFFE4FAF5)),
    _SymptomUi('호흡곤란', Icons.air_rounded, Color(0xFF4A8FF7), Color(0xFFEAF3FF)),
    _SymptomUi('흉통', Icons.favorite_outline_rounded, Color(0xFFF0646D), Color(0xFFFFEBED)),
    _SymptomUi('가래', Icons.water_drop_outlined, Color(0xFF27B88E), Color(0xFFE7F9F2)),
    _SymptomUi('객혈', Icons.bloodtype_outlined, Color(0xFFF25D61), Color(0xFFFFECEC)),
    _SymptomUi('피로', Icons.self_improvement_rounded, Color(0xFFF0A53A), Color(0xFFFFF4E2)),
    _SymptomUi('발열', Icons.device_thermostat_rounded, Color(0xFFFF7D4D), Color(0xFFFFEFE9)),
  ];

  _Period _period = _Period.sevenDays;
  String _selectedSymptom = '기침';

  @override
  Widget build(BuildContext context) {
    final scoredAll = widget.symptoms
        .where((record) => record.symptomType != _otherType)
        .toList();
    final filtered = _filterByPeriod(scoredAll);

    final selectedRecords = filtered
        .where((record) => record.symptomType == _selectedSymptom)
        .toList()
      ..sort((a, b) => a.loggedAt.compareTo(b.loggedAt));

    final trendRecords = _latestPerDate(selectedRecords);

    final otherRecords = _filterByPeriod(
      widget.symptoms
          .where(
            (record) =>
                record.symptomType == _otherType &&
                (record.symptomDescription?.trim().isNotEmpty ?? false),
          )
          .toList(),
    )..sort((a, b) => b.loggedAt.compareTo(a.loggedAt));

    final average = _average(filtered);
    final caution = filtered.where((e) => e.riskLevel == 'YELLOW').length;
    final danger = filtered.where((e) => e.riskLevel == 'RED').length;

    return RefreshIndicator(
      color: _primary,
      onRefresh: widget.onRefresh,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 34),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildPeriodSelector(),
            const SizedBox(height: 14),
            _buildOverview(filtered, scoredAll, average),
            const SizedBox(height: 13),
            _buildMetricGrid(
              average: average,
              total: filtered.length,
              caution: caution,
              danger: danger,
            ),
            const SizedBox(height: 18),
            _sectionTitle('증상별 평균 점수', '선택한 기간의 평균 기록값이에요.'),
            const SizedBox(height: 9),
            _buildAverageCard(filtered),
            const SizedBox(height: 18),
            _sectionTitle('증상별 추이', '날짜별 점수 변화를 확인해보세요.'),
            const SizedBox(height: 9),
            _buildTrendCard(trendRecords),
            if (danger > 0) ...[
              const SizedBox(height: 13),
              _buildDangerNotice(danger),
            ],
            const SizedBox(height: 18),
            _buildRecentRecords(selectedRecords),
            const SizedBox(height: 18),
            _buildOtherRecords(otherRecords),
            const SizedBox(height: 16),
            _buildNotice(),
          ],
        ),
      ),
    );
  }

  Widget _buildPeriodSelector() {
    return Container(
      height: 44,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: const Color(0xFFEBF1F6),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Row(
        children: _Period.values.map((period) {
          final selected = period == _period;
          return Expanded(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => setState(() => _period = period),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 170),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: selected ? _strongBlue : Colors.transparent,
                  borderRadius: BorderRadius.circular(19),
                ),
                child: Text(
                  period.label,
                  style: TextStyle(
                    color: selected ? Colors.white : const Color(0xFF7C8998),
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildOverview(
    List<SymptomLog> current,
    List<SymptomLog> allScored,
    double average,
  ) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(17),
      decoration: BoxDecoration(
        color: const Color(0xFFEFF7FF),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFDCEEFF)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 43,
            height: 43,
            decoration: const BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.bar_chart_rounded, color: _strongBlue),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  current.isEmpty ? '${_period.label} 기록이 아직 없어요' : '${_period.label} 기록 요약',
                  style: const TextStyle(
                    color: _text,
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  current.isEmpty
                      ? '증상을 기록하면 기간별 변화를 확인할 수 있어요.'
                      : _comparisonText(average, allScored),
                  style: const TextStyle(
                    color: _subText,
                    fontSize: 12,
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

  String _comparisonText(double currentAverage, List<SymptomLog> allScored) {
    final days = _period.days;
    if (days == null) {
      return '전체 평균 기록값은 ${currentAverage.toStringAsFixed(1)}점이에요.';
    }

    final today = _today();
    final currentStart = today.subtract(Duration(days: days - 1));
    final previousEnd = currentStart.subtract(const Duration(days: 1));
    final previousStart = previousEnd.subtract(Duration(days: days - 1));

    final previous = allScored.where((record) {
      final date = _recordDate(record);
      return !date.isBefore(previousStart) && !date.isAfter(previousEnd);
    }).toList();

    if (previous.isEmpty) {
      return '평균 기록값은 ${currentAverage.toStringAsFixed(1)}점이에요.';
    }

    final delta = currentAverage - _average(previous);
    if (delta.abs() < 0.05) {
      return '이전 $days일과 평균 기록값이 비슷해요.';
    }

    return '이전 $days일보다 평균 기록값이 '
        '${delta.abs().toStringAsFixed(1)}점 ${delta > 0 ? '높아요' : '낮아요'}.';
  }

  Widget _buildMetricGrid({
    required double average,
    required int total,
    required int caution,
    required int danger,
  }) {
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _MetricCard(
                label: '평균 기록값',
                value: '${average.toStringAsFixed(1)} / 10',
                icon: Icons.eco_outlined,
                iconColor: const Color(0xFF25AA79),
                iconBackground: const Color(0xFFE7F8F1),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _MetricCard(
                label: '총 기록 수',
                value: '$total건',
                icon: Icons.calendar_month_outlined,
                iconColor: _strongBlue,
                iconBackground: const Color(0xFFEAF5FF),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _MetricCard(
                label: '주의 기록',
                value: '$caution건',
                icon: Icons.warning_amber_rounded,
                iconColor: const Color(0xFFD99217),
                iconBackground: const Color(0xFFFFF4DE),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _MetricCard(
                label: '위험 기록',
                value: '$danger건',
                icon: Icons.error_outline_rounded,
                iconColor: const Color(0xFFE85D67),
                iconBackground: const Color(0xFFFFE9EB),
                valueColor: danger > 0 ? const Color(0xFFE85D67) : null,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _sectionTitle(String title, String subtitle) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            color: _text,
            fontSize: 17,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          subtitle,
          style: const TextStyle(color: _subText, fontSize: 11.5),
        ),
      ],
    );
  }

  Widget _buildAverageCard(List<SymptomLog> filtered) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(21),
        border: Border.all(color: _border),
      ),
      child: Column(
        children: [
          for (int i = 0; i < _items.length; i++) ...[
            _averageRow(
              _items[i],
              _average(
                filtered.where((record) => record.symptomType == _items[i].name).toList(),
              ),
            ),
            if (i != _items.length - 1)
              const Divider(height: 1, color: Color(0xFFF1F4F7)),
          ],
        ],
      ),
    );
  }

  Widget _averageRow(_SymptomUi item, double average) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => setState(() => _selectedSymptom = item.name),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 9),
        child: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(color: item.background, shape: BoxShape.circle),
              child: Icon(item.icon, color: item.color, size: 17),
            ),
            const SizedBox(width: 10),
            SizedBox(
              width: 58,
              child: Text(
                item.name,
                style: const TextStyle(
                  color: _text,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            Expanded(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final width = constraints.maxWidth * (average / 10).clamp(0.0, 1.0);
                  return Container(
                    height: 7,
                    decoration: BoxDecoration(
                      color: const Color(0xFFEDF2F7),
                      borderRadius: BorderRadius.circular(99),
                    ),
                    alignment: Alignment.centerLeft,
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 250),
                      width: width,
                      height: 7,
                      decoration: BoxDecoration(
                        color: item.color,
                        borderRadius: BorderRadius.circular(99),
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(width: 12),
            SizedBox(
              width: 29,
              child: Text(
                average.toStringAsFixed(1),
                textAlign: TextAlign.right,
                style: const TextStyle(
                  color: _text,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTrendCard(List<SymptomLog> graph) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(21),
        border: Border.all(color: _border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          DropdownButtonFormField<String>(
            initialValue: _selectedSymptom,
            isExpanded: true,
            icon: const Icon(Icons.keyboard_arrow_down_rounded),
            decoration: InputDecoration(
              filled: true,
              fillColor: const Color(0xFFF8FAFC),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 10,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(13),
                borderSide: const BorderSide(color: _border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(13),
                borderSide: const BorderSide(color: _border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(13),
                borderSide: const BorderSide(
                  color: _primary,
                  width: 1.4,
                ),
              ),
            ),
            items: _items
                .map(
                  (item) => DropdownMenuItem<String>(
                    value: item.name,
                    child: Text(item.name),
                  ),
                )
                .toList(),
            onChanged: (value) {
              if (value != null) {
                setState(() {
                  _selectedSymptom = value;
                });
              }
            },
          ),
          const SizedBox(height: 13),
          if (graph.isEmpty)
            Container(
              height: 170,
              width: double.infinity,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(
                '선택한 기간에\n$_selectedSymptom 기록이 없습니다.',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: _subText,
                  fontSize: 13,
                  height: 1.5,
                ),
              ),
            )
          else
            SymptomTrendChart(symptoms: graph),
          if (graph.isNotEmpty) ...[
            const SizedBox(height: 11),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(
                horizontal: 13,
                vertical: 11,
              ),
              decoration: BoxDecoration(
                color: const Color(0xFFEFF9F5),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(
                    Icons.insights_rounded,
                    color: Color(0xFF2AA879),
                    size: 18,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _trendText(graph),
                      style: const TextStyle(
                        color: Color(0xFF527265),
                        fontSize: 11.5,
                        height: 1.45,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _trendText(List<SymptomLog> graph) {
    if (graph.length < 2) return '기록이 쌓이면 점수 변화를 비교해서 볼 수 있어요.';
    final delta = graph.last.severity - graph.first.severity;
    if (delta == 0) return '첫 기록과 최근 기록의 점수가 같아요.';
    return '첫 기록보다 최근 $_selectedSymptom 점수가 '
        '${delta.abs()}점 ${delta > 0 ? '높아졌어요' : '낮아졌어요'}.';
  }

  Widget _buildDangerNotice(int count) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF0F1),
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: const Color(0xFFFFD8DC)),
      ),
      child: Row(
        children: [
          const Icon(Icons.warning_amber_rounded, color: Color(0xFFE85D67), size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              '선택한 기간에 위험 수준으로 기록된 증상이 $count건 있어요. 해당 기록을 확인해주세요.',
              style: const TextStyle(color: Color(0xFFB34D56), fontSize: 11.5, height: 1.45),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRecentRecords(List<SymptomLog> selected) {
    final records = selected.reversed.take(5).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('$_selectedSymptom 최근 기록', '선택한 증상의 최신 기록이에요.'),
        const SizedBox(height: 11),
        _listCard(
          records.isEmpty
              ? const [_EmptyRow('선택한 기간에 기록이 없습니다.')]
              : records.map((record) {
                  final status = _risk(record.riskLevel);
                  return _RecordRow(
                    date: _longDate(record.loggedAt),
                    status: status.label,
                    statusColor: status.color,
                    value: '${record.severity}점',
                  );
                }).toList(),
        ),
      ],
    );
  }

  Widget _buildOtherRecords(List<SymptomLog> records) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('기타 증상 기록', '점수 없이 작성한 기타 증상 메모예요.'),
        const SizedBox(height: 11),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: _border),
          ),
          child: records.isEmpty
              ? const _EmptyRow('선택한 기간에 기타 증상 기록이 없습니다.')
              : Column(
                  children: [
                    for (int i = 0; i < records.length; i++) ...[
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              width: 35,
                              height: 35,
                              decoration: const BoxDecoration(color: Color(0xFFF0EFFF), shape: BoxShape.circle),
                              child: const Icon(Icons.chat_bubble_outline_rounded, color: Color(0xFF8B8BF5), size: 17),
                            ),
                            const SizedBox(width: 11),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(_longDate(records[i].loggedAt), style: const TextStyle(color: _text, fontSize: 11.5, fontWeight: FontWeight.w800)),
                                  const SizedBox(height: 5),
                                  Text(records[i].symptomDescription?.trim() ?? '', style: const TextStyle(color: _subText, fontSize: 12, height: 1.45)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (i != records.length - 1)
                        const Divider(height: 1, color: Color(0xFFF0F3F6)),
                    ],
                  ],
                ),
        ),
      ],
    );
  }

  Widget _listCard(List<Widget> rows) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _border),
      ),
      child: Column(
        children: [
          for (int i = 0; i < rows.length; i++) ...[
            rows[i],
            if (i != rows.length - 1)
              const Divider(height: 1, color: Color(0xFFF0F3F6)),
          ],
        ],
      ),
    );
  }

  Widget _buildNotice() {
    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: const Color(0xFFF1F7FC),
        borderRadius: BorderRadius.circular(14),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline_rounded, color: _primary, size: 18),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              '통계는 직접 기록한 데이터를 요약한 정보이며 의료적 진단을 대신하지 않습니다. '
              '증상이 지속되거나 악화되면 의료진과 상담해주세요.',
              style: TextStyle(color: _subText, fontSize: 10.8, height: 1.45),
            ),
          ),
        ],
      ),
    );
  }

  List<SymptomLog> _filterByPeriod(List<SymptomLog> records) {
    final days = _period.days;
    if (days == null) return [...records];
    final start = _today().subtract(Duration(days: days - 1));
    return records.where((record) => !_recordDate(record).isBefore(start)).toList();
  }

  List<SymptomLog> _latestPerDate(List<SymptomLog> records) {
    final map = <String, SymptomLog>{};
    for (final record in records) {
      final date = _recordDate(record);
      map['${date.year}-${date.month}-${date.day}'] = record;
    }
    final result = map.values.toList()
      ..sort((a, b) => a.loggedAt.compareTo(b.loggedAt));
    return result;
  }

  double _average(List<SymptomLog> records) {
    if (records.isEmpty) {
      return 0.0;
    }

    final total = records.fold<double>(
      0.0,
      (sum, record) => sum + record.severity.toDouble(),
    );

    return total / records.length;
  }

  DateTime _today() {
    final now = toKoreaTime(DateTime.now());
    return DateTime(now.year, now.month, now.day);
  }

  DateTime _recordDate(SymptomLog record) {
    final korea = toKoreaTime(record.loggedAt);
    return DateTime(korea.year, korea.month, korea.day);
  }

  String _longDate(DateTime dateTime) {
    const weekdays = ['월', '화', '수', '목', '금', '토', '일'];
    final korea = toKoreaTime(dateTime);
    return '${korea.month}월 ${korea.day}일 (${weekdays[korea.weekday - 1]})';
  }

  _RiskUi _risk(String level) {
    switch (level) {
      case 'RED':
        return const _RiskUi('위험', Color(0xFFE85D67));
      case 'YELLOW':
        return const _RiskUi('주의', Color(0xFFD99217));
      default:
        return const _RiskUi('정상', Color(0xFF28A876));
    }
  }
}

enum _Period {
  sevenDays('7일', 7),
  thirtyDays('30일', 30),
  all('전체', null);

  final String label;
  final int? days;
  const _Period(this.label, this.days);
}

class _SymptomUi {
  final String name;
  final IconData icon;
  final Color color;
  final Color background;
  const _SymptomUi(this.name, this.icon, this.color, this.background);
}

class _RiskUi {
  final String label;
  final Color color;
  const _RiskUi(this.label, this.color);
}

class _MetricCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color iconColor;
  final Color iconBackground;
  final Color? valueColor;

  const _MetricCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.iconColor,
    required this.iconBackground,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 105,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE5EDF5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(label, style: const TextStyle(color: Color(0xFF748198), fontSize: 11, fontWeight: FontWeight.w600)),
              ),
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(color: iconBackground, shape: BoxShape.circle),
                child: Icon(icon, color: iconColor, size: 16),
              ),
            ],
          ),
          const Spacer(),
          Text(value, style: TextStyle(color: valueColor ?? const Color(0xFF172033), fontSize: 20, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

class _RecordRow extends StatelessWidget {
  final String date;
  final String status;
  final Color statusColor;
  final String value;

  const _RecordRow({
    required this.date,
    required this.status,
    required this.statusColor,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(date, style: const TextStyle(color: Color(0xFF172033), fontSize: 12, fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Container(width: 7, height: 7, decoration: BoxDecoration(color: statusColor, shape: BoxShape.circle)),
                    const SizedBox(width: 6),
                    Text(status, style: TextStyle(color: statusColor, fontSize: 10.5, fontWeight: FontWeight.w700)),
                  ],
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(color: const Color(0xFFF3F7FB), borderRadius: BorderRadius.circular(99)),
            child: Text(value, style: const TextStyle(color: Color(0xFF172033), fontSize: 12, fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
  }
}

class _EmptyRow extends StatelessWidget {
  final String text;
  const _EmptyRow(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24),
      child: Center(
        child: Text(text, style: const TextStyle(color: Color(0xFF748198), fontSize: 12)),
      ),
    );
  }
}
