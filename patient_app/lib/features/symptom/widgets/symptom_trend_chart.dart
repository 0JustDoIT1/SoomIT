import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../models/symptom_log.dart';
import '../symptom_date_utils.dart';

class SymptomTrendChart extends StatefulWidget {
  final List<SymptomLog> symptoms;

  const SymptomTrendChart({
    super.key,
    required this.symptoms,
  });

  @override
  State<SymptomTrendChart> createState() => _SymptomTrendChartState();
}

class _SymptomTrendChartState extends State<SymptomTrendChart> {
  int? _selectedIndex;

  static const double _chartHeight = 196;
  static const double _leftPadding = 34;
  static const double _rightPadding = 12;
  static const double _topPadding = 12;
  static const double _bottomPadding = 30;

  @override
  void didUpdateWidget(covariant SymptomTrendChart oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.symptoms != widget.symptoms) {
      _selectedIndex = null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final symptoms = [...widget.symptoms]
      ..sort((a, b) => a.loggedAt.compareTo(b.loggedAt));

    if (symptoms.isEmpty) {
      return const SizedBox.shrink();
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final plotWidth = width - _leftPadding - _rightPadding;
        final plotHeight =
            _chartHeight - _topPadding - _bottomPadding;

        double xForIndex(int index) {
          if (symptoms.length == 1) {
            return _leftPadding + plotWidth / 2;
          }

          return _leftPadding +
              plotWidth * index / (symptoms.length - 1);
        }

        double yForSeverity(int severity) {
          return _topPadding +
              plotHeight * (1 - severity.clamp(0, 10) / 10);
        }

        void handleTap(TapDownDetails details) {
          final localX = details.localPosition.dx;
          int nearestIndex = 0;
          double nearestDistance = double.infinity;

          for (int i = 0; i < symptoms.length; i++) {
            final distance = (xForIndex(i) - localX).abs();
            if (distance < nearestDistance) {
              nearestDistance = distance;
              nearestIndex = i;
            }
          }

          setState(() {
            _selectedIndex = nearestIndex;
          });
        }

        final selectedIndex = _selectedIndex;
        final selectedRecord = selectedIndex == null
            ? null
            : symptoms[selectedIndex];
        final selectedX = selectedIndex == null
            ? null
            : xForIndex(selectedIndex);
        final selectedY = selectedRecord == null
            ? null
            : yForSeverity(selectedRecord.severity);

        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapDown: handleTap,
          child: SizedBox(
            width: width,
            height: _chartHeight,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                CustomPaint(
                  size: Size(width, _chartHeight),
                  painter: _TrendChartPainter(
                    symptoms: symptoms,
                    selectedIndex: selectedIndex,
                    leftPadding: _leftPadding,
                    rightPadding: _rightPadding,
                    topPadding: _topPadding,
                    bottomPadding: _bottomPadding,
                  ),
                ),
                if (selectedRecord != null &&
                    selectedX != null &&
                    selectedY != null)
                  Positioned(
                    left: (selectedX - 48)
                        .clamp(
                          2.0,
                          math.max(2.0, width - 98),
                        )
                        .toDouble(),
                    top: (selectedY - 62)
                        .clamp(
                          0.0,
                          _chartHeight - 72,
                        )
                        .toDouble(),
                    child: _ChartTooltip(record: selectedRecord),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _TrendChartPainter extends CustomPainter {
  final List<SymptomLog> symptoms;
  final int? selectedIndex;
  final double leftPadding;
  final double rightPadding;
  final double topPadding;
  final double bottomPadding;

  const _TrendChartPainter({
    required this.symptoms,
    required this.selectedIndex,
    required this.leftPadding,
    required this.rightPadding,
    required this.topPadding,
    required this.bottomPadding,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final plotWidth = size.width - leftPadding - rightPadding;
    final plotHeight = size.height - topPadding - bottomPadding;

    double xForIndex(int index) {
      if (symptoms.length == 1) {
        return leftPadding + plotWidth / 2;
      }

      return leftPadding +
          plotWidth * index / (symptoms.length - 1);
    }

    double yForSeverity(int severity) {
      return topPadding +
          plotHeight * (1 - severity.clamp(0, 10) / 10);
    }

    final gridPaint = Paint()
      ..color = const Color(0xFFE9EEF4)
      ..strokeWidth = 1;

    final axisTextStyle = const TextStyle(
      color: Color(0xFF97A4B2),
      fontSize: 9.5,
      fontWeight: FontWeight.w500,
    );

    for (final value in [0, 2, 4, 6, 8, 10]) {
      final y = topPadding + plotHeight * (1 - value / 10);

      canvas.drawLine(
        Offset(leftPadding, y),
        Offset(size.width - rightPadding, y),
        gridPaint,
      );

      _paintText(
        canvas,
        '$value',
        Offset(leftPadding - 27, y - 6),
        axisTextStyle,
        maxWidth: 22,
        textAlign: TextAlign.right,
      );
    }

    final points = <Offset>[
      for (int i = 0; i < symptoms.length; i++)
        Offset(
          xForIndex(i),
          yForSeverity(symptoms[i].severity),
        ),
    ];

    if (points.length > 1) {
      final areaPath = Path()
        ..moveTo(points.first.dx, topPadding + plotHeight)
        ..lineTo(points.first.dx, points.first.dy);

      for (int i = 1; i < points.length; i++) {
        areaPath.lineTo(points[i].dx, points[i].dy);
      }

      areaPath
        ..lineTo(points.last.dx, topPadding + plotHeight)
        ..close();

      final areaPaint = Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color(0x293198F4),
            Color(0x003198F4),
          ],
        ).createShader(
          Rect.fromLTWH(
            leftPadding,
            topPadding,
            plotWidth,
            plotHeight,
          ),
        );

      canvas.drawPath(areaPath, areaPaint);

      final linePath = Path()
        ..moveTo(points.first.dx, points.first.dy);

      for (int i = 1; i < points.length; i++) {
        linePath.lineTo(points[i].dx, points[i].dy);
      }

      final linePaint = Paint()
        ..color = const Color(0xFF3198F4)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round;

      canvas.drawPath(linePath, linePaint);
    }

    for (int i = 0; i < points.length; i++) {
      final point = points[i];
      final selected = selectedIndex == i;

      canvas.drawCircle(
        point,
        selected ? 6.5 : 5.3,
        Paint()..color = Colors.white,
      );

      canvas.drawCircle(
        point,
        selected ? 4.8 : 3.8,
        Paint()..color = _riskColor(symptoms[i].riskLevel),
      );
    }

    for (final index in _labelIndexes(symptoms.length)) {
      final korea = toKoreaTime(symptoms[index].loggedAt);
      _paintText(
        canvas,
        '${korea.month}/${korea.day}',
        Offset(
          xForIndex(index) - 22,
          size.height - bottomPadding + 9,
        ),
        axisTextStyle,
        maxWidth: 44,
        textAlign: TextAlign.center,
      );
    }
  }

  Set<int> _labelIndexes(int count) {
    if (count <= 5) {
      return {for (int i = 0; i < count; i++) i};
    }

    return {
      0,
      (count / 4).round(),
      (count / 2).round(),
      (count * 3 / 4).round(),
      count - 1,
    };
  }

  void _paintText(
    Canvas canvas,
    String text,
    Offset offset,
    TextStyle style, {
    required double maxWidth,
    TextAlign textAlign = TextAlign.left,
  }) {
    final painter = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
      textAlign: textAlign,
      maxLines: 1,
    )..layout(maxWidth: maxWidth);

    painter.paint(canvas, offset);
  }

  Color _riskColor(String riskLevel) {
    switch (riskLevel) {
      case 'RED':
        return const Color(0xFFE85D67);
      case 'YELLOW':
        return const Color(0xFFD99217);
      default:
        return const Color(0xFF3198F4);
    }
  }

  @override
  bool shouldRepaint(covariant _TrendChartPainter oldDelegate) {
    return oldDelegate.symptoms != symptoms ||
        oldDelegate.selectedIndex != selectedIndex;
  }
}

class _ChartTooltip extends StatelessWidget {
  final SymptomLog record;

  const _ChartTooltip({
    required this.record,
  });

  @override
  Widget build(BuildContext context) {
    final korea = toKoreaTime(record.loggedAt);

    return Container(
      width: 96,
      padding: const EdgeInsets.symmetric(
        horizontal: 10,
        vertical: 8,
      ),
      decoration: BoxDecoration(
        color: const Color(0xFF172033),
        borderRadius: BorderRadius.circular(11),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.12),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '${korea.month}월 ${korea.day}일',
            style: const TextStyle(
              color: Color(0xFFC7D0DA),
              fontSize: 9.5,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            '${record.severity}점 · ${record.riskLevelLabel}',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 11,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}
