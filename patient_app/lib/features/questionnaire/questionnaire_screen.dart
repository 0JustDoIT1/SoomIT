import 'package:flutter/material.dart';

import 'models/questionnaire.dart';
import 'services/questionnaire_service.dart';

class QuestionnaireScreen extends StatefulWidget {
  const QuestionnaireScreen({super.key});

  @override
  State<QuestionnaireScreen> createState() =>
      _QuestionnaireScreenState();
}

class _QuestionnaireScreenState
    extends State<QuestionnaireScreen> {
  final QuestionnaireService _service =
      QuestionnaireService();

  final TextEditingController _currentSymptomsController =
      TextEditingController();

  final TextEditingController _symptomOnsetController =
      TextEditingController();

  final TextEditingController _pastHistoryController =
      TextEditingController();

  final TextEditingController _currentMedicationsController =
      TextEditingController();

  final TextEditingController _allergiesController =
      TextEditingController();

  String? _smokingHistory;
  String? _dyspnea;
  String? _cough;
  String? _hemoptysis;

  Questionnaire? _questionnaire;

  bool _isLoading = true;
  bool _isSaving = false;

  bool get _isCompleted =>
      _questionnaire?.isCompleted ?? false;

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

  Future<void> _loadQuestionnaire() async {
    try {
      debugPrint('문진표 목록 조회 시작');

      final questionnaires =
          await _service.getQuestionnaires();

      debugPrint(
        '문진표 조회 성공: ${questionnaires.length}개',
      );

      Questionnaire? selected;

      for (final questionnaire in questionnaires) {
        debugPrint(
          '문진표 확인: '
          'id=${questionnaire.id}, '
          'type=${questionnaire.questionnaireType}, '
          'completed=${questionnaire.isCompleted}',
        );

        if (questionnaire.questionnaireType ==
            'PRE_VISIT') {
          selected = questionnaire;
          break;
        }
      }

      if (selected != null) {
        debugPrint(
          '불러올 문진표 선택: ${selected.id}',
        );

        _questionnaire = selected;

        _applyResponses(
          selected.responses,
        );
      } else {
        debugPrint(
          'PRE_VISIT 문진표 없음',
        );
      }
    } catch (e, stackTrace) {
      debugPrint(
        '문진표 불러오기 오류: $e',
      );

      debugPrint(
        '문진표 불러오기 StackTrace:',
      );

      debugPrint(
        '$stackTrace',
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '문진표 정보를 불러오지 못했습니다.\n$e',
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  void _applyResponses(
    Map<String, dynamic> responses,
  ) {
    debugPrint(
      '문진표 responses 적용: $responses',
    );

    _currentSymptomsController.text =
        responses['current_symptoms']
                ?.toString() ??
            '';

    _symptomOnsetController.text =
        responses['symptom_onset']
                ?.toString() ??
            '';

    _smokingHistory =
        responses['smoking_history']
            ?.toString();

    _dyspnea =
        responses['dyspnea']
            ?.toString();

    _cough =
        responses['cough']
            ?.toString();

    _hemoptysis =
        responses['hemoptysis']
            ?.toString();

    _pastHistoryController.text =
        responses['past_history']
                ?.toString() ??
            '';

    _currentMedicationsController.text =
        responses['current_medications']
                ?.toString() ??
            '';

    _allergiesController.text =
        responses['allergies']
                ?.toString() ??
            '';
  }

  Map<String, dynamic> _buildResponses() {
    return {
      'current_symptoms':
          _currentSymptomsController.text.trim(),

      'symptom_onset':
          _symptomOnsetController.text.trim(),

      'smoking_history':
          _smokingHistory,

      'dyspnea':
          _dyspnea,

      'cough':
          _cough,

      'hemoptysis':
          _hemoptysis,

      'past_history':
          _pastHistoryController.text.trim(),

      'current_medications':
          _currentMedicationsController.text.trim(),

      'allergies':
          _allergiesController.text.trim(),
    };
  }

  Future<void> _save({
    required bool isCompleted,
  }) async {
    if (_isSaving || _isCompleted) {
      return;
    }

    if (
        isCompleted &&
        !_validateRequiredFields()
    ) {
      return;
    }

    setState(() {
      _isSaving = true;
    });

    try {
      final responses =
          _buildResponses();

      debugPrint(
        '문진표 저장 시작',
      );

      debugPrint(
        'responses=$responses',
      );

      debugPrint(
        'isCompleted=$isCompleted',
      );

      Questionnaire saved;

      if (_questionnaire == null) {
        debugPrint(
          '새 문진표 POST',
        );

        saved =
            await _service.createQuestionnaire(
          responses: responses,
          isCompleted: isCompleted,
        );
      } else {
        debugPrint(
          '기존 문진표 PATCH: '
          '${_questionnaire!.id}',
        );

        saved =
            await _service.updateQuestionnaire(
          questionnaireId:
              _questionnaire!.id,
          responses: responses,
          isCompleted: isCompleted,
        );
      }

      debugPrint(
        '문진표 저장 성공: ${saved.id}',
      );

      if (!mounted) return;

      setState(() {
        _questionnaire = saved;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            isCompleted
                ? '문진표 작성이 완료되었습니다.'
                : '문진표가 임시저장되었습니다.',
          ),
        ),
      );
    } catch (e, stackTrace) {
      debugPrint(
        '문진표 저장 오류: $e',
      );

      debugPrint(
        '$stackTrace',
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '문진표 저장 중 오류가 발생했습니다.\n$e',
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

  bool _validateRequiredFields() {
    if (
        _currentSymptomsController
            .text
            .trim()
            .isEmpty
    ) {
      _showValidationMessage(
        '현재 증상을 입력해주세요.',
      );

      return false;
    }

    if (
        _symptomOnsetController
            .text
            .trim()
            .isEmpty
    ) {
      _showValidationMessage(
        '증상 발생 시기를 입력해주세요.',
      );

      return false;
    }

    if (_smokingHistory == null) {
      _showValidationMessage(
        '흡연력을 선택해주세요.',
      );

      return false;
    }

    if (_dyspnea == null) {
      _showValidationMessage(
        '호흡곤란 여부를 선택해주세요.',
      );

      return false;
    }

    if (_cough == null) {
      _showValidationMessage(
        '기침 여부를 선택해주세요.',
      );

      return false;
    }

    if (_hemoptysis == null) {
      _showValidationMessage(
        '객혈 여부를 선택해주세요.',
      );

      return false;
    }

    return true;
  }

  void _showValidationMessage(
    String message,
  ) {
    ScaffoldMessenger.of(context)
        .showSnackBar(
      SnackBar(
        content: Text(message),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        body: Center(
          child:
              CircularProgressIndicator(),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          '진료 전 문진표',
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding:
                    const EdgeInsets.all(
                  20,
                ),
                children: [
                  _buildStatusCard(),

                  const SizedBox(
                    height: 24,
                  ),

                  _buildSectionTitle(
                    '1. 현재 증상',
                  ),

                  _buildTextField(
                    controller:
                        _currentSymptomsController,
                    hintText:
                        '현재 불편한 증상을 입력해주세요.',
                    maxLines: 3,
                  ),

                  const SizedBox(
                    height: 24,
                  ),

                  _buildSectionTitle(
                    '2. 증상 발생 시기',
                  ),

                  _buildTextField(
                    controller:
                        _symptomOnsetController,
                    hintText:
                        '예: 3일 전, 1주 전',
                  ),

                  const SizedBox(
                    height: 24,
                  ),

                  _buildSectionTitle(
                    '3. 흡연력',
                  ),

                  _buildChoiceGroup(
                    value:
                        _smokingHistory,
                    options: const [
                      '비흡연',
                      '과거 흡연',
                      '현재 흡연',
                    ],
                    onChanged: (value) {
                      setState(() {
                        _smokingHistory =
                            value;
                      });
                    },
                  ),

                  const SizedBox(
                    height: 24,
                  ),

                  _buildSectionTitle(
                    '4. 호흡곤란',
                  ),

                  _buildChoiceGroup(
                    value:
                        _dyspnea,
                    options: const [
                      '없음',
                      '활동 시 있음',
                      '안정 시에도 있음',
                    ],
                    onChanged: (value) {
                      setState(() {
                        _dyspnea =
                            value;
                      });
                    },
                  ),

                  const SizedBox(
                    height: 24,
                  ),

                  _buildSectionTitle(
                    '5. 기침',
                  ),

                  _buildChoiceGroup(
                    value:
                        _cough,
                    options: const [
                      '없음',
                      '있음',
                    ],
                    onChanged: (value) {
                      setState(() {
                        _cough =
                            value;
                      });
                    },
                  ),

                  const SizedBox(
                    height: 24,
                  ),

                  _buildSectionTitle(
                    '6. 객혈',
                  ),

                  _buildChoiceGroup(
                    value:
                        _hemoptysis,
                    options: const [
                      '없음',
                      '있음',
                    ],
                    onChanged: (value) {
                      setState(() {
                        _hemoptysis =
                            value;
                      });
                    },
                  ),

                  const SizedBox(
                    height: 24,
                  ),

                  _buildSectionTitle(
                    '7. 과거력',
                  ),

                  _buildTextField(
                    controller:
                        _pastHistoryController,
                    hintText:
                        '기존 질환이나 수술 이력이 있다면 입력해주세요.',
                    maxLines: 3,
                  ),

                  const SizedBox(
                    height: 24,
                  ),

                  _buildSectionTitle(
                    '8. 현재 복용약',
                  ),

                  _buildTextField(
                    controller:
                        _currentMedicationsController,
                    hintText:
                        '현재 복용 중인 약이 있다면 입력해주세요.',
                    maxLines: 3,
                  ),

                  const SizedBox(
                    height: 24,
                  ),

                  _buildSectionTitle(
                    '9. 알레르기',
                  ),

                  _buildTextField(
                    controller:
                        _allergiesController,
                    hintText:
                        '약물 또는 음식 알레르기가 있다면 입력해주세요.',
                    maxLines: 3,
                  ),

                  const SizedBox(
                    height: 32,
                  ),
                ],
              ),
            ),

            if (!_isCompleted)
              _buildBottomButtons(),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusCard() {
    final String title;
    final IconData icon;

    if (_questionnaire == null) {
      title = '미작성';
      icon = Icons.edit_note;
    } else if (
        _questionnaire!.isCompleted
    ) {
      title = '작성 완료';
      icon =
          Icons.check_circle_outline;
    } else {
      title = '작성 중';
      icon = Icons.schedule;
    }

    return Container(
      padding:
          const EdgeInsets.all(
        16,
      ),
      decoration: BoxDecoration(
        color: Theme.of(context)
            .colorScheme
            .primaryContainer,
        borderRadius:
            BorderRadius.circular(
          16,
        ),
      ),
      child: Row(
        children: [
          Icon(icon),

          const SizedBox(
            width: 12,
          ),

          Expanded(
            child: Column(
              crossAxisAlignment:
                  CrossAxisAlignment
                      .start,
              children: [
                const Text(
                  '문진 상태',
                  style: TextStyle(
                    fontSize: 13,
                  ),
                ),

                const SizedBox(
                  height: 4,
                ),

                Text(
                  title,
                  style:
                      const TextStyle(
                    fontSize: 17,
                    fontWeight:
                        FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(
    String title,
  ) {
    return Padding(
      padding:
          const EdgeInsets.only(
        bottom: 10,
      ),
      child: Text(
        title,
        style:
            const TextStyle(
          fontSize: 16,
          fontWeight:
              FontWeight.w700,
        ),
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController
        controller,
    required String hintText,
    int maxLines = 1,
  }) {
    return TextField(
      controller: controller,
      enabled:
          !_isCompleted,
      maxLines: maxLines,
      decoration:
          InputDecoration(
        hintText: hintText,
        border:
            OutlineInputBorder(
          borderRadius:
              BorderRadius.circular(
            12,
          ),
        ),
      ),
    );
  }

  Widget _buildChoiceGroup({
    required String? value,
    required List<String> options,
    required ValueChanged<String>
        onChanged,
  }) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children:
          options.map(
        (option) {
          return ChoiceChip(
            label:
                Text(option),
            selected:
                value == option,
            onSelected:
                _isCompleted
                    ? null
                    : (selected) {
                        if (selected) {
                          onChanged(
                            option,
                          );
                        }
                      },
          );
        },
      ).toList(),
    );
  }

  Widget _buildBottomButtons() {
    return Container(
      padding:
          const EdgeInsets.fromLTRB(
        20,
        12,
        20,
        20,
      ),
      child: Row(
        children: [
          Expanded(
            child:
                OutlinedButton(
              onPressed:
                  _isSaving
                      ? null
                      : () {
                          _save(
                            isCompleted:
                                false,
                          );
                        },
              child:
                  const Text(
                '임시저장',
              ),
            ),
          ),

          const SizedBox(
            width: 12,
          ),

          Expanded(
            child:
                FilledButton(
              onPressed:
                  _isSaving
                      ? null
                      : () {
                          _save(
                            isCompleted:
                                true,
                          );
                        },
              child: _isSaving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child:
                          CircularProgressIndicator(
                        strokeWidth:
                            2,
                      ),
                    )
                  : const Text(
                      '작성 완료',
                    ),
            ),
          ),
        ],
      ),
    );
  }
}