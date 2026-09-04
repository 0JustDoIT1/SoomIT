import 'package:flutter/material.dart';

import 'models/exam_result.dart';

class ExamResultDetailScreen extends StatelessWidget {
  const ExamResultDetailScreen({
    super.key,
    required this.exam,
  });

  final ExamResult exam;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F6F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        foregroundColor: const Color(0xFF191F28),
        title: const Text(
          '검사 결과 상세',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildSectionTitle('검사 정보'),

              const SizedBox(height: 12),

              _buildExamInfoCard(),

              const SizedBox(height: 28),

              _buildSectionTitle('검사 결과'),

              const SizedBox(height: 12),

              _buildResultCard(),

              const SizedBox(height: 20),

              _buildNoticeCard(),

              const SizedBox(height: 28),

              _buildBackButton(context),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: const TextStyle(
        fontSize: 20,
        fontWeight: FontWeight.w800,
        color: Color(0xFF191F28),
      ),
    );
  }

  Widget _buildExamInfoCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
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
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: const Color(0xFFF4F7FF),
                  borderRadius: BorderRadius.circular(13),
                ),
                child: const Icon(
                  Icons.biotech_outlined,
                  size: 25,
                  color: Color(0xFF2B66F6),
                ),
              ),

              const SizedBox(width: 12),

              Expanded(
                child: Text(
                  exam.examName,
                  style: const TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF191F28),
                  ),
                ),
              ),

              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 9,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFF20A66A)
                      .withValues(alpha: 0.09),
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Text(
                  exam.resultStatusLabel,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF20A66A),
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 18),

          Container(
            width: double.infinity,
            decoration: BoxDecoration(
              color: const Color(0xFFF8F9FB),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Column(
              children: [
                _buildInfoRow(
                  icon: Icons.category_outlined,
                  label: '검사 종류',
                  value: exam.examType,
                ),

                const Divider(
                  height: 1,
                  indent: 16,
                  endIndent: 16,
                  color: Color(0xFFE9EDF2),
                ),

                _buildInfoRow(
                  icon: Icons.calendar_month_outlined,
                  label: '결과 확정일',
                  value: _formatDateTime(exam.resultDate),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoRow({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: 16,
        vertical: 15,
      ),
      child: Row(
        children: [
          Icon(
            icon,
            size: 19,
            color: const Color(0xFF6B7684),
          ),

          const SizedBox(width: 10),

          Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              color: Color(0xFF8B95A1),
            ),
          ),

          const Spacer(),

          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Color(0xFF191F28),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildResultCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
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
                  borderRadius: BorderRadius.circular(13),
                ),
                child: const Icon(
                  Icons.fact_check_outlined,
                  size: 24,
                  color: Color(0xFF20A66A),
                ),
              ),

              const SizedBox(width: 12),

              const Expanded(
                child: Text(
                  '확인된 검사 결과',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF191F28),
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 18),

          Text(
            exam.resultSummary,
            style: const TextStyle(
              fontSize: 14,
              height: 1.65,
              color: Color(0xFF4E5968),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNoticeCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFF4F7FF),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: const Color(0xFFDCE5FF),
        ),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.info_outline_rounded,
            size: 20,
            color: Color(0xFF2B66F6),
          ),

          SizedBox(width: 10),

          Expanded(
            child: Text(
              '검사 결과에 대한 자세한 설명은 담당 의료진과 상담해주세요.',
              style: TextStyle(
                fontSize: 13,
                height: 1.5,
                color: Color(0xFF4E5968),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBackButton(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 50,
      child: ElevatedButton(
        onPressed: () {
          Navigator.pop(context);
        },
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF2B66F6),
          foregroundColor: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: const Text(
          '목록으로 돌아가기',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }

  String _formatDateTime(DateTime date) {
    final minute = date.minute.toString().padLeft(2, '0');
    final period = date.hour < 12 ? '오전' : '오후';

    final hour = date.hour == 0
        ? 12
        : date.hour > 12
            ? date.hour - 12
            : date.hour;

    return '${date.year}.'
        '${date.month.toString().padLeft(2, '0')}.'
        '${date.day.toString().padLeft(2, '0')} '
        '$period ${hour.toString().padLeft(2, '0')}:$minute';
  }
}