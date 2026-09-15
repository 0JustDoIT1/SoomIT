import 'package:flutter/material.dart';

import 'models/symptom_log.dart';
import 'services/symptom_service.dart';
import 'symptom_constants.dart';
import 'symptom_date_utils.dart';
import 'symptom_form_screen.dart';
import 'symptom_status_style.dart';
import 'widgets/symptom_trend_chart.dart';

class SymptomScreen extends StatefulWidget {
  const SymptomScreen({super.key});

  @override
  State<SymptomScreen> createState() => _SymptomScreenState();
}

class _SymptomScreenState extends State<SymptomScreen> {
  final SymptomService _symptomService = SymptomService();

  late Future<List<SymptomLog>> _symptomFuture;
  String _selectedSymptomType = symptomTypes.first;
  _TrendPeriod _selectedPeriod = _TrendPeriod.thirtyDays;

  @override
  void initState() {
    super.initState();
    _symptomFuture = _symptomService.getSymptomLogs();
  }

  Future<void> _refresh() async {
    setState(() {
      _symptomFuture = _symptomService.getSymptomLogs();
    });

    await _symptomFuture;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F8FA),
      appBar: AppBar(
        title: const Text(
          '증상 기록',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: FutureBuilder<List<SymptomLog>>(
            future: _symptomFuture,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }

              if (snapshot.hasError) {
                return ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(20),
                  children: [
                    const SizedBox(height: 120),
                    const Icon(Icons.error_outline, size: 48),
                    const SizedBox(height: 16),
                    const Center(
                      child: Text(
                        '증상 기록을 불러오지 못했습니다.',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Center(
                      child: Text(
                        '${snapshot.error}',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ],
                );
              }

              final symptoms = snapshot.data ?? [];
              final selectedSymptoms =
                  symptoms
                      .where(
                        (symptom) =>
                            symptom.symptomType == _selectedSymptomType,
                      )
                      .toList()
                    ..sort(_compareSymptomsByRecordedTime);
              final trendSymptoms = _latestRecordPerKoreaDate(
                _filterByPeriod(selectedSymptoms),
              );

              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 16,
                ),
                children: [
                  const Text(
                    '현재 증상을 기록하고 이전 기록을 확인하세요.',
                    style: TextStyle(fontSize: 14),
                  ),

                  const SizedBox(height: 20),

                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: FilledButton.icon(
                      onPressed: () async {
                        final result = await Navigator.push<bool>(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const SymptomFormScreen(),
                          ),
                        );

                        if (result == true) {
                          await _refresh();
                        }
                      },
                      icon: const Icon(Icons.add),
                      label: const Text('새 증상 기록하기'),
                    ),
                  ),

                  const SizedBox(height: 28),

                  _SymptomTrendSection(
                    selectedSymptomType: _selectedSymptomType,
                    selectedPeriod: _selectedPeriod,
                    allSelectedSymptoms: selectedSymptoms,
                    trendSymptoms: trendSymptoms,
                    onSymptomChanged: (value) {
                      setState(() {
                        _selectedSymptomType = value;
                      });
                    },
                    onPeriodChanged: (value) {
                      setState(() {
                        _selectedPeriod = value;
                      });
                    },
                  ),

                  const SizedBox(height: 12),

                  const _SelfCareNotice(),

                  const SizedBox(height: 28),

                  const Text(
                    '최근 기록',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),

                  const SizedBox(height: 12),

                  if (symptoms.isEmpty)
                    const _EmptySymptomView()
                  else
                    ...symptoms.map(
                      (symptom) => _SymptomCard(symptom: symptom),
                    ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  List<SymptomLog> _filterByPeriod(List<SymptomLog> symptoms) {
    final days = _selectedPeriod.days;

    if (days == null) {
      return symptoms;
    }

    final koreaNow = toKoreaTime(DateTime.now());
    final today = DateTime.utc(koreaNow.year, koreaNow.month, koreaNow.day);
    final firstDay = today.subtract(Duration(days: days - 1));

    return symptoms.where((symptom) {
      final koreaTime = toKoreaTime(symptom.loggedAt);
      final recordDate = DateTime.utc(
        koreaTime.year,
        koreaTime.month,
        koreaTime.day,
      );
      return !recordDate.isBefore(firstDay);
    }).toList();
  }

  List<SymptomLog> _latestRecordPerKoreaDate(List<SymptomLog> symptoms) {
    final latestByDate = <String, SymptomLog>{};

    for (final symptom in symptoms) {
      latestByDate[koreaDateKey(symptom.loggedAt)] = symptom;
    }

    return latestByDate.values.toList();
  }

  int _compareSymptomsByRecordedTime(SymptomLog a, SymptomLog b) {
    final loggedAtComparison = a.loggedAt.compareTo(b.loggedAt);

    if (loggedAtComparison != 0) {
      return loggedAtComparison;
    }

    final createdAtComparison = a.createdAt.compareTo(b.createdAt);

    if (createdAtComparison != 0) {
      return createdAtComparison;
    }

    return a.id.compareTo(b.id);
  }
}

enum _TrendPeriod {
  sevenDays('7일', 7),
  thirtyDays('30일', 30),
  all('전체', null);

  final String label;
  final int? days;

  const _TrendPeriod(this.label, this.days);
}

class _SymptomTrendSection extends StatelessWidget {
  final String selectedSymptomType;
  final _TrendPeriod selectedPeriod;
  final List<SymptomLog> allSelectedSymptoms;
  final List<SymptomLog> trendSymptoms;
  final ValueChanged<String> onSymptomChanged;
  final ValueChanged<_TrendPeriod> onPeriodChanged;

  const _SymptomTrendSection({
    required this.selectedSymptomType,
    required this.selectedPeriod,
    required this.allSelectedSymptoms,
    required this.trendSymptoms,
    required this.onSymptomChanged,
    required this.onPeriodChanged,
  });

  @override
  Widget build(BuildContext context) {
    final latest = allSelectedSymptoms.isEmpty
        ? null
        : allSelectedSymptoms.last;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '증상 변화',
            style: TextStyle(
              color: Color(0xFF191F28),
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: selectedSymptomType,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: '확인할 증상',
              border: OutlineInputBorder(),
              contentPadding: EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 12,
              ),
            ),
            items: symptomTypes
                .map(
                  (symptom) =>
                      DropdownMenuItem(value: symptom, child: Text(symptom)),
                )
                .toList(),
            onChanged: (value) {
              if (value != null) {
                onSymptomChanged(value);
              }
            },
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _TrendPeriod.values.map((period) {
              return ChoiceChip(
                label: Text(period.label),
                selected: selectedPeriod == period,
                onSelected: (_) => onPeriodChanged(period),
              );
            }).toList(),
          ),
          const SizedBox(height: 16),
          if (latest != null)
            _LatestStatusSummary(
              symptomType: selectedSymptomType,
              symptom: latest,
            ),
          const SizedBox(height: 12),
          if (trendSymptoms.isEmpty)
            _EmptyTrendView(
              symptomType: selectedSymptomType,
              hasOtherPeriodRecords: allSelectedSymptoms.isNotEmpty,
            )
          else
            SymptomTrendChart(symptoms: trendSymptoms),
        ],
      ),
    );
  }
}

class _LatestStatusSummary extends StatelessWidget {
  final String symptomType;
  final SymptomLog symptom;

  const _LatestStatusSummary({
    required this.symptomType,
    required this.symptom,
  });

  @override
  Widget build(BuildContext context) {
    final style = symptomStatusStyle(symptom.riskLevel);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: style.backgroundColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 8,
        runSpacing: 4,
        children: [
          Icon(style.icon, size: 20, color: style.foregroundColor),
          Text(
            '현재 $symptomType 상태: ${symptom.riskLevelLabel}',
            style: TextStyle(
              color: style.foregroundColor,
              fontWeight: FontWeight.w700,
            ),
          ),
          Text(
            '${symptom.severity} / 10',
            style: TextStyle(
              color: style.foregroundColor,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyTrendView extends StatelessWidget {
  final String symptomType;
  final bool hasOtherPeriodRecords;

  const _EmptyTrendView({
    required this.symptomType,
    required this.hasOtherPeriodRecords,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 28),
      decoration: BoxDecoration(
        color: const Color(0xFFF7F8FA),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          const Icon(
            Icons.show_chart_rounded,
            size: 36,
            color: Color(0xFF8B95A1),
          ),
          const SizedBox(height: 10),
          Text(
            hasOtherPeriodRecords
                ? '선택한 기간에 $symptomType 기록이 없습니다.'
                : '아직 $symptomType 기록이 없습니다.',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Color(0xFF4E5968),
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _SelfCareNotice extends StatelessWidget {
  const _SelfCareNotice();

  @override
  Widget build(BuildContext context) {
    return const Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.info_outline, size: 18, color: Color(0xFF8B95A1)),
        SizedBox(width: 8),
        Expanded(
          child: Text(
            '정상·주의·위험 상태는 의료진의 진단이 아닌 자기관리 참고용입니다.',
            style: TextStyle(
              color: Color(0xFF4E5968),
              fontSize: 12,
              height: 1.4,
            ),
          ),
        ),
      ],
    );
  }
}

class _EmptySymptomView extends StatelessWidget {
  const _EmptySymptomView();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 36),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: const Column(
        children: [
          Icon(Icons.monitor_heart_outlined, size: 42),
          SizedBox(height: 12),
          Text(
            '아직 기록된 증상이 없습니다.',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _SymptomCard extends StatelessWidget {
  final SymptomLog symptom;

  const _SymptomCard({required this.symptom});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    symptom.symptomType,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),

                _RiskBadge(
                  riskLevel: symptom.riskLevel,
                  riskLabel: symptom.riskLevelLabel,
                ),
              ],
            ),

            const SizedBox(height: 12),

            Row(
              children: [
                const Icon(Icons.speed, size: 18),
                const SizedBox(width: 6),
                Text(
                  '심각도 ${symptom.severity} / 10',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ],
            ),

            if (symptom.symptomDescription != null &&
                symptom.symptomDescription!.trim().isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                symptom.symptomDescription!,
                style: const TextStyle(fontSize: 14),
              ),
            ],

            const SizedBox(height: 12),

            Text(
              _formatDateTime(symptom.loggedAt),
              style: TextStyle(
                fontSize: 12,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatDateTime(DateTime dateTime) {
    final local = toKoreaTime(dateTime);
  
    final year = local.year;
    final month = local.month.toString().padLeft(2, '0');
    final day = local.day.toString().padLeft(2, '0');
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
  
    return '$year.$month.$day $hour:$minute';
  }
}

class _RiskBadge extends StatelessWidget {
  final String riskLevel;
  final String riskLabel;

  const _RiskBadge({required this.riskLevel, required this.riskLabel});

  @override
  Widget build(BuildContext context) {
    final style = symptomStatusStyle(riskLevel);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: style.backgroundColor,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(style.icon, size: 16, color: style.foregroundColor),
          const SizedBox(width: 4),
          Text(
            riskLabel,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: style.foregroundColor,
            ),
          ),
        ],
      ),
    );
  }
}
