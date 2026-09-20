import 'package:flutter/material.dart';

import '../home/services/questionnaire_service.dart';
import '../questionnaire/questionnaire_screen.dart';
import 'models/patient_questionnaire.dart';

class QuestionnaireHistoryScreen extends StatefulWidget {
  const QuestionnaireHistoryScreen({super.key});

  @override
  State<QuestionnaireHistoryScreen> createState() =>
      _QuestionnaireHistoryScreenState();
}

class _QuestionnaireHistoryScreenState
    extends State<QuestionnaireHistoryScreen> {
  final QuestionnaireService _questionnaireService = QuestionnaireService();

  bool _isLoading = true;

  String? _errorMessage;

  List<PatientQuestionnaire> _questionnaires = [];

  @override
  void initState() {
    super.initState();

    _loadQuestionnaires();
  }

  // =========================================================
  // 목록 조회
  // =========================================================

  Future<void> _loadQuestionnaires() async {
    try {
      final questionnaires = await _questionnaireService.getQuestionnaires();

      if (!mounted) {
        return;
      }

      setState(() {
        _questionnaires = questionnaires;

        _errorMessage = null;

        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) {
        return;
      }

      setState(() {
        _errorMessage = '문진표 내역을 불러오지 못했습니다.';

        _isLoading = false;
      });
    }
  }

  // =========================================================
  // 문진표 화면 열기
  // =========================================================

  Future<void> _openQuestionnaireScreen({
    String? questionnaireId,
    bool startInEditMode = false,
  }) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) {
          return QuestionnaireScreen(
            questionnaireId: questionnaireId,

            startInEditMode: startInEditMode,
          );
        },
      ),
    );

    if (!mounted) {
      return;
    }

    setState(() {
      _isLoading = true;
    });

    await _loadQuestionnaires();
  }

  // =========================================================
  // 화면
  // =========================================================

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F6F9),

      appBar: AppBar(
        title: const Text(
          '문진표 작성 내역',

          style: TextStyle(
            fontWeight: FontWeight.w700,

            color: Color(0xFF191F28),
          ),
        ),

        backgroundColor: Colors.white,

        foregroundColor: const Color(0xFF191F28),

        surfaceTintColor: Colors.white,

        elevation: 0,

        actions: [
          // ===================================================
          // 우측 상단 작성 버튼
          //
          // 예전 3문항 화면 X
          // 홈과 동일한 QuestionnaireScreen 사용
          // ===================================================
          IconButton(
            onPressed: () {
              _openQuestionnaireScreen();
            },

            tooltip: '문진표 작성',

            icon: const Icon(Icons.edit_note_rounded),
          ),
        ],
      ),

      body: RefreshIndicator(
        onRefresh: _loadQuestionnaires,

        child: _buildBody(),
      ),
    );
  }

  // =========================================================
  // Body
  // =========================================================

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFF4DA8FF)),
      );
    }

    if (_errorMessage != null) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),

        children: [
          const SizedBox(height: 180),

          Center(
            child: Column(
              children: [
                const Icon(
                  Icons.error_outline_rounded,

                  size: 48,

                  color: Color(0xFF8B95A1),
                ),

                const SizedBox(height: 12),

                Text(_errorMessage!),

                const SizedBox(height: 14),

                FilledButton(
                  onPressed: () {
                    setState(() {
                      _isLoading = true;
                    });

                    _loadQuestionnaires();
                  },

                  child: const Text('다시 시도'),
                ),
              ],
            ),
          ),
        ],
      );
    }

    if (_questionnaires.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),

        padding: const EdgeInsets.symmetric(horizontal: 20),

        children: [
          const SizedBox(height: 150),

          const Icon(
            Icons.assignment_outlined,

            size: 56,

            color: Color(0xFFB2BAC5),
          ),

          const SizedBox(height: 16),

          const Center(
            child: Text(
              '작성한 문진표가 없습니다.',

              style: TextStyle(
                fontSize: 16,

                fontWeight: FontWeight.w600,

                color: Color(0xFF4E5968),
              ),
            ),
          ),

          const SizedBox(height: 20),

          Center(
            child: FilledButton.icon(
              onPressed: () {
                _openQuestionnaireScreen();
              },

              icon: const Icon(Icons.edit_note_rounded),

              label: const Text('문진표 작성'),
            ),
          ),
        ],
      );
    }

    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),

      padding: const EdgeInsets.all(16),

      itemCount: _questionnaires.length,

      separatorBuilder: (context, index) {
        return const SizedBox(height: 12);
      },

      itemBuilder: (context, index) {
        final questionnaire = _questionnaires[index];

        return _buildQuestionnaireCard(questionnaire);
      },
    );
  }

  // =========================================================
  // 문진표 카드
  // =========================================================

  Widget _buildQuestionnaireCard(PatientQuestionnaire questionnaire) {
    return Material(
      color: Colors.white,

      borderRadius: BorderRadius.circular(18),

      child: InkWell(
        onTap: () {
          _showQuestionnaireDetail(questionnaire);
        },

        borderRadius: BorderRadius.circular(18),

        child: Container(
          padding: const EdgeInsets.all(16),

          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),

            border: Border.all(color: const Color(0xFFE5EAF0)),
          ),

          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,

            children: [
              Container(
                width: 44,
                height: 44,

                decoration: BoxDecoration(
                  color: const Color(0xFFEAF5FF),

                  borderRadius: BorderRadius.circular(13),
                ),

                child: const Icon(
                  Icons.assignment_outlined,

                  color: Color(0xFF4DA8FF),
                ),
              ),

              const SizedBox(width: 14),

              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,

                  children: [
                    Text(
                      _questionnaireTypeLabel(questionnaire.questionnaireType),

                      style: const TextStyle(
                        fontSize: 15,

                        fontWeight: FontWeight.w700,

                        color: Color(0xFF191F28),
                      ),
                    ),

                    const SizedBox(height: 7),

                    Text(
                      '버전 ${questionnaire.questionnaireVersion}',

                      style: const TextStyle(
                        fontSize: 12,

                        color: Color(0xFF8B95A1),
                      ),
                    ),

                    const SizedBox(height: 5),

                    Row(
                      children: [
                        Icon(
                          questionnaire.isCompleted
                              ? Icons.check_circle_rounded
                              : Icons.schedule_rounded,

                          size: 15,

                          color: questionnaire.isCompleted
                              ? const Color(0xFF2FB344)
                              : const Color(0xFFFF922B),
                        ),

                        const SizedBox(width: 5),

                        Text(
                          questionnaire.isCompleted ? '작성 완료' : '작성 중',

                          style: const TextStyle(
                            fontSize: 12,

                            color: Color(0xFF6B7684),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 5),

                    Text(
                      '작성일 ${_formatDate(questionnaire.completedAt ?? questionnaire.createdAt)}',

                      style: const TextStyle(
                        fontSize: 12,

                        color: Color(0xFF8B95A1),
                      ),
                    ),

                    if (_wasUpdated(questionnaire)) ...[
                      const SizedBox(height: 4),

                      Text(
                        '수정일 ${_formatDate(questionnaire.updatedAt)}',

                        style: const TextStyle(
                          fontSize: 12,

                          color: Color(0xFF4DA8FF),
                        ),
                      ),
                    ],
                  ],
                ),
              ),

              const Icon(Icons.chevron_right_rounded, color: Color(0xFFAAB2BD)),
            ],
          ),
        ),
      ),
    );
  }

  // =========================================================
  // 상세보기
  // =========================================================

  Future<void> _showQuestionnaireDetail(
    PatientQuestionnaire questionnaire,
  ) async {
    final shouldEdit = await showModalBottomSheet<bool>(
      context: context,

      showDragHandle: true,

      isScrollControlled: true,

      backgroundColor: Colors.white,

      builder: (sheetContext) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),

            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,

                crossAxisAlignment: CrossAxisAlignment.start,

                children: [
                  Text(
                    _questionnaireTypeLabel(questionnaire.questionnaireType),

                    style: const TextStyle(
                      fontSize: 20,

                      fontWeight: FontWeight.bold,

                      color: Color(0xFF191F28),
                    ),
                  ),

                  const SizedBox(height: 8),

                  Text('버전 ${questionnaire.questionnaireVersion}'),

                  const SizedBox(height: 4),

                  Text(questionnaire.isCompleted ? '상태: 작성 완료' : '상태: 작성 중'),

                  const SizedBox(height: 4),

                  Text(
                    '작성일: ${_formatDate(questionnaire.completedAt ?? questionnaire.createdAt)}',
                  ),

                  if (_wasUpdated(questionnaire)) ...[
                    const SizedBox(height: 4),

                    Text('수정일: ${_formatDate(questionnaire.updatedAt)}'),
                  ],

                  const SizedBox(height: 20),

                  const Divider(),

                  const SizedBox(height: 12),

                  const Text(
                    '응답 내용',

                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                  ),

                  const SizedBox(height: 14),

                  _buildResponseRow(
                    '현재 증상',
                    questionnaire.responses['current_symptoms'],
                  ),

                  _buildResponseRow(
                    '증상 발생 시기',
                    questionnaire.responses['symptom_onset'],
                  ),

                  _buildResponseRow(
                    '흡연력',
                    questionnaire.responses['smoking_history'],
                  ),

                  _buildResponseRow('호흡곤란', questionnaire.responses['dyspnea']),

                  _buildResponseRow('기침', questionnaire.responses['cough']),

                  _buildResponseRow(
                    '객혈',
                    questionnaire.responses['hemoptysis'],
                  ),

                  _buildResponseRow(
                    '과거력',
                    questionnaire.responses['past_history'],
                  ),

                  _buildResponseRow(
                    '현재 복용약',
                    questionnaire.responses['current_medications'],
                  ),

                  _buildResponseRow(
                    '알레르기',
                    questionnaire.responses['allergies'],
                  ),

                  const SizedBox(height: 22),

                  SizedBox(
                    width: double.infinity,

                    height: 50,

                    child: FilledButton.icon(
                      onPressed: () {
                        Navigator.pop(sheetContext, true);
                      },

                      icon: const Icon(Icons.edit_outlined),

                      label: const Text('수정하기'),

                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF4DA8FF),

                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );

    // =========================================================
    // 상세보기 → 수정하기
    //
    // 선택한 문진표 ID를 정확히 전달하고
    // 바로 수정모드로 진입
    // =========================================================

    if (shouldEdit == true && mounted) {
      await _openQuestionnaireScreen(
        questionnaireId: questionnaire.id,

        startInEditMode: true,
      );
    }
  }

  // =========================================================
  // 응답 행
  // =========================================================

  Widget _buildResponseRow(String title, dynamic value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),

      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,

        children: [
          SizedBox(
            width: 105,

            child: Text(
              title,

              style: const TextStyle(
                fontSize: 13,

                fontWeight: FontWeight.w600,

                color: Color(0xFF6B7684),
              ),
            ),
          ),

          Expanded(
            child: Text(
              _formatValue(value),

              style: const TextStyle(fontSize: 13, color: Color(0xFF191F28)),
            ),
          ),
        ],
      ),
    );
  }

  // =========================================================
  // 문진표 종류 표시
  // =========================================================

  String _questionnaireTypeLabel(String type) {
    switch (type) {
      case 'PRE_VISIT':
        return '진료 전 문진표';

      case '초진 문진표':
        return '진료 전 문진표';

      default:
        return type;
    }
  }

  // =========================================================
  // 값 표시
  // =========================================================

  String _formatValue(dynamic value) {
    if (value == null) {
      return '-';
    }

    final text = value.toString().trim();

    if (text.isEmpty) {
      return '-';
    }

    if (value == true) {
      return '예';
    }

    if (value == false) {
      return '아니오';
    }

    return text;
  }

  // =========================================================
  // 수정 여부
  // =========================================================

  bool _wasUpdated(PatientQuestionnaire questionnaire) {
    return questionnaire.updatedAt
            .difference(questionnaire.createdAt)
            .abs()
            .inSeconds >
        2;
  }

  // =========================================================
  // 날짜
  // =========================================================

  String _formatDate(DateTime dateTime) {
    final local = dateTime.toLocal();

    final year = local.year.toString();

    final month = local.month.toString().padLeft(2, '0');

    final day = local.day.toString().padLeft(2, '0');

    return '$year.$month.$day';
  }
}
