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
    // 심각도가 매우 높은 경우
    if (severity >= 8) {
      return 'RED';
    }
  
    // 주의가 필요한 증상
    if (_selectedSymptomType == '객혈' ||
        _selectedSymptomType == '호흡곤란' ||
        _selectedSymptomType == '흉통') {
      // 해당 증상이 중등도 이상이면 위험
      if (severity >= 5) {
        return 'RED';
      }
  
      // 경증이어도 주의
      return 'YELLOW';
    }
  
    // 일반 증상
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
  
      // 최종 위험도는 Django 서버에서 판정
      final createdSymptom = await _symptomService.createSymptomLog(
        symptomType: _selectedSymptomType,
        symptomDescription: _descriptionController.text.trim().isEmpty
            ? null
            : _descriptionController.text.trim(),
        severity: severity,
      );
  
      if (!mounted) return;
  
      // 서버가 RED로 판정한 경우 위험 안내
      if (createdSymptom.riskLevel == 'RED') {
        await showDialog<void>(
          context: context,
          barrierDismissible: false,
          builder: (dialogContext) {
            return AlertDialog(
              icon: const Icon(
                Icons.warning_amber_rounded,
                color: Color(0xFFD32F2F),
                size: 40,
              ),
              title: const Text(
                '주의가 필요한 증상입니다',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                ),
              ),
              content: const Text(
                '현재 기록한 증상의 위험도가 높습니다.\n\n'
                '증상이 지속되거나 악화되는 경우 의료진과 상담하세요. '
                '심한 호흡곤란, 심한 흉통, 많은 양의 객혈 등 응급 증상이 있는 경우 '
                '즉시 응급실을 이용하거나 119에 연락하세요.',
                textAlign: TextAlign.center,
              ),
              actions: [
                FilledButton(
                  onPressed: () {
                    Navigator.pop(dialogContext);
                  },
                  child: const Text('확인'),
                ),
              ],
            );
          },
        );
      }
  
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