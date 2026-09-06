import 'package:flutter/material.dart';

import 'models/patient_questionnaire.dart';
import '../home/services/questionnaire_service.dart';
import 'questionnaire_form_screen.dart';

class QuestionnaireHistoryScreen extends StatefulWidget {
  const QuestionnaireHistoryScreen({super.key});

  @override
  State<QuestionnaireHistoryScreen> createState() =>
      _QuestionnaireHistoryScreenState();
}

class _QuestionnaireHistoryScreenState
    extends State<QuestionnaireHistoryScreen> {
  final QuestionnaireService _questionnaireService =
      QuestionnaireService();

  bool _isLoading = true;
  String? _errorMessage;
  List<PatientQuestionnaire> _questionnaires = [];

  @override
  void initState() {
    super.initState();
    _loadQuestionnaires();
  }

  Future<void> _loadQuestionnaires() async {
    try {
      final questionnaires =
          await _questionnaireService.getQuestionnaires();

      if (!mounted) return;

      setState(() {
        _questionnaires = questionnaires;
        _errorMessage = null;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _errorMessage = '문진표 내역을 불러오지 못했습니다.';
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('문진표 작성 내역'),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_note),
            tooltip: '문진표 작성',
            onPressed: () async {
              final result = await Navigator.push<bool>(
                context,
                MaterialPageRoute(
                  builder: (context) =>
                      const QuestionnaireFormScreen(),
                ),
              );

              if (result == true) {
                _loadQuestionnaires();
              }
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadQuestionnaires,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(),
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
                  Icons.error_outline,
                  size: 48,
                ),
                const SizedBox(height: 12),
                Text(_errorMessage!),
                const SizedBox(height: 12),
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
        children: const [
          SizedBox(height: 180),
          Icon(
            Icons.assignment_outlined,
            size: 56,
          ),
          SizedBox(height: 16),
          Center(
            child: Text(
              '작성한 문진표가 없습니다.',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      );
    }

    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      itemCount: _questionnaires.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final questionnaire = _questionnaires[index];

        return _buildQuestionnaireCard(questionnaire);
      },
    );
  }

  Widget _buildQuestionnaireCard(
    PatientQuestionnaire questionnaire,
  ) {
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.all(16),
        leading: const CircleAvatar(
          child: Icon(Icons.assignment_outlined),
        ),
        title: Text(
          questionnaire.questionnaireType,
          style: const TextStyle(
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '버전 ${questionnaire.questionnaireVersion}',
              ),
              const SizedBox(height: 4),
              Text(
                questionnaire.isCompleted
                    ? '작성 완료'
                    : '작성 중',
              ),
              const SizedBox(height: 4),
              Text(
                '작성일 ${_formatDate(
                  questionnaire.completedAt ??
                      questionnaire.createdAt,
                )}',
              ),
            ],
          ),
        ),
        trailing: const Icon(
          Icons.chevron_right,
        ),
        onTap: () {
          _showQuestionnaireDetail(questionnaire);
        },
      ),
    );
  }

  void _showQuestionnaireDetail(
    PatientQuestionnaire questionnaire,
  ) {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              20,
              8,
              20,
              24,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  questionnaire.questionnaireType,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '버전 ${questionnaire.questionnaireVersion}',
                ),
                const SizedBox(height: 4),
                Text(
                  questionnaire.isCompleted
                      ? '상태: 작성 완료'
                      : '상태: 작성 중',
                ),
                const SizedBox(height: 4),
                Text(
                  '작성일: ${_formatDate(
                    questionnaire.completedAt ??
                        questionnaire.createdAt,
                  )}',
                ),
                const SizedBox(height: 20),
                const Divider(),
                const SizedBox(height: 12),
                const Text(
                  '응답 내용',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 12),
                ...questionnaire.responses.entries.map(
                  (entry) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      '${entry.key}: ${_formatValue(entry.value)}',
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  String _formatValue(dynamic value) {
    if (value == true) {
      return '예';
    }

    if (value == false) {
      return '아니오';
    }

    return value.toString();
  }

  String _formatDate(DateTime dateTime) {
    final local = dateTime.toLocal();

    final year = local.year.toString();
    final month = local.month.toString().padLeft(2, '0');
    final day = local.day.toString().padLeft(2, '0');

    return '$year.$month.$day';
  }
}