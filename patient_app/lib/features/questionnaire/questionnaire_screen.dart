import 'package:flutter/material.dart';

import 'models/questionnaire.dart';
import 'services/questionnaire_service.dart';

class QuestionnaireScreen extends StatefulWidget {
  final String? questionnaireId;
  final bool startInEditMode;

  const QuestionnaireScreen({
    super.key,
    this.questionnaireId,
    this.startInEditMode = false,
  });

  @override
  State<QuestionnaireScreen> createState() => _QuestionnaireScreenState();
}

class _QuestionnaireScreenState extends State<QuestionnaireScreen> {
  final QuestionnaireService _service = QuestionnaireService();

  final TextEditingController _currentSymptomsController =
      TextEditingController();

  final TextEditingController _symptomOnsetController = TextEditingController();

  final TextEditingController _pastHistoryController = TextEditingController();

  final TextEditingController _currentMedicationsController =
      TextEditingController();

  final TextEditingController _allergiesController = TextEditingController();

  String? _smokingHistory;
  String? _dyspnea;
  String? _cough;
  String? _hemoptysis;

  Questionnaire? _questionnaire;

  bool _isLoading = true;
  bool _isSaving = false;
  bool _isEditing = false;

  static const Color _primaryBlue = Color(0xFF3198F4);

  static const Color _strongBlue = Color(0xFF2F8DFE);

  static const Color _background = Color(0xFFF6F8FB);

  static const Color _textPrimary = Color(0xFF172033);

  static const Color _textSecondary = Color(0xFF6B7684);

  static const Color _borderColor = Color(0xFFDDE4EC);

  bool get _isCompleted => _questionnaire?.isCompleted ?? false;

  bool get _canEdit => !_isCompleted || _isEditing;

  @override
  void initState() {
    super.initState();

    _loadQuestionnaire();
  }

  @override
  void dispose() {
    _currentSymptomsController.dispose();
    _symptomOnsetController.dispose();
    _pastHistoryController.dispose();
    _currentMedicationsController.dispose();
    _allergiesController.dispose();

    super.dispose();
  }

  // =========================================================
  // 문진표 조회
  // =========================================================

  Future<void> _loadQuestionnaire() async {
    try {
      final questionnaires = await _service.getQuestionnaires();

      Questionnaire? selected;

      if (widget.questionnaireId != null) {
        for (final questionnaire in questionnaires) {
          if (questionnaire.id == widget.questionnaireId) {
            selected = questionnaire;
            break;
          }
        }
      } else {
        for (final questionnaire in questionnaires) {
          if (questionnaire.questionnaireType == 'PRE_VISIT') {
            selected = questionnaire;
            break;
          }
        }
      }

      if (selected != null) {
        _questionnaire = selected;

        _applyResponses(selected.responses);

        if (widget.startInEditMode && selected.isCompleted) {
          _isEditing = true;
        }
      }
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('문진표 정보를 불러오지 못했습니다.')));
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  // =========================================================
  // 기존 응답 적용
  // =========================================================

  void _applyResponses(Map<String, dynamic> responses) {
    _currentSymptomsController.text =
        responses['current_symptoms']?.toString() ?? '';

    _symptomOnsetController.text = responses['symptom_onset']?.toString() ?? '';

    _smokingHistory = responses['smoking_history']?.toString();

    _dyspnea = responses['dyspnea']?.toString();

    _cough = responses['cough']?.toString();

    _hemoptysis = responses['hemoptysis']?.toString();

    _pastHistoryController.text = responses['past_history']?.toString() ?? '';

    _currentMedicationsController.text =
        responses['current_medications']?.toString() ?? '';

    _allergiesController.text = responses['allergies']?.toString() ?? '';
  }

  // =========================================================
  // 응답 생성
  // =========================================================

  Map<String, dynamic> _buildResponses() {
    return {
      'current_symptoms': _currentSymptomsController.text.trim(),

      'symptom_onset': _symptomOnsetController.text.trim(),

      'smoking_history': _smokingHistory,

      'dyspnea': _dyspnea,

      'cough': _cough,

      'hemoptysis': _hemoptysis,

      'past_history': _pastHistoryController.text.trim(),

      'current_medications': _currentMedicationsController.text.trim(),

      'allergies': _allergiesController.text.trim(),
    };
  }

  // =========================================================
  // 수정 시작
  // =========================================================

  void _startEditing() {
    setState(() {
      _isEditing = true;
    });
  }

  // =========================================================
  // 수정 취소
  // =========================================================

  void _cancelEditing() {
    final questionnaire = _questionnaire;

    if (questionnaire != null) {
      _applyResponses(questionnaire.responses);
    }

    setState(() {
      _isEditing = false;
    });
  }

  // =========================================================
  // 저장
  // =========================================================

  Future<void> _save({required bool isCompleted}) async {
    if (_isSaving) {
      return;
    }

    if (_isCompleted && !_isEditing) {
      return;
    }

    if (isCompleted && !_validateRequiredFields()) {
      return;
    }

    final wasEditingCompleted = _isCompleted && _isEditing;

    setState(() {
      _isSaving = true;
    });

    try {
      final responses = _buildResponses();

      Questionnaire saved;

      if (_questionnaire == null) {
        saved = await _service.createQuestionnaire(
          responses: responses,
          isCompleted: isCompleted,
        );
      } else {
        saved = await _service.updateQuestionnaire(
          questionnaireId: _questionnaire!.id,

          responses: responses,

          isCompleted: wasEditingCompleted ? true : isCompleted,
        );
      }

      if (!mounted) {
        return;
      }

      setState(() {
        _questionnaire = saved;
        _isEditing = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            wasEditingCompleted
                ? '문진표가 수정되었습니다.'
                : isCompleted
                ? '문진표 작성이 완료되었습니다.'
                : '문진표가 임시저장되었습니다.',
          ),
        ),
      );
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            wasEditingCompleted ? '문진표 수정에 실패했습니다.' : '문진표 저장에 실패했습니다.',
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
        });
      }
    }
  }

  // =========================================================
  // 필수값 검증
  // =========================================================

  bool _validateRequiredFields() {
    if (_currentSymptomsController.text.trim().isEmpty) {
      _showValidationMessage('현재 증상을 입력해주세요.');

      return false;
    }

    if (_symptomOnsetController.text.trim().isEmpty) {
      _showValidationMessage('증상 발생 시기를 입력해주세요.');

      return false;
    }

    if (_smokingHistory == null) {
      _showValidationMessage('흡연력을 선택해주세요.');

      return false;
    }

    if (_dyspnea == null) {
      _showValidationMessage('호흡곤란 여부를 선택해주세요.');

      return false;
    }

    if (_cough == null) {
      _showValidationMessage('기침 여부를 선택해주세요.');

      return false;
    }

    if (_hemoptysis == null) {
      _showValidationMessage('객혈 여부를 선택해주세요.');

      return false;
    }

    return true;
  }

  void _showValidationMessage(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  // =========================================================
  // 화면
  // =========================================================

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        backgroundColor: _background,

        body: Center(child: CircularProgressIndicator(color: _primaryBlue)),
      );
    }

    return Scaffold(
      backgroundColor: _background,

      appBar: AppBar(
        title: Text(
          _isEditing ? '문진표 수정' : '진료 전 문진표',

          style: const TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w700,

            color: _textPrimary,
          ),
        ),

        centerTitle: false,

        backgroundColor: Colors.white,

        foregroundColor: _textPrimary,

        surfaceTintColor: Colors.white,

        elevation: 0,

        scrolledUnderElevation: 0.5,
      ),

      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(12, 18, 12, 28),

                children: [
                  if (_isEditing) _buildEditingBanner(),

                  if (_isCompleted && !_isEditing) _buildCompletedBanner(),

                  if (!_isCompleted) _buildWritingBanner(),

                  const SizedBox(height: 18),

                  // 1
                  _buildQuestionCard(
                    number: 1,

                    title: '현재 불편한 증상을 입력해주세요.',

                    child: _buildTextField(
                      controller: _currentSymptomsController,

                      hintText: '예: 기침, 가슴 통증, 숨참 등',

                      maxLines: 4,

                      maxLength: 500,
                    ),
                  ),

                  // 2
                  _buildQuestionCard(
                    number: 2,

                    title: '증상은 언제부터 시작되었나요?',

                    child: _buildTextField(
                      controller: _symptomOnsetController,

                      hintText: '예: 3일 전, 1주 전',
                    ),
                  ),

                  // 3
                  _buildQuestionCard(
                    number: 3,

                    title: '현재 또는 과거 흡연 여부를 선택해주세요.',

                    child: _buildStringRadioGroup(
                      value: _smokingHistory,

                      options: const ['비흡연', '과거 흡연', '현재 흡연'],

                      onChanged: (value) {
                        setState(() {
                          _smokingHistory = value;
                        });
                      },
                    ),
                  ),

                  // 4
                  _buildQuestionCard(
                    number: 4,

                    title: '숨이 차거나 호흡이 불편한 증상이 있습니까?',

                    child: _buildStringRadioGroup(
                      value: _dyspnea,

                      options: const ['없음', '활동 시 있음', '안정 시에도 있음'],

                      onChanged: (value) {
                        setState(() {
                          _dyspnea = value;
                        });
                      },
                    ),
                  ),

                  // 5
                  _buildQuestionCard(
                    number: 5,

                    title: '최근 기침 증상이 있습니까?',

                    child: _buildStringRadioGroup(
                      value: _cough,

                      options: const ['없음', '있음'],

                      onChanged: (value) {
                        setState(() {
                          _cough = value;
                        });
                      },
                    ),
                  ),

                  // 6
                  _buildQuestionCard(
                    number: 6,

                    title: '최근 객혈 증상이 있습니까?',

                    child: _buildStringRadioGroup(
                      value: _hemoptysis,

                      options: const ['없음', '있음'],

                      onChanged: (value) {
                        setState(() {
                          _hemoptysis = value;
                        });
                      },
                    ),
                  ),

                  // 7
                  _buildQuestionCard(
                    number: 7,

                    title: '기존 질환이나 수술 이력이 있습니까?',

                    child: _buildTextField(
                      controller: _pastHistoryController,

                      hintText: '기존 질환이나 수술 이력이 있다면 입력해주세요.',

                      maxLines: 3,
                    ),
                  ),

                  // 8
                  _buildQuestionCard(
                    number: 8,

                    title: '현재 복용 중인 약이 있습니까?',

                    child: _buildTextField(
                      controller: _currentMedicationsController,

                      hintText: '현재 복용 중인 약이 있다면 입력해주세요.',

                      maxLines: 3,
                    ),
                  ),

                  // 9
                  _buildQuestionCard(
                    number: 9,

                    title: '약물 또는 음식 알레르기가 있습니까?',

                    child: _buildTextField(
                      controller: _allergiesController,

                      hintText: '알레르기가 있다면 입력해주세요.',

                      maxLines: 3,
                    ),
                  ),

                  // 작성 완료 상태에서만
                  // 본문 아래 수정 버튼
                  if (_isCompleted && !_isEditing) ...[
                    const SizedBox(height: 6),

                    _buildEditButton(),
                  ],
                ],
              ),
            ),

            if (!_isCompleted) _buildWriteBottomButtons(),

            if (_isCompleted && _isEditing) _buildEditBottomButtons(),
          ],
        ),
      ),
    );
  }

  // =========================================================
  // 상단 안내 - 수정 중
  // =========================================================

  Widget _buildEditingBanner() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),

      decoration: BoxDecoration(
        color: const Color(0xFFE9F5FF),

        borderRadius: BorderRadius.circular(16),
      ),

      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,

        children: [
          Icon(Icons.edit_note_rounded, size: 23, color: _strongBlue),

          SizedBox(width: 12),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,

              children: [
                Text(
                  '기존 작성 내용을 수정하고 있습니다.',

                  style: TextStyle(
                    fontSize: 14,

                    fontWeight: FontWeight.w700,

                    color: _textPrimary,
                  ),
                ),

                SizedBox(height: 4),

                Text(
                  '내용을 확인하고 수정한 후 완료해주세요.',

                  style: TextStyle(
                    fontSize: 12,

                    height: 1.4,

                    color: _textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // =========================================================
  // 상단 안내 - 작성 완료
  // =========================================================

  Widget _buildCompletedBanner() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),

      decoration: BoxDecoration(
        color: const Color(0xFFECF9EF),

        borderRadius: BorderRadius.circular(16),
      ),

      child: const Row(
        children: [
          Icon(Icons.check_circle_rounded, color: Color(0xFF2FB344)),

          SizedBox(width: 12),

          Expanded(
            child: Text(
              '작성 완료된 문진표입니다.',

              style: TextStyle(
                fontSize: 14,

                fontWeight: FontWeight.w700,

                color: _textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // =========================================================
  // 상단 안내 - 작성 중
  // =========================================================

  Widget _buildWritingBanner() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),

      decoration: BoxDecoration(
        color: const Color(0xFFEAF5FF),

        borderRadius: BorderRadius.circular(16),
      ),

      child: const Row(
        children: [
          Icon(Icons.assignment_outlined, color: _primaryBlue),

          SizedBox(width: 12),

          Expanded(
            child: Text(
              '현재 상태에 맞게 문항에 응답해주세요.',

              style: TextStyle(
                fontSize: 14,

                fontWeight: FontWeight.w600,

                color: _textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // =========================================================
  // 질문 카드
  // =========================================================

  Widget _buildQuestionCard({
    required int number,
    required String title,
    required Widget child,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),

      padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),

      decoration: BoxDecoration(
        color: Colors.white,

        borderRadius: BorderRadius.circular(18),

        border: Border.all(color: const Color(0xFFE4EAF1)),

        boxShadow: const [
          BoxShadow(
            color: Color(0x08000000),

            blurRadius: 10,

            offset: Offset(0, 3),
          ),
        ],
      ),

      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,

        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,

            children: [
              Container(
                width: 42,
                height: 42,

                alignment: Alignment.center,

                decoration: const BoxDecoration(
                  color: Color(0xFFE9F5FF),

                  shape: BoxShape.circle,
                ),

                child: Text(
                  '$number',

                  style: const TextStyle(
                    fontSize: 18,

                    fontWeight: FontWeight.w800,

                    color: _strongBlue,
                  ),
                ),
              ),

              const SizedBox(width: 12),

              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 8),

                  child: Text(
                    title,

                    style: const TextStyle(
                      fontSize: 16,

                      height: 1.4,

                      fontWeight: FontWeight.w700,

                      color: _textPrimary,
                    ),
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          child,
        ],
      ),
    );
  }

  // =========================================================
  // TextField
  // =========================================================

  Widget _buildTextField({
    required TextEditingController controller,
    required String hintText,
    int maxLines = 1,
    int? maxLength,
  }) {
    return TextField(
      controller: controller,

      enabled: _canEdit,

      maxLines: maxLines,

      maxLength: maxLength,

      style: const TextStyle(fontSize: 14, color: _textPrimary),

      decoration: InputDecoration(
        hintText: hintText,

        hintStyle: const TextStyle(fontSize: 14, color: Color(0xFF9AA5B1)),

        counterStyle: const TextStyle(fontSize: 12, color: Color(0xFF8B95A1)),

        filled: true,

        fillColor: _canEdit ? Colors.white : const Color(0xFFF4F6F8),

        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 15,
        ),

        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),

          borderSide: const BorderSide(color: _borderColor),
        ),

        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),

          borderSide: const BorderSide(color: _borderColor),
        ),

        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),

          borderSide: const BorderSide(color: _primaryBlue, width: 1.6),
        ),

        disabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),

          borderSide: const BorderSide(color: Color(0xFFE1E6EC)),
        ),
      ),
    );
  }

  // =========================================================
  // Radio
  // =========================================================

  Widget _buildStringRadioGroup({
    required String? value,
    required List<String> options,
    required ValueChanged<String> onChanged,
  }) {
    return RadioGroup<String>(
      groupValue: value,

      onChanged: (selected) {
        if (!_canEdit) {
          return;
        }

        if (selected != null) {
          onChanged(selected);
        }
      },

      child: Column(
        children: options.map((option) {
          final selected = value == option;

          return Container(
            margin: const EdgeInsets.only(bottom: 4),

            decoration: BoxDecoration(
              color: selected ? const Color(0xFFF3F9FF) : Colors.transparent,

              borderRadius: BorderRadius.circular(12),
            ),

            child: RadioListTile<String>(
              value: option,

              activeColor: _primaryBlue,

              enabled: _canEdit,

              contentPadding: const EdgeInsets.symmetric(horizontal: 4),

              visualDensity: VisualDensity.compact,

              title: Text(
                option,

                style: TextStyle(
                  fontSize: 14,

                  fontWeight: selected ? FontWeight.w600 : FontWeight.w400,

                  color: _canEdit ? _textPrimary : const Color(0xFF8B95A1),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  // =========================================================
  // 조회 상태 수정하기
  // =========================================================

  Widget _buildEditButton() {
    return SizedBox(
      width: double.infinity,

      height: 52,

      child: FilledButton.icon(
        onPressed: _startEditing,

        icon: const Icon(Icons.edit_outlined),

        label: const Text(
          '수정하기',

          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
        ),

        style: FilledButton.styleFrom(
          backgroundColor: _primaryBlue,

          foregroundColor: Colors.white,

          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      ),
    );
  }

  // =========================================================
  // 최초 작성 하단
  // =========================================================

  Widget _buildWriteBottomButtons() {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,

        border: Border(top: BorderSide(color: Color(0xFFE8EDF2))),
      ),

      padding: const EdgeInsets.fromLTRB(12, 12, 12, 14),

      child: Row(
        children: [
          Expanded(
            child: OutlinedButton(
              onPressed: _isSaving
                  ? null
                  : () {
                      _save(isCompleted: false);
                    },

              style: OutlinedButton.styleFrom(
                minimumSize: const Size(0, 52),

                foregroundColor: const Color(0xFF52627A),

                side: const BorderSide(color: Color(0xFF98A5B5)),

                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),

              child: const Text(
                '임시저장',

                style: TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
          ),

          const SizedBox(width: 10),

          Expanded(
            child: FilledButton(
              onPressed: _isSaving
                  ? null
                  : () {
                      _save(isCompleted: true);
                    },

              style: FilledButton.styleFrom(
                minimumSize: const Size(0, 52),

                backgroundColor: _primaryBlue,

                foregroundColor: Colors.white,

                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),

              child: _isSaving
                  ? const SizedBox(
                      width: 20,

                      height: 20,

                      child: CircularProgressIndicator(
                        strokeWidth: 2,

                        color: Colors.white,
                      ),
                    )
                  : const Text(
                      '작성 완료',

                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  // =========================================================
  // 수정 하단
  // =========================================================

  Widget _buildEditBottomButtons() {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,

        border: Border(top: BorderSide(color: Color(0xFFE8EDF2))),
      ),

      padding: const EdgeInsets.fromLTRB(12, 12, 12, 14),

      child: Row(
        children: [
          Expanded(
            child: OutlinedButton(
              onPressed: _isSaving ? null : _cancelEditing,

              style: OutlinedButton.styleFrom(
                minimumSize: const Size(0, 52),

                foregroundColor: const Color(0xFF53647C),

                side: const BorderSide(color: Color(0xFF9AA6B5)),

                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),

              child: const Text(
                '수정 취소',

                style: TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
          ),

          const SizedBox(width: 10),

          Expanded(
            child: FilledButton(
              onPressed: _isSaving
                  ? null
                  : () {
                      _save(isCompleted: true);
                    },

              style: FilledButton.styleFrom(
                minimumSize: const Size(0, 52),

                backgroundColor: _primaryBlue,

                foregroundColor: Colors.white,

                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),

              child: _isSaving
                  ? const SizedBox(
                      width: 20,

                      height: 20,

                      child: CircularProgressIndicator(
                        strokeWidth: 2,

                        color: Colors.white,
                      ),
                    )
                  : const Text(
                      '수정 완료',

                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
