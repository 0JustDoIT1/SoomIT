import 'package:flutter/material.dart';

import '../home/services/questionnaire_service.dart';
import 'models/patient_questionnaire.dart';

class QuestionnaireFormScreen extends StatefulWidget {
  final PatientQuestionnaire? questionnaire;

  const QuestionnaireFormScreen({super.key, this.questionnaire});

  bool get isEditMode => questionnaire != null;

  @override
  State<QuestionnaireFormScreen> createState() =>
      _QuestionnaireFormScreenState();
}

class _QuestionnaireFormScreenState extends State<QuestionnaireFormScreen> {
  final QuestionnaireService _questionnaireService = QuestionnaireService();

  String? _smoking;
  bool? _cough;
  bool? _dyspnea;

  bool _isSubmitting = false;

  bool get _isEditMode => widget.questionnaire != null;

  @override
  void initState() {
    super.initState();

    _loadExistingResponses();
  }

  // =========================================================
  // 수정 모드 기존 응답 불러오기
  // =========================================================

  void _loadExistingResponses() {
    final questionnaire = widget.questionnaire;

    if (questionnaire == null) {
      return;
    }

    final responses = questionnaire.responses;

    _smoking = responses['smoking']?.toString();

    final cough = responses['cough'];

    if (cough is bool) {
      _cough = cough;
    }

    final dyspnea = responses['dyspnea'];

    if (dyspnea is bool) {
      _dyspnea = dyspnea;
    }
  }

  // =========================================================
  // 제출 / 수정
  // =========================================================

  Future<void> _submit() async {
    if (_smoking == null || _cough == null || _dyspnea == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('모든 문항에 응답해주세요.')));

      return;
    }

    if (_isSubmitting) {
      return;
    }

    setState(() {
      _isSubmitting = true;
    });

    final responses = <String, dynamic>{
      'smoking': _smoking,
      'cough': _cough,
      'dyspnea': _dyspnea,
    };

    try {
      if (_isEditMode) {
        await _questionnaireService.updateQuestionnaire(
          questionnaireId: widget.questionnaire!.id,
          responses: responses,
        );
      } else {
        await _questionnaireService.submitQuestionnaire(
          questionnaireType: '초진 문진표',
          questionnaireVersion: '1.0',
          responses: responses,
        );
      }

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_isEditMode ? '문진표가 수정되었습니다.' : '문진표가 제출되었습니다.'),
        ),
      );

      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_isEditMode ? '문진표 수정에 실패했습니다.' : '문진표 제출에 실패했습니다.'),
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

  // =========================================================
  // 화면
  // =========================================================

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F6F9),

      appBar: AppBar(
        title: Text(
          _isEditMode ? '문진표 수정' : '문진표 작성',
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),

        backgroundColor: Colors.white,

        foregroundColor: const Color(0xFF191F28),

        surfaceTintColor: Colors.white,

        elevation: 0,
      ),

      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 22, 20, 32),

        children: [
          // ===================================================
          // 상단 안내
          // ===================================================
          Text(
            _isEditMode ? '작성한 문진표를 수정합니다.' : '초진 문진표',

            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: Color(0xFF191F28),
            ),
          ),

          const SizedBox(height: 8),

          Text(
            _isEditMode
                ? '기존 응답을 확인하고 변경할 항목을 수정해주세요.'
                : '현재 상태에 맞게 문항에 응답해주세요.',

            style: const TextStyle(
              fontSize: 14,
              height: 1.5,
              color: Color(0xFF6B7684),
            ),
          ),

          if (_isEditMode) ...[
            const SizedBox(height: 14),

            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),

              decoration: BoxDecoration(
                color: const Color(0xFFEAF5FF),

                borderRadius: BorderRadius.circular(14),
              ),

              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,

                children: [
                  Icon(
                    Icons.edit_note_rounded,
                    size: 19,
                    color: Color(0xFF2F8DFE),
                  ),

                  SizedBox(width: 8),

                  Expanded(
                    child: Text(
                      '수정 완료 후 기존 문진표에 변경 내용이 반영됩니다.',
                      style: TextStyle(
                        fontSize: 12,
                        height: 1.45,
                        color: Color(0xFF4E5968),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 28),

          // ===================================================
          // 1. 흡연 여부
          // ===================================================
          _buildQuestionTitle('1. 현재 또는 과거 흡연 여부를 선택해주세요.'),

          const SizedBox(height: 8),

          _buildSmokingChoices(),

          const SizedBox(height: 24),

          const Divider(),

          const SizedBox(height: 24),

          // ===================================================
          // 2. 기침
          // ===================================================
          _buildQuestionTitle('2. 최근 기침 증상이 있습니까?'),

          const SizedBox(height: 8),

          _buildBoolChoices(
            value: _cough,
            onChanged: (value) {
              setState(() {
                _cough = value;
              });
            },
          ),

          const SizedBox(height: 24),

          const Divider(),

          const SizedBox(height: 24),

          // ===================================================
          // 3. 호흡곤란
          // ===================================================
          _buildQuestionTitle('3. 숨이 차거나 호흡이 불편한 증상이 있습니까?'),

          const SizedBox(height: 8),

          _buildBoolChoices(
            value: _dyspnea,
            onChanged: (value) {
              setState(() {
                _dyspnea = value;
              });
            },
          ),

          const SizedBox(height: 34),

          // ===================================================
          // 제출 버튼
          // ===================================================
          SizedBox(
            height: 52,

            child: FilledButton(
              onPressed: _isSubmitting ? null : _submit,

              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF4DA8FF),

                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),

              child: _isSubmitting
                  ? const SizedBox(
                      width: 22,
                      height: 22,

                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Text(
                      _isEditMode ? '수정 완료' : '문진표 제출',

                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
            ),
          ),

          const SizedBox(height: 24),
        ],
      ),
    );
  }

  // =========================================================
  // 질문 제목
  // =========================================================

  Widget _buildQuestionTitle(String title) {
    return Text(
      title,

      style: const TextStyle(
        fontSize: 16,

        fontWeight: FontWeight.w600,

        color: Color(0xFF191F28),

        height: 1.45,
      ),
    );
  }

  // =========================================================
  // 흡연 선택
  // =========================================================

  Widget _buildSmokingChoices() {
    return RadioGroup<String>(
      groupValue: _smoking,

      onChanged: (value) {
        setState(() {
          _smoking = value;
        });
      },

      child: Column(
        children: const [
          RadioListTile<String>(
            contentPadding: EdgeInsets.zero,

            title: Text('비흡연'),

            value: '비흡연',
          ),

          RadioListTile<String>(
            contentPadding: EdgeInsets.zero,

            title: Text('과거흡연'),

            value: '과거흡연',
          ),

          RadioListTile<String>(
            contentPadding: EdgeInsets.zero,

            title: Text('현재흡연'),

            value: '현재흡연',
          ),
        ],
      ),
    );
  }

  // =========================================================
  // 예 / 아니오
  // =========================================================

  Widget _buildBoolChoices({
    required bool? value,
    required ValueChanged<bool?> onChanged,
  }) {
    return RadioGroup<bool>(
      groupValue: value,

      onChanged: onChanged,

      child: Column(
        children: const [
          RadioListTile<bool>(
            contentPadding: EdgeInsets.zero,

            title: Text('예'),

            value: true,
          ),

          RadioListTile<bool>(
            contentPadding: EdgeInsets.zero,

            title: Text('아니오'),

            value: false,
          ),
        ],
      ),
    );
  }
}
