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

  bool get _isDark => Theme.of(context).brightness == Brightness.dark;
  Color get _background => _isDark ? Color(0xFF101820) : Color(0xFFF4F6F9);
  Color get _surface => _isDark ? Color(0xFF17212B) : Colors.white;
  Color get _textPrimary => _isDark ? Color(0xFFF5F7FA) : Color(0xFF191F28);
  Color get _textSecondary => _isDark ? Color(0xFF9EACBA) : Color(0xFF6B7684);
  Color get _muted => _isDark ? Color(0xFF8393A3) : Color(0xFF8B95A1);
  Color get _border => _isDark ? Color(0xFF2A3948) : Color(0xFFE5EAF0);
  Color get _softBlue => _isDark ? Color(0xFF1A3147) : Color(0xFFEAF5FF);

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
      backgroundColor: _background,

      appBar: AppBar(
        title: Text(
          '문진표 작성 내역',

          style: TextStyle(fontWeight: FontWeight.w700, color: _textPrimary),
        ),

        backgroundColor: _surface,

        foregroundColor: Color(0xFF191F28),

        surfaceTintColor: _surface,

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

            icon: Icon(Icons.edit_note_rounded),
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
      return Center(child: CircularProgressIndicator(color: Color(0xFF4DA8FF)));
    }

    if (_errorMessage != null) {
      return ListView(
        physics: AlwaysScrollableScrollPhysics(),

        children: [
          SizedBox(height: 180),

          Center(
            child: Column(
              children: [
                Icon(Icons.error_outline_rounded, size: 48, color: _muted),

                SizedBox(height: 12),

                Text(_errorMessage!),

                SizedBox(height: 14),

                FilledButton(
                  onPressed: () {
                    setState(() {
                      _isLoading = true;
                    });

                    _loadQuestionnaires();
                  },

                  child: Text('다시 시도'),
                ),
              ],
            ),
          ),
        ],
      );
    }

    if (_questionnaires.isEmpty) {
      return ListView(
        physics: AlwaysScrollableScrollPhysics(),

        padding: const EdgeInsets.symmetric(horizontal: 20),

        children: [
          SizedBox(height: 150),

          Icon(Icons.assignment_outlined, size: 56, color: Color(0xFFB2BAC5)),

          SizedBox(height: 16),

          Center(
            child: Text(
              '작성한 문진표가 없습니다.',

              style: TextStyle(
                fontSize: 16,

                fontWeight: FontWeight.w600,

                color: Color(0xFF4E5968),
              ),
            ),
          ),

          SizedBox(height: 20),

          Center(
            child: FilledButton.icon(
              onPressed: () {
                _openQuestionnaireScreen();
              },

              icon: Icon(Icons.edit_note_rounded),

              label: Text('문진표 작성'),
            ),
          ),
        ],
      );
    }

    return ListView.separated(
      physics: AlwaysScrollableScrollPhysics(),

      padding: const EdgeInsets.all(16),

      itemCount: _questionnaires.length,

      separatorBuilder: (context, index) {
        return SizedBox(height: 12);
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
      color: _surface,

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

            border: Border.all(color: _border),
          ),

          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,

            children: [
              Container(
                width: 44,

                height: 44,

                decoration: BoxDecoration(
                  color: _softBlue,

                  borderRadius: BorderRadius.circular(13),
                ),

                child: Icon(
                  Icons.assignment_outlined,

                  color: Color(0xFF4DA8FF),
                ),
              ),

              SizedBox(width: 14),

              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,

                  children: [
                    Text(
                      _questionnaireTypeLabel(questionnaire.questionnaireType),

                      style: TextStyle(
                        fontSize: 15,

                        fontWeight: FontWeight.w700,

                        color: _textPrimary,
                      ),
                    ),

                    SizedBox(height: 7),

                    Text(
                      '버전 ${questionnaire.questionnaireVersion}',

                      style: TextStyle(fontSize: 12, color: _muted),
                    ),

                    SizedBox(height: 5),

                    Row(
                      children: [
                        Icon(
                          questionnaire.isCompleted
                              ? Icons.check_circle_rounded
                              : Icons.schedule_rounded,

                          size: 15,

                          color: questionnaire.isCompleted
                              ? Color(0xFF2FB344)
                              : Color(0xFFFF922B),
                        ),

                        SizedBox(width: 5),

                        Text(
                          questionnaire.isCompleted ? '작성 완료' : '작성 중',

                          style: TextStyle(fontSize: 12, color: _textSecondary),
                        ),
                      ],
                    ),

                    SizedBox(height: 5),

                    Text(
                      '작성일 ${_formatDate(questionnaire.completedAt ?? questionnaire.createdAt)}',

                      style: TextStyle(fontSize: 12, color: _muted),
                    ),

                    if (_wasUpdated(questionnaire)) ...[
                      SizedBox(height: 4),

                      Text(
                        '수정일 ${_formatDate(questionnaire.updatedAt)}',

                        style: TextStyle(
                          fontSize: 12,

                          color: Color(0xFF4DA8FF),
                        ),
                      ),
                    ],
                  ],
                ),
              ),

              Icon(Icons.chevron_right_rounded, color: Color(0xFFAAB2BD)),
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

      backgroundColor: _surface,

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

                    style: TextStyle(
                      fontSize: 20,

                      fontWeight: FontWeight.bold,

                      color: _textPrimary,
                    ),
                  ),

                  SizedBox(height: 8),

                  Text('버전 ${questionnaire.questionnaireVersion}'),

                  SizedBox(height: 4),

                  Text(questionnaire.isCompleted ? '상태: 작성 완료' : '상태: 작성 중'),

                  SizedBox(height: 4),

                  Text(
                    '작성일: ${_formatDate(questionnaire.completedAt ?? questionnaire.createdAt)}',
                  ),

                  if (_wasUpdated(questionnaire)) ...[
                    SizedBox(height: 4),

                    Text('수정일: ${_formatDate(questionnaire.updatedAt)}'),
                  ],

                  SizedBox(height: 20),

                  Divider(),

                  SizedBox(height: 12),

                  Text(
                    '응답 내용',

                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                  ),

                  SizedBox(height: 14),

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

                  SizedBox(height: 22),

                  SizedBox(
                    width: double.infinity,

                    height: 50,

                    child: FilledButton.icon(
                      onPressed: () {
                        Navigator.pop(sheetContext, true);
                      },

                      icon: Icon(Icons.edit_outlined),

                      label: Text('수정하기'),

                      style: FilledButton.styleFrom(
                        backgroundColor: Color(0xFF4DA8FF),

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

              style: TextStyle(
                fontSize: 13,

                fontWeight: FontWeight.w600,

                color: _textSecondary,
              ),
            ),
          ),

          Expanded(
            child: Text(
              _formatValue(value),

              style: TextStyle(fontSize: 13, color: _textPrimary),
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
