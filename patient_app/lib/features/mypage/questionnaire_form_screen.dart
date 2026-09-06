import 'package:flutter/material.dart';

import '../home/services/questionnaire_service.dart';

class QuestionnaireFormScreen extends StatefulWidget {
  const QuestionnaireFormScreen({super.key});

  @override
  State<QuestionnaireFormScreen> createState() =>
      _QuestionnaireFormScreenState();
}

class _QuestionnaireFormScreenState
    extends State<QuestionnaireFormScreen> {
  final QuestionnaireService _questionnaireService =
      QuestionnaireService();

  String? _smoking;
  bool? _cough;
  bool? _dyspnea;

  bool _isSubmitting = false;

  Future<void> _submit() async {
    if (_smoking == null || _cough == null || _dyspnea == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('모든 문항에 응답해주세요.'),
        ),
      );
      return;
    }

    setState(() {
      _isSubmitting = true;
    });

    try {
      await _questionnaireService.submitQuestionnaire(
        questionnaireType: '초진 문진표',
        questionnaireVersion: '1.0',
        responses: {
          'smoking': _smoking,
          'cough': _cough,
          'dyspnea': _dyspnea,
        },
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('문진표가 제출되었습니다.'),
        ),
      );

      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('문진표 제출에 실패했습니다.'),
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('문진표 작성'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            '초진 문진표',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
            ),
          ),

          const SizedBox(height: 8),

          const Text(
            '현재 상태에 맞게 문항에 응답해주세요.',
          ),

          const SizedBox(height: 32),

          // 1. 흡연 여부
          const Text(
            '1. 현재 또는 과거 흡연 여부를 선택해주세요.',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),

          RadioGroup<String>(
            groupValue: _smoking,
            onChanged: (value) {
              setState(() {
                _smoking = value;
              });
            },
            child: Column(
              children: [
                RadioListTile<String>(
                  title: const Text('비흡연'),
                  value: '비흡연',
                ),
                RadioListTile<String>(
                  title: const Text('과거흡연'),
                  value: '과거흡연',
                ),
                RadioListTile<String>(
                  title: const Text('현재흡연'),
                  value: '현재흡연',
                ),
              ],
            ),
          ),

          const Divider(height: 40),

          // 2. 기침
          const Text(
            '2. 최근 기침 증상이 있습니까?',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),

          RadioGroup<bool>(
            groupValue: _cough,
            onChanged: (value) {
              setState(() {
                _cough = value;
              });
            },
            child: Column(
              children: const [
                RadioListTile<bool>(
                  title: Text('예'),
                  value: true,
                ),
                RadioListTile<bool>(
                  title: Text('아니오'),
                  value: false,
                ),
              ],
            ),
          ),

          const Divider(height: 40),

          // 3. 호흡곤란
          const Text(
            '3. 숨이 차거나 호흡이 불편한 증상이 있습니까?',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),

          RadioGroup<bool>(
            groupValue: _dyspnea,
            onChanged: (value) {
              setState(() {
                _dyspnea = value;
              });
            },
            child: Column(
              children: const [
                RadioListTile<bool>(
                  title: Text('예'),
                  value: true,
                ),
                RadioListTile<bool>(
                  title: Text('아니오'),
                  value: false,
                ),
              ],
            ),
          ),

          const SizedBox(height: 32),

          SizedBox(
            height: 52,
            child: FilledButton(
              onPressed: _isSubmitting ? null : _submit,
              child: _isSubmitting
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                      ),
                    )
                  : const Text('문진표 제출'),
            ),
          ),

          const SizedBox(height: 24),
        ],
      ),
    );
  }
}