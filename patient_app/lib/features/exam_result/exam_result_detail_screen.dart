import 'package:flutter/material.dart';

import 'models/exam_result.dart';

class ExamResultDetailScreen extends StatelessWidget {
  const ExamResultDetailScreen({super.key, required this.exam});

  final ExamResult exam;

  static const Color _background = Color(0xFFF5FAFF);
  static const Color _primary = Color(0xFF2F8DFE);
  static const Color _textPrimary = Color(0xFF191F28);
  static const Color _textSecondary = Color(0xFF6B7684);
  static const Color _border = Color(0xFFE8EDF3);

  @override
  Widget build(BuildContext context) {
    final detailSections = exam.resultSections
        .where((section) => !_isDoctorOpinion(section) && !_isNextPlan(section))
        .toList();

    final doctorOpinion = _findDoctorOpinion();
    final nextPlan = _findNextPlan();

    return Scaffold(
      backgroundColor: _background,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        foregroundColor: _textPrimary,
        title: const Text(
          '검사 결과 상세',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildExamSummaryCard(),

              const SizedBox(height: 18),

              _buildResultSummaryCard(),

              const SizedBox(height: 24),

              _buildSectionTitle(
                icon: Icons.description_outlined,
                title: '상세 결과',
              ),

              const SizedBox(height: 10),

              _buildDetailResultCard(detailSections),

              if (doctorOpinion != null) ...[
                const SizedBox(height: 24),
                _buildSectionTitle(
                  icon: Icons.medical_services_outlined,
                  title: '의료진 소견',
                ),
                const SizedBox(height: 10),
                _buildDoctorOpinionCard(doctorOpinion),
              ],

              if (nextPlan != null) ...[
                const SizedBox(height: 24),
                _buildSectionTitle(
                  icon: Icons.calendar_month_outlined,
                  title: '다음 계획',
                ),
                const SizedBox(height: 10),
                _buildNextPlanCard(nextPlan),
              ],

              const SizedBox(height: 20),

              _buildNoticeCard(),

              const SizedBox(height: 24),

              _buildBackButton(context),
            ],
          ),
        ),
      ),
    );
  }

  // ─────────────────────────────────────────
  // 상단 검사 정보
  // ─────────────────────────────────────────

  Widget _buildExamSummaryCard() {
    final hospital = exam.hospitalName?.trim();
    final department = exam.departmentName?.trim();
    final doctor = exam.doctorName?.trim();

    final hospitalDepartment = [
      if (hospital != null && hospital.isNotEmpty) hospital,
      if (department != null && department.isNotEmpty) department,
    ].join(' · ');

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _border),
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
                  color: const Color(0xFFEAF5FF),
                  borderRadius: BorderRadius.circular(13),
                ),
                child: const Icon(
                  Icons.biotech_outlined,
                  size: 24,
                  color: _primary,
                ),
              ),

              const SizedBox(width: 12),

              Expanded(
                child: Text(
                  exam.examName,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: _textPrimary,
                  ),
                ),
              ),

              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                decoration: BoxDecoration(
                  color: const Color(0xFFEAF8F1),
                  borderRadius: BorderRadius.circular(8),
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

          const SizedBox(height: 16),

          _buildInfoRow(
            icon: Icons.category_outlined,
            label: '검사 종류',
            value: exam.examName,
          ),

          const SizedBox(height: 10),

          _buildInfoRow(
            icon: Icons.calendar_today_outlined,
            label: '결과 확정일',
            value: _formatDateTime(exam.resultDate),
          ),

          if (hospitalDepartment.isNotEmpty) ...[
            const SizedBox(height: 10),
            _buildInfoRow(
              icon: Icons.local_hospital_outlined,
              label: '병원·진료과',
              value: hospitalDepartment,
            ),
          ],

          if (doctor != null && doctor.isNotEmpty) ...[
            const SizedBox(height: 10),
            _buildInfoRow(
              icon: Icons.person_outline_rounded,
              label: '담당의',
              value: doctor,
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildInfoRow({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 17, color: const Color(0xFF8B95A1)),

        const SizedBox(width: 8),

        SizedBox(
          width: 76,
          child: Text(
            label,
            style: const TextStyle(fontSize: 13, color: Color(0xFF8B95A1)),
          ),
        ),

        const SizedBox(width: 8),

        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: _textPrimary,
            ),
          ),
        ),
      ],
    );
  }

  // ─────────────────────────────────────────
  // 결과 한줄 요약
  // ─────────────────────────────────────────

  Widget _buildResultSummaryCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF7E6),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFFFE1A8)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: const BoxDecoration(
              color: Color(0xFFFFB020),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.info_outline_rounded,
              size: 20,
              color: Colors.white,
            ),
          ),

          const SizedBox(width: 12),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '결과 한줄 요약',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: _textPrimary,
                  ),
                ),

                const SizedBox(height: 6),

                Text(
                  _resultSummaryText(),
                  style: const TextStyle(
                    fontSize: 14,
                    height: 1.55,
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

  String _resultSummaryText() {
    for (final section in exam.resultSections) {
      if (!_isDoctorOpinion(section) && !_isNextPlan(section)) {
        return section.summary;
      }
    }

    return exam.resultSummary;
  }

  // ─────────────────────────────────────────
  // 공통 섹션 제목
  // ─────────────────────────────────────────

  Widget _buildSectionTitle({required IconData icon, required String title}) {
    return Row(
      children: [
        Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            color: const Color(0xFFEAF5FF),
            borderRadius: BorderRadius.circular(9),
          ),
          child: Icon(icon, size: 18, color: _primary),
        ),

        const SizedBox(width: 9),

        Text(
          title,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: _textPrimary,
          ),
        ),
      ],
    );
  }

  // ─────────────────────────────────────────
  // 상세 결과
  // ─────────────────────────────────────────

  Widget _buildDetailResultCard(List<ExamResultSection> sections) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _border),
      ),
      child: sections.isEmpty
          ? Text(
              exam.resultSummary,
              style: const TextStyle(
                fontSize: 14,
                height: 1.6,
                color: _textSecondary,
              ),
            )
          : Column(
              children: List.generate(sections.length, (index) {
                final section = sections[index];

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      section.label,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: _textPrimary,
                      ),
                    ),

                    const SizedBox(height: 8),

                    Text(
                      section.summary,
                      style: const TextStyle(
                        fontSize: 14,
                        height: 1.6,
                        color: _textSecondary,
                      ),
                    ),

                    if (index != sections.length - 1) ...[
                      const SizedBox(height: 16),
                      const Divider(height: 1, color: _border),
                      const SizedBox(height: 16),
                    ],
                  ],
                );
              }),
            ),
    );
  }

  // ─────────────────────────────────────────
  // 의료진 소견
  // ─────────────────────────────────────────

  Widget _buildDoctorOpinionCard(ExamResultSection section) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: const Color(0xFFEAF5FF),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.medical_services_outlined,
              size: 20,
              color: _primary,
            ),
          ),

          const SizedBox(width: 12),

          Expanded(
            child: Text(
              section.summary,
              style: const TextStyle(
                fontSize: 14,
                height: 1.65,
                color: Color(0xFF4E5968),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ─────────────────────────────────────────
  // 다음 계획
  // ─────────────────────────────────────────

  Widget _buildNextPlanCard(ExamResultSection section) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: const Color(0xFFEAF8F1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.event_available_outlined,
              size: 20,
              color: Color(0xFF20A66A),
            ),
          ),

          const SizedBox(width: 12),

          Expanded(
            child: Text(
              section.summary,
              style: const TextStyle(
                fontSize: 14,
                height: 1.65,
                color: Color(0xFF4E5968),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ─────────────────────────────────────────
  // 안내
  // ─────────────────────────────────────────

  Widget _buildNoticeCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: const Color(0xFFF1F7FF),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFDCEBFF)),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline_rounded, size: 19, color: _primary),

          SizedBox(width: 9),

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

  // ─────────────────────────────────────────
  // 하단 버튼
  // ─────────────────────────────────────────

  Widget _buildBackButton(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton(
        onPressed: () {
          Navigator.pop(context);
        },
        style: ElevatedButton.styleFrom(
          backgroundColor: _primary,
          foregroundColor: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: const Text(
          '목록으로 돌아가기',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
        ),
      ),
    );
  }

  // ─────────────────────────────────────────
  // section 분류
  // ─────────────────────────────────────────

  bool _isDoctorOpinion(ExamResultSection section) {
    return section.type == 'DOCTOR_OPINION' || section.label == '의료진 소견';
  }

  bool _isNextPlan(ExamResultSection section) {
    return section.type == 'NEXT_PLAN' || section.label == '다음 계획';
  }

  ExamResultSection? _findDoctorOpinion() {
    for (final section in exam.resultSections) {
      if (_isDoctorOpinion(section)) {
        return section;
      }
    }

    return null;
  }

  ExamResultSection? _findNextPlan() {
    for (final section in exam.resultSections) {
      if (_isNextPlan(section)) {
        return section;
      }
    }

    return null;
  }

  // ─────────────────────────────────────────
  // 날짜
  // ─────────────────────────────────────────

  String _formatDateTime(DateTime date) {
    final local = date.toLocal();

    final period = local.hour < 12 ? '오전' : '오후';

    final hour = local.hour == 0
        ? 12
        : local.hour > 12
        ? local.hour - 12
        : local.hour;

    final minute = local.minute.toString().padLeft(2, '0');

    return '${local.year}.'
        '${local.month.toString().padLeft(2, '0')}.'
        '${local.day.toString().padLeft(2, '0')} '
        '$period $hour:$minute';
  }
}
