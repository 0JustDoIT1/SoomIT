import 'package:flutter/material.dart';

import 'models/symptom_log.dart';
import 'services/symptom_service.dart';
import 'symptom_form_screen.dart';

class SymptomScreen extends StatefulWidget {
  const SymptomScreen({super.key});

  @override
  State<SymptomScreen> createState() => _SymptomScreenState();
}

class _SymptomScreenState extends State<SymptomScreen> {
  final SymptomService _symptomService = SymptomService();

  late Future<List<SymptomLog>> _symptomFuture;

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
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<SymptomLog>>(
          future: _symptomFuture,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(
                child: CircularProgressIndicator(),
              );
            }

            if (snapshot.hasError) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(20),
                children: [
                  const SizedBox(height: 120),
                  const Icon(
                    Icons.error_outline,
                    size: 48,
                  ),
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

            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.symmetric(
                horizontal: 20,
                vertical: 16,
              ),
              children: [
                const Text(
                  '증상 기록',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                  ),
                ),

                const SizedBox(height: 6),

                const Text(
                  '현재 증상을 기록하고 이전 기록을 확인하세요.',
                  style: TextStyle(
                    fontSize: 14,
                  ),
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
                    label: const Text(
                      '새 증상 기록하기',
                    ),
                  ),
                ),

                const SizedBox(height: 28),

                const Text(
                  '최근 기록',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),

                const SizedBox(height: 12),

                if (symptoms.isEmpty)
                  const _EmptySymptomView()
                else
                  ...symptoms.map(
                    (symptom) => _SymptomCard(
                      symptom: symptom,
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _EmptySymptomView extends StatelessWidget {
  const _EmptySymptomView();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 20,
        vertical: 36,
      ),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: Theme.of(context).colorScheme.outlineVariant,
        ),
      ),
      child: const Column(
        children: [
          Icon(
            Icons.monitor_heart_outlined,
            size: 42,
          ),
          SizedBox(height: 12),
          Text(
            '아직 기록된 증상이 없습니다.',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _SymptomCard extends StatelessWidget {
  final SymptomLog symptom;

  const _SymptomCard({
    required this.symptom,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outlineVariant,
        ),
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
                const Icon(
                  Icons.speed,
                  size: 18,
                ),
                const SizedBox(width: 6),
                Text(
                  '심각도 ${symptom.severity} / 10',
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),

            if (symptom.symptomDescription != null &&
                symptom.symptomDescription!.trim().isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                symptom.symptomDescription!,
                style: const TextStyle(
                  fontSize: 14,
                ),
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
    final local = dateTime.toLocal();

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

  const _RiskBadge({
    required this.riskLevel,
    required this.riskLabel,
  });

  @override
  Widget build(BuildContext context) {
    IconData icon;

    switch (riskLevel) {
      case 'RED':
        icon = Icons.error_outline;
        break;

      case 'YELLOW':
        icon = Icons.warning_amber_rounded;
        break;

      default:
        icon = Icons.check_circle_outline;
    }

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 10,
        vertical: 6,
      ),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 16,
          ),
          const SizedBox(width: 4),
          Text(
            riskLabel,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}