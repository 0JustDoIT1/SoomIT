import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/symptom_log.dart';
import '../symptom_date_utils.dart';
import '../symptom_status_style.dart';

class SymptomTrendChart extends StatelessWidget {
  final List<SymptomLog> symptoms;

  const SymptomTrendChart({super.key, required this.symptoms});

  @override
  Widget build(BuildContext context) {
    final spots = List<FlSpot>.generate(
      symptoms.length,
      (index) => FlSpot(index.toDouble(), symptoms[index].severity.toDouble()),
    );

    final hasSingleRecord = symptoms.length == 1;

    return LayoutBuilder(
      builder: (context, constraints) {
        final chartWidth = math.max(
          constraints.maxWidth,
          symptoms.length * 48.0,
        );

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '증상 정도(0~10점)',
              style: TextStyle(
                color: Color(0xFF191F28),
                fontSize: 14,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              '0점에 가까울수록 증상이 약하고, 10점에 가까울수록 심합니다.',
              style: TextStyle(
                color: Color(0xFF4E5968),
                fontSize: 12,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 230,
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: SizedBox(
                  width: chartWidth,
                  child: Padding(
                    padding: const EdgeInsets.only(top: 12, right: 16),
                    child: LineChart(
                      LineChartData(
                        minX: hasSingleRecord ? -0.5 : 0,
                        maxX: hasSingleRecord
                            ? 0.5
                            : (symptoms.length - 1).toDouble(),
                        minY: 0,
                        maxY: 10,
                        clipData: const FlClipData.all(),
                        gridData: FlGridData(
                          drawVerticalLine: false,
                          horizontalInterval: 2,
                          getDrawingHorizontalLine: (value) => FlLine(
                            color: const Color(0xFFE9EDF2),
                            strokeWidth: 1,
                          ),
                        ),
                        borderData: FlBorderData(
                          show: true,
                          border: const Border(
                            left: BorderSide(color: Color(0xFFD1D5DB)),
                            bottom: BorderSide(color: Color(0xFFD1D5DB)),
                          ),
                        ),
                        titlesData: FlTitlesData(
                          topTitles: const AxisTitles(
                            sideTitles: SideTitles(showTitles: false),
                          ),
                          rightTitles: const AxisTitles(
                            sideTitles: SideTitles(showTitles: false),
                          ),
                          leftTitles: AxisTitles(
                            sideTitles: SideTitles(
                              showTitles: true,
                              reservedSize: 32,
                              interval: 2,
                              getTitlesWidget: (value, meta) => SideTitleWidget(
                                meta: meta,
                                space: 8,
                                child: Text(
                                  value.toInt().toString(),
                                  style: const TextStyle(
                                    color: Color(0xFF8B95A1),
                                    fontSize: 11,
                                  ),
                                ),
                              ),
                            ),
                          ),
                          bottomTitles: AxisTitles(
                            sideTitles: SideTitles(
                              showTitles: true,
                              reservedSize: 34,
                              interval: 1,
                              getTitlesWidget: _bottomTitle,
                            ),
                          ),
                        ),
                        lineTouchData: LineTouchData(
                          handleBuiltInTouches: true,
                          touchTooltipData: LineTouchTooltipData(
                            fitInsideHorizontally: true,
                            fitInsideVertically: true,
                            getTooltipColor: (spot) {
                              final symptom = symptoms[spot.spotIndex];
                              return symptomStatusStyle(
                                symptom.riskLevel,
                              ).foregroundColor;
                            },
                            getTooltipItems: (touchedSpots) {
                              return touchedSpots.map((spot) {
                                final symptom = symptoms[spot.spotIndex];
                                final date = DateFormat(
                                  'yyyy.MM.dd',
                                ).format(toKoreaTime(symptom.loggedAt));

                                return LineTooltipItem(
                                  '$date\n${symptom.severity}/10 · '
                                  '${symptom.riskLevelLabel}',
                                  const TextStyle(
                                    color: Colors.white,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                  ),
                                );
                              }).toList();
                            },
                          ),
                        ),
                        lineBarsData: [
                          LineChartBarData(
                            spots: spots,
                            color: const Color(0xFF2B66F6),
                            barWidth: 3,
                            isCurved: false,
                            isStrokeCapRound: true,
                            belowBarData: BarAreaData(
                              show: true,
                              color: const Color(
                                0xFF2B66F6,
                              ).withValues(alpha: 0.08),
                            ),
                            dotData: FlDotData(
                              show: true,
                              getDotPainter: (spot, percent, barData, index) {
                                final style = symptomStatusStyle(
                                  symptoms[index].riskLevel,
                                );

                                return FlDotCirclePainter(
                                  radius: 5,
                                  color: style.foregroundColor,
                                  strokeWidth: 2,
                                  strokeColor: Colors.white,
                                );
                              },
                            ),
                          ),
                        ],
                      ),
                      duration: const Duration(milliseconds: 300),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 4),
            const Center(
              child: Text(
                '기록 날짜',
                style: TextStyle(
                  color: Color(0xFF4E5968),
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _bottomTitle(double value, TitleMeta meta) {
    final index = value.round();

    if (value != index.toDouble() || index < 0 || index >= symptoms.length) {
      return const SizedBox.shrink();
    }

    final interval = math.max(1, (symptoms.length / 4).ceil());
    final isEdge = index == 0 || index == symptoms.length - 1;

    if (!isEdge && index % interval != 0) {
      return const SizedBox.shrink();
    }

    return SideTitleWidget(
      meta: meta,
      space: 8,
      child: Text(
        DateFormat('M/d').format(toKoreaTime(symptoms[index].loggedAt)),
        style: const TextStyle(color: Color(0xFF8B95A1), fontSize: 11),
      ),
    );
  }
}
