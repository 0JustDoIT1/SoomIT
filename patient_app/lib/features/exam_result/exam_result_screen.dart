import 'package:flutter/material.dart';

import 'exam_result_detail_screen.dart';
import 'mock/exam_result_mock.dart';
import 'models/exam_result.dart';

class ExamResultScreen extends StatefulWidget {
  const ExamResultScreen({super.key});

  @override
  State<ExamResultScreen> createState() => _ExamResultScreenState();
}

class _ExamResultScreenState extends State<ExamResultScreen> {
  int _selectedTab = 0;

  @override
  Widget build(BuildContext context) {
    final upcomingExams =
        mockExamResults.where((exam) => !exam.hasResult).toList();

    final completedResults =
        mockExamResults.where((exam) => exam.hasResult).toList();

    return SafeArea(
      child: Column(
        children: [
          _buildTabBar(),
          Expanded(
            child: IndexedStack(
              index: _selectedTab,
              children: [
                _buildScheduleTab(upcomingExams),
                _buildResultTab(completedResults),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // 상단 2개 탭
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
                  padding: const EdgeInsets.symmetric(vertical: 13),
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

  // 검사 일정 탭
  Widget _buildScheduleTab(List<ExamResult> upcomingExams) {
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

          if (upcomingExams.isEmpty)
            _buildEmptyState(
              icon: Icons.calendar_month_outlined,
              title: '예정된 검사가 없어요.',
              description: '새로운 검사 일정이 등록되면 여기에서 확인할 수 있어요.',
            )
          else
            ...upcomingExams.map(
              (exam) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _buildScheduleCard(exam),
              ),
            ),
        ],
      ),
    );
  }

  // 검사 결과 탭
  Widget _buildResultTab(List<ExamResult> completedResults) {
    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
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
            '완료된 검사 결과를 확인해보세요.',
            style: TextStyle(
              fontSize: 14,
              color: Color(0xFF8B95A1),
            ),
          ),
          const SizedBox(height: 22),

          if (completedResults.isEmpty)
            _buildEmptyState(
              icon: Icons.fact_check_outlined,
              title: '확인 가능한 검사 결과가 없어요.',
              description: '검사 결과가 등록되면 여기에서 확인할 수 있어요.',
            )
          else
            ...completedResults.map(
              (exam) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _buildResultCard(exam),
              ),
            ),
        ],
      ),
    );
  }

  // 검사 일정 카드
  Widget _buildScheduleCard(ExamResult exam) {
    return Container(
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
                  color: const Color(0xFFF4F7FF),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.biotech_outlined,
                  color: Color(0xFF2B66F6),
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
                exam.status,
                const Color(0xFF2B66F6),
              ),
            ],
          ),
          const SizedBox(height: 16),

          _buildInfoRow(
            Icons.calendar_month_outlined,
            _formatDateTime(exam.scheduledAt),
          ),

          const SizedBox(height: 8),

          _buildInfoRow(
            Icons.local_hospital_outlined,
            exam.department,
          ),

          const SizedBox(height: 14),

          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFF8F9FB),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.info_outline_rounded,
                  size: 18,
                  color: Color(0xFF6B7684),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    exam.preparationGuide,
                    style: const TextStyle(
                      fontSize: 13,
                      height: 1.5,
                      color: Color(0xFF4E5968),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // 검사 결과 카드
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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        exam.examName,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF191F28),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        exam.department,
                        style: const TextStyle(
                          fontSize: 13,
                          color: Color(0xFF8B95A1),
                        ),
                      ),
                    ],
                  ),
                ),
                _buildStatusBadge(
                  exam.status,
                  const Color(0xFF20A66A),
                ),
              ],
            ),
            const SizedBox(height: 14),

            _buildInfoRow(
              Icons.calendar_today_outlined,
              _formatDate(exam.scheduledAt),
            ),

            if (exam.resultSummary != null) ...[
              const SizedBox(height: 12),
              Text(
                exam.resultSummary!,
                style: const TextStyle(
                  fontSize: 14,
                  height: 1.55,
                  color: Color(0xFF4E5968),
                ),
              ),
            ],

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

  Widget _buildStatusBadge(
    String text,
    Color color,
  ) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 9,
        vertical: 5,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }

  Widget _buildInfoRow(
    IconData icon,
    String text,
  ) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          icon,
          size: 17,
          color: const Color(0xFF8B95A1),
        ),
        const SizedBox(width: 7),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(
              fontSize: 13,
              color: Color(0xFF4E5968),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildEmptyState({
    required IconData icon,
    required String title,
    required String description,
  }) {
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
      child: Column(
        children: [
          Icon(
            icon,
            size: 40,
            color: const Color(0xFFB0B8C1),
          ),
          const SizedBox(height: 14),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: Color(0xFF191F28),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            description,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 13,
              height: 1.5,
              color: Color(0xFF8B95A1),
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.year}.'
        '${date.month.toString().padLeft(2, '0')}.'
        '${date.day.toString().padLeft(2, '0')}';
  }

  String _formatDateTime(DateTime date) {
    final minute = date.minute.toString().padLeft(2, '0');
    final period = date.hour < 12 ? '오전' : '오후';

    final hour = date.hour == 0
        ? 12
        : date.hour > 12
            ? date.hour - 12
            : date.hour;

    return '${_formatDate(date)} '
        '$period ${hour.toString().padLeft(2, '0')}:$minute';
  }
}