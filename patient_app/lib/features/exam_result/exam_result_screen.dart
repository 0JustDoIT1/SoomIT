import 'package:flutter/material.dart';

import 'exam_result_detail_screen.dart';
import 'models/exam_result.dart';
import 'services/exam_result_service.dart';

class ExamResultScreen extends StatefulWidget {
  const ExamResultScreen({super.key});

  @override
  State<ExamResultScreen> createState() => _ExamResultScreenState();
}

class _ExamResultScreenState extends State<ExamResultScreen> {
  int _selectedTab = 0;

  final ExamResultService _examResultService = ExamResultService();

  late Future<List<ExamResult>> _resultsFuture;

  @override
  void initState() {
    super.initState();
    _loadResults();
  }

  void _loadResults() {
    _resultsFuture = _examResultService.getExamResults();
  }

  void _retry() {
    setState(() {
      _loadResults();
    });
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        children: [
          _buildTabBar(),

          Expanded(
            child: IndexedStack(
              index: _selectedTab,
              children: [
                _buildScheduleTab(),
                _buildResultTab(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ─────────────────────────────────────────
  // 상단 2탭
  // ─────────────────────────────────────────

  Widget _buildTabBar() {
    const tabs = [
      '검사 일정',
      '검사 결과',
    ];

    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
      child: Row(
        children: List.generate(
          tabs.length,
          (index) {
            final isSelected = _selectedTab == index;

            return Expanded(
              child: InkWell(
                onTap: () {
                  setState(() {
                    _selectedTab = index;
                  });
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    vertical: 13,
                  ),
                  decoration: BoxDecoration(
                    border: Border(
                      bottom: BorderSide(
                        width: 2,
                        color: isSelected
                            ? const Color(0xFF2B66F6)
                            : Colors.transparent,
                      ),
                    ),
                  ),
                  child: Text(
                    tabs[index],
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight:
                          isSelected ? FontWeight.w800 : FontWeight.w500,
                      color: isSelected
                          ? const Color(0xFF191F28)
                          : const Color(0xFF8B95A1),
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  // ─────────────────────────────────────────
  // 검사 일정
  // 현재는 일정 API 연결 전
  // ─────────────────────────────────────────

  Widget _buildScheduleTab() {
    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '검사 일정',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: Color(0xFF191F28),
            ),
          ),

          const SizedBox(height: 6),

          const Text(
            '예정된 검사 일정을 확인해보세요.',
            style: TextStyle(
              fontSize: 14,
              color: Color(0xFF8B95A1),
            ),
          ),

          const SizedBox(height: 22),

          _buildScheduleNotice(),
        ],
      ),
    );
  }

  Widget _buildScheduleNotice() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        vertical: 42,
        horizontal: 20,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: const Color(0xFFE9EDF2),
        ),
      ),
      child: const Column(
        children: [
          Icon(
            Icons.calendar_month_outlined,
            size: 42,
            color: Color(0xFFB0B8C1),
          ),

          SizedBox(height: 14),

          Text(
            '검사 일정 정보를 준비 중이에요.',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: Color(0xFF191F28),
            ),
          ),

          SizedBox(height: 6),

          Text(
            '검사 일정 API 연결 후 실제 일정이 표시됩니다.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              height: 1.5,
              color: Color(0xFF8B95A1),
            ),
          ),
        ],
      ),
    );
  }

  // ─────────────────────────────────────────
  // 검사 결과 - 실제 API
  // ─────────────────────────────────────────

  Widget _buildResultTab() {
    return FutureBuilder<List<ExamResult>>(
      future: _resultsFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(
            child: CircularProgressIndicator(),
          );
        }

        if (snapshot.hasError) {
          return _buildErrorState();
        }

        final results = snapshot.data ?? [];

        if (results.isEmpty) {
          return _buildEmptyResultState();
        }

        return RefreshIndicator(
          onRefresh: () async {
            setState(() {
              _loadResults();
            });

            await _resultsFuture;
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(
              parent: BouncingScrollPhysics(),
            ),
            padding: const EdgeInsets.fromLTRB(
              20,
              20,
              20,
              28,
            ),
            children: [
              const Text(
                '검사 결과',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF191F28),
                ),
              ),

              const SizedBox(height: 6),

              const Text(
                '확정된 검사 결과를 확인해보세요.',
                style: TextStyle(
                  fontSize: 14,
                  color: Color(0xFF8B95A1),
                ),
              ),

              const SizedBox(height: 22),

              ...results.map(
                (exam) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _buildResultCard(exam),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildResultCard(ExamResult exam) {
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ExamResultDetailScreen(
              exam: exam,
            ),
          ),
        );
      },
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: const Color(0xFFE9EDF2),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: const Color(0xFFF1FBF6),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.fact_check_outlined,
                    color: Color(0xFF20A66A),
                  ),
                ),

                const SizedBox(width: 12),

                Expanded(
                  child: Text(
                    exam.examName,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF191F28),
                    ),
                  ),
                ),

                _buildStatusBadge(
                  exam.resultStatusLabel,
                ),
              ],
            ),

            const SizedBox(height: 14),

            Row(
              children: [
                const Icon(
                  Icons.calendar_today_outlined,
                  size: 16,
                  color: Color(0xFF8B95A1),
                ),

                const SizedBox(width: 6),

                Text(
                  _formatDate(exam.resultDate),
                  style: const TextStyle(
                    fontSize: 13,
                    color: Color(0xFF8B95A1),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 12),

            Text(
              exam.resultSummary,
              style: const TextStyle(
                fontSize: 14,
                height: 1.55,
                color: Color(0xFF4E5968),
              ),
            ),

            const SizedBox(height: 16),

            const Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Text(
                  '결과 자세히 보기',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF2B66F6),
                  ),
                ),

                SizedBox(width: 2),

                Icon(
                  Icons.chevron_right_rounded,
                  size: 20,
                  color: Color(0xFF2B66F6),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 9,
        vertical: 5,
      ),
      decoration: BoxDecoration(
        color: const Color(0xFF20A66A)
            .withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        status,
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: Color(0xFF20A66A),
        ),
      ),
    );
  }

  // ─────────────────────────────────────────
  // 결과 없음
  // ─────────────────────────────────────────

  Widget _buildEmptyResultState() {
    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '검사 결과',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: Color(0xFF191F28),
            ),
          ),

          const SizedBox(height: 6),

          const Text(
            '확정된 검사 결과를 확인해보세요.',
            style: TextStyle(
              fontSize: 14,
              color: Color(0xFF8B95A1),
            ),
          ),

          const SizedBox(height: 50),

          const Center(
            child: Column(
              children: [
                Icon(
                  Icons.fact_check_outlined,
                  size: 46,
                  color: Color(0xFFB0B8C1),
                ),

                SizedBox(height: 14),

                Text(
                  '확인 가능한 검사 결과가 없어요.',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF4E5968),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ─────────────────────────────────────────
  // API 오류
  // ─────────────────────────────────────────

  Widget _buildErrorState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.error_outline_rounded,
              size: 48,
              color: Color(0xFF8B95A1),
            ),

            const SizedBox(height: 14),

            const Text(
              '검사 결과를 불러오지 못했습니다.',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: Color(0xFF191F28),
              ),
            ),

            const SizedBox(height: 8),

            const Text(
              '잠시 후 다시 시도해주세요.',
              style: TextStyle(
                fontSize: 13,
                color: Color(0xFF8B95A1),
              ),
            ),

            const SizedBox(height: 18),

            OutlinedButton(
              onPressed: _retry,
              child: const Text('다시 시도'),
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.year}.'
        '${date.month.toString().padLeft(2, '0')}.'
        '${date.day.toString().padLeft(2, '0')}';
  }
}