import 'package:flutter/material.dart';

import 'services/symptom_service.dart';

class SymptomFormScreen extends StatefulWidget {
  const SymptomFormScreen({super.key});

  @override
  State<SymptomFormScreen> createState() => _SymptomFormScreenState();
}

class _SymptomFormScreenState extends State<SymptomFormScreen> {
  final SymptomService _symptomService = SymptomService();
  final TextEditingController _descriptionController =
      TextEditingController();

  final List<String> _symptomTypes = [
    '기침',
    '호흡곤란',
    '흉통',
    '가래',
    '객혈',
    '피로',
    '발열',
    '기타',
  ];

  String _selectedSymptomType = '기침';
  double _severity = 3;
  bool _isSubmitting = false;

  @override
  void dispose() {
    _descriptionController.dispose();
    super.dispose();
  }

  String _getRiskLevel(int severity) {
    if (severity >= 8) {
      return 'RED';
    }

    if (severity >= 4) {
      return 'YELLOW';
    }

    return 'GREEN';
  }

  String _getRiskLabel(String riskLevel) {
    switch (riskLevel) {
      case 'RED':
        return '위험';
      case 'YELLOW':
        return '주의';
      default:
        return '정상';
    }
  }

  Future<void> _submit() async {
    if (_isSubmitting) {
      return;
    }

    setState(() {
      _isSubmitting = true;
    });

    try {
      final severity = _severity.round();
      final riskLevel = _getRiskLevel(severity);

      await _symptomService.createSymptomLog(
        symptomType: _selectedSymptomType,
        symptomDescription:
            _descriptionController.text.trim().isEmpty
                ? null
                : _descriptionController.text.trim(),
        severity: severity,
        riskLevel: riskLevel,
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('증상이 기록되었습니다.'),
        ),
      );

      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '증상 기록 저장에 실패했습니다.\n$e',
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final severity = _severity.round();
    final riskLevel = _getRiskLevel(severity);

    return Scaffold(
      appBar: AppBar(
        title: const Text('증상 기록'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                '증상 종류',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),

              const SizedBox(height: 10),

              DropdownButtonFormField<String>(
                initialValue: _selectedSymptomType,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                ),
                items: _symptomTypes
                    .map(
                      (symptom) => DropdownMenuItem(
                        value: symptom,
                        child: Text(symptom),
                      ),
                    )
                    .toList(),
                onChanged: (value) {
                  if (value == null) return;

                  setState(() {
                    _selectedSymptomType = value;
                  });
                },
              ),

              const SizedBox(height: 28),

              Row(
                children: [
                  const Expanded(
                    child: Text(
                      '증상 심각도',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  Text(
                    '$severity / 10',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),

              Slider(
                value: _severity,
                min: 0,
                max: 10,
                divisions: 10,
                label: '$severity',
                onChanged: (value) {
                  setState(() {
                    _severity = value;
                  });
                },
              ),

              const SizedBox(height: 8),

              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Theme.of(context)
                      .colorScheme
                      .surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '현재 상태: ${_getRiskLabel(riskLevel)}',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),

              const SizedBox(height: 28),

              const Text(
                '상세 내용',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),

              const SizedBox(height: 10),

              TextField(
                controller: _descriptionController,
                minLines: 4,
                maxLines: 6,
                decoration: const InputDecoration(
                  hintText: '증상이 언제부터 시작됐는지, 어떤 상황에서 심해지는지 입력해주세요.',
                  border: OutlineInputBorder(),
                ),
              ),

              const SizedBox(height: 32),

              SizedBox(
                width: double.infinity,
                height: 52,
                child: FilledButton(
                  onPressed:
                      _isSubmitting ? null : _submit,
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                          ),
                        )
                      : const Text(
                          '기록하기',
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}