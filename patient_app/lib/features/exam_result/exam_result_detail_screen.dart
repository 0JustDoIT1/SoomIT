import 'package:flutter/material.dart';

import 'models/exam_result.dart';

class ExamResultDetailScreen
    extends StatelessWidget {
  const ExamResultDetailScreen({
    super.key,
    required this.exam,
  });

  final ExamResult exam;

  static const Color _primary =
      Color(0xFF3198F4);

  static const Color _primaryDark =
      Color(0xFF2F8DFE);

  static const Color _textPrimary =
      Color(0xFF191F28);

  static const Color _textSecondary =
      Color(0xFF6B7684);

  static const Color _border =
      Color(0xFFE7EDF3);

  @override
  Widget build(BuildContext context) {
    final detailSections =
        exam.resultSections
            .where(
              (section) =>
                  !_isExcludedSection(
                section,
              ),
            )
            .toList();

    return Scaffold(
      backgroundColor:
          const Color(0xFFF5F9FD),

      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        foregroundColor: _textPrimary,

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
          physics:
              const BouncingScrollPhysics(),

          padding:
              const EdgeInsets.fromLTRB(
            20,
            18,
            20,
            32,
          ),

          child: Column(
            crossAxisAlignment:
                CrossAxisAlignment.start,

            children: [
              // =============================================
              // 검사 기본 정보
              // =============================================
              _buildExamSummaryCard(),

              const SizedBox(
                height: 26,
              ),

              // =============================================
              // 상세 결과
              // =============================================
              _buildSectionTitle(
                '상세 결과',
              ),

              const SizedBox(
                height: 12,
              ),

              if (detailSections.isEmpty)
                _buildEmptyResultCard()
              else
                ..._buildDetailWidgets(
                  detailSections,
                ),

              const SizedBox(
                height: 18,
              ),

              // =============================================
              // 안내
              // =============================================
              _buildNoticeCard(),

              const SizedBox(
                height: 26,
              ),

              _buildBackButton(
                context,
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ===========================================================
  // 섹션 제목
  // ===========================================================

  Widget _buildSectionTitle(
    String title,
  ) {
    return Text(
      title,
      style: const TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.w800,
        color: _textPrimary,
      ),
    );
  }

  // ===========================================================
  // 검사 정보 카드
  // ===========================================================

  Widget _buildExamSummaryCard() {
    return Container(
      width: double.infinity,

      padding:
          const EdgeInsets.all(18),

      decoration: BoxDecoration(
        color: Colors.white,

        borderRadius:
            BorderRadius.circular(20),

        border: Border.all(
          color: _border,
        ),

        boxShadow: [
          BoxShadow(
            color:
                const Color(
              0xFF172033,
            ).withValues(
              alpha: 0.035,
            ),

            blurRadius: 16,

            offset:
                const Offset(
              0,
              6,
            ),
          ),
        ],
      ),

      child: Column(
        crossAxisAlignment:
            CrossAxisAlignment.start,

        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 48,

                decoration:
                    BoxDecoration(
                  color:
                      const Color(
                    0xFFEAF5FF,
                  ),

                  borderRadius:
                      BorderRadius.circular(
                    14,
                  ),
                ),

                child: Icon(
                  _examIcon(),
                  size: 25,
                  color: _primaryDark,
                ),
              ),

              const SizedBox(
                width: 12,
              ),

              Expanded(
                child: Text(
                  _displayExamName(),

                  style:
                      const TextStyle(
                    fontSize: 19,
                    fontWeight:
                        FontWeight.w800,
                    color: _textPrimary,
                  ),
                ),
              ),

              Container(
                padding:
                    const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),

                decoration:
                    BoxDecoration(
                  color:
                      const Color(
                    0xFFEAF8F1,
                  ),

                  borderRadius:
                      BorderRadius.circular(
                    9,
                  ),
                ),

                child: Text(
                  exam.resultStatusLabel,

                  style:
                      const TextStyle(
                    fontSize: 11,
                    fontWeight:
                        FontWeight.w700,
                    color: Color(
                      0xFF20A66A,
                    ),
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(
            height: 16,
          ),

          _infoRow(
            Icons.calendar_month_outlined,
            '결과 확정일',
            _formatDateTime(
              exam.resultDate,
            ),
          ),

          if (exam.hospitalName != null &&
              exam.hospitalName!
                  .trim()
                  .isNotEmpty) ...[
            const SizedBox(
              height: 10,
            ),

            _infoRow(
              Icons.local_hospital_outlined,
              '검사 병원',
              exam.hospitalName!,
            ),
          ],
        ],
      ),
    );
  }

  // ===========================================================
  // 검사 정보 한 줄
  // ===========================================================

  Widget _infoRow(
    IconData icon,
    String label,
    String value,
  ) {
    return Row(
      crossAxisAlignment:
          CrossAxisAlignment.start,

      children: [
        Icon(
          icon,
          size: 18,
          color:
              const Color(
            0xFF7D8DA1,
          ),
        ),

        const SizedBox(
          width: 9,
        ),

        SizedBox(
          width: 78,

          child: Text(
            label,

            style:
                const TextStyle(
              fontSize: 13,
              color: Color(
                0xFF8B95A1,
              ),
            ),
          ),
        ),

        const SizedBox(
          width: 8,
        ),

        Expanded(
          child: Text(
            value,

            textAlign:
                TextAlign.right,

            style:
                const TextStyle(
              fontSize: 13,
              height: 1.4,
              fontWeight:
                  FontWeight.w600,
              color: _textPrimary,
            ),
          ),
        ),
      ],
    );
  }

  // ===========================================================
  // 검사별 상세 결과
  // ===========================================================

  List<Widget> _buildDetailWidgets(
    List<ExamResultSection> sections,
  ) {
    // =========================================================
    // 조직(유전자)검사
    //
    // 조직검사 + 유전자검사 + PD-L1
    // =========================================================

    if (exam.isPathologyGroup) {
      final pathology =
          sections
              .where(
                (section) =>
                    section.type
                        .startsWith(
                  'PATHOLOGY_',
                ),
              )
              .toList();

      final genes =
          sections
              .where(
                (section) =>
                    section.type
                        .startsWith(
                  'GENE_',
                ),
              )
              .toList();

      final pdl1 =
          sections
              .where(
                (section) =>
                    section.type
                        .startsWith(
                  'PDL1_',
                ),
              )
              .toList();

      final widgets = <Widget>[];

      // -------------------------------------------------------
      // 조직검사
      // -------------------------------------------------------

      if (pathology.isNotEmpty) {
        widgets.add(
          _buildGroupCard(
            title: '조직검사',
            icon:
                Icons.biotech_outlined,
            sections: pathology,
          ),
        );
      }

      // -------------------------------------------------------
      // 유전자검사
      // -------------------------------------------------------

      if (genes.isNotEmpty) {
        if (widgets.isNotEmpty) {
          widgets.add(
            const SizedBox(
              height: 12,
            ),
          );
        }

        widgets.add(
          _buildGroupCard(
            title: '유전자검사',
            icon:
                Icons.hub_outlined,
            sections: genes,
          ),
        );
      }

      // -------------------------------------------------------
      // PD-L1
      // -------------------------------------------------------

      if (pdl1.isNotEmpty) {
        if (widgets.isNotEmpty) {
          widgets.add(
            const SizedBox(
              height: 12,
            ),
          );
        }

        widgets.add(
          _buildGroupCard(
            title: 'PD-L1',
            icon:
                Icons.science_outlined,
            sections: pdl1,
          ),
        );
      }

      if (widgets.isNotEmpty) {
        return widgets;
      }
    }

    // =========================================================
    // PET-CT
    //
    // TNM 결과는 PET-CT 안에서 보여줌
    // =========================================================

    if (
        exam.examType ==
        'PET_CT_TNM') {
      return [
        _buildGroupCard(
          title:
              '병기 평가 결과',
          icon:
              Icons.analytics_outlined,
          sections: sections,
        ),
      ];
    }

    // =========================================================
    // CT
    // =========================================================

    if (exam.examType == 'CT') {
      return _buildCtDetailWidgets(
        sections,
      );
    }

    // =========================================================
    // X-ray
    // =========================================================

    return [
      _buildResultCard(
        sections,
      ),
    ];
  }

  // ===========================================================
  // CT 상세 결과
  // ===========================================================

  List<Widget> _buildCtDetailWidgets(
    List<ExamResultSection> sections,
  ) {
    // ---------------------------------------------------------
    // CT 전체 결과
    //
    // CT_NODULE_ 로 시작하지 않는 항목만
    // 전체 결과에 표시
    // ---------------------------------------------------------

    final overallSections =
        sections
            .where(
              (section) =>
                  !section.type
                      .startsWith(
                'CT_NODULE_',
              ),
            )
            .toList();

    // ---------------------------------------------------------
    // 결절별 그룹
    //
    // 예:
    // CT_NODULE_1_LOCATION
    // CT_NODULE_1_SIZE
    // CT_NODULE_2_LOCATION
    //
    // → 1, 2 단위로 묶음
    // ---------------------------------------------------------

    final Map<
        int,
        List<ExamResultSection>>
        noduleGroups = {};

    final pattern = RegExp(
      r'^CT_NODULE_(\d+)_(.+)$',
    );

    for (final section in sections) {
      final match =
          pattern.firstMatch(
        section.type,
      );

      if (match == null) {
        continue;
      }

      final noduleNo =
          int.tryParse(
        match.group(1) ?? '',
      );

      if (noduleNo == null) {
        continue;
      }

      noduleGroups
          .putIfAbsent(
            noduleNo,
            () => [],
          )
          .add(
            section,
          );
    }

    final widgets = <Widget>[];

    // ---------------------------------------------------------
    // 전체 CT 결과
    // ---------------------------------------------------------

    if (overallSections.isNotEmpty) {
      widgets.add(
        _buildCtOverallCard(
          overallSections,
        ),
      );
    }

    // ---------------------------------------------------------
    // 결절별 상세
    // ---------------------------------------------------------

    if (noduleGroups.isNotEmpty) {
      if (widgets.isNotEmpty) {
        widgets.add(
          const SizedBox(
            height: 20,
          ),
        );
      }

      widgets.add(
        Row(
          children: [
            const Expanded(
              child: Text(
                '결절별 상세',
                style:
                    TextStyle(
                  fontSize: 16,
                  fontWeight:
                      FontWeight.w800,
                  color:
                      _textPrimary,
                ),
              ),
            ),

            Text(
              '총 ${noduleGroups.length}개',

              style:
                  const TextStyle(
                fontSize: 13,
                fontWeight:
                    FontWeight.w600,
                color:
                    _textSecondary,
              ),
            ),
          ],
        ),
      );

      widgets.add(
        const SizedBox(
          height: 10,
        ),
      );

      final sortedNumbers =
          noduleGroups.keys
              .toList()
            ..sort();

      for (
        var index = 0;
        index <
            sortedNumbers.length;
        index++
      ) {
        final number =
            sortedNumbers[index];

        widgets.add(
          _buildNoduleCard(
            number,
            noduleGroups[number]!,
          ),
        );

        if (
            index !=
            sortedNumbers.length -
                1) {
          widgets.add(
            const SizedBox(
              height: 12,
            ),
          );
        }
      }
    }

    return widgets;
  }

  // ===========================================================
  // CT 전체 결과 카드
  // ===========================================================

  Widget _buildCtOverallCard(
    List<ExamResultSection> sections,
  ) {
    return Container(
      width: double.infinity,

      decoration: BoxDecoration(
        color: Colors.white,

        borderRadius:
            BorderRadius.circular(18),

        border: Border.all(
          color: _border,
        ),
      ),

      child: Column(
        crossAxisAlignment:
            CrossAxisAlignment.start,

        children: [
          Padding(
            padding:
                const EdgeInsets.fromLTRB(
              16,
              15,
              16,
              13,
            ),

            child: Row(
              children: [
                Container(
                  width: 34,
                  height: 34,

                  decoration:
                      BoxDecoration(
                    color:
                        const Color(
                      0xFFEAF5FF,
                    ),

                    borderRadius:
                        BorderRadius.circular(
                      10,
                    ),
                  ),

                  child:
                      const Icon(
                    Icons
                        .analytics_outlined,
                    size: 18,
                    color:
                        _primaryDark,
                  ),
                ),

                const SizedBox(
                  width: 10,
                ),

                const Text(
                  '전체 CT 결과',

                  style:
                      TextStyle(
                    fontSize: 15,
                    fontWeight:
                        FontWeight.w800,
                    color:
                        _textPrimary,
                  ),
                ),
              ],
            ),
          ),

          const Divider(
            height: 1,
            color:
                Color(
              0xFFEEF2F6,
            ),
          ),

          Padding(
            padding:
                const EdgeInsets.symmetric(
              horizontal: 17,
              vertical: 4,
            ),

            child: Column(
              children:
                  List.generate(
                sections.length,
                (index) {
                  final section =
                      sections[index];

                  return Column(
                    children: [
                      _resultRow(
                        section.label,
                        section.summary,
                      ),

                      if (index !=
                          sections.length -
                              1)
                        const Divider(
                          height: 1,
                          color:
                              Color(
                            0xFFEEF2F6,
                          ),
                        ),
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ===========================================================
  // 결절별 결과 카드
  // ===========================================================

  Widget _buildNoduleCard(
    int number,
    List<ExamResultSection> sections,
  ) {
    return Container(
      width: double.infinity,

      decoration: BoxDecoration(
        color: Colors.white,

        borderRadius:
            BorderRadius.circular(
          18,
        ),

        border: Border.all(
          color: _border,
        ),
      ),

      child: Column(
        crossAxisAlignment:
            CrossAxisAlignment.start,

        children: [
          // -------------------------------------------------
          // Header
          // -------------------------------------------------

          Padding(
            padding:
                const EdgeInsets.fromLTRB(
              16,
              14,
              16,
              13,
            ),

            child: Row(
              children: [
                Container(
                  width: 34,
                  height: 34,

                  alignment:
                      Alignment.center,

                  decoration:
                      BoxDecoration(
                    color:
                        const Color(
                      0xFFEAF5FF,
                    ),

                    borderRadius:
                        BorderRadius.circular(
                      10,
                    ),
                  ),

                  child: Text(
                    '$number',

                    style:
                        const TextStyle(
                      fontSize: 14,
                      fontWeight:
                          FontWeight.w800,
                      color:
                          _primaryDark,
                    ),
                  ),
                ),

                const SizedBox(
                  width: 10,
                ),

                Text(
                  '결절 $number',

                  style:
                      const TextStyle(
                    fontSize: 15,
                    fontWeight:
                        FontWeight.w800,
                    color:
                        _textPrimary,
                  ),
                ),
              ],
            ),
          ),

          const Divider(
            height: 1,
            color:
                Color(
              0xFFEEF2F6,
            ),
          ),

          // -------------------------------------------------
          // 결과
          // -------------------------------------------------

          Padding(
            padding:
                const EdgeInsets.symmetric(
              horizontal: 17,
              vertical: 4,
            ),

            child: Column(
              children:
                  List.generate(
                sections.length,
                (index) {
                  final section =
                      sections[index];

                  return Column(
                    children: [
                      _resultRow(
                        section.label,
                        section.summary,
                      ),

                      if (index !=
                          sections.length -
                              1)
                        const Divider(
                          height: 1,
                          color:
                              Color(
                            0xFFEEF2F6,
                          ),
                        ),
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ===========================================================
  // 일반 X-ray 결과 카드
  // ===========================================================

  Widget _buildResultCard(
    List<ExamResultSection> sections,
  ) {
    return Container(
      width: double.infinity,

      padding:
          const EdgeInsets.symmetric(
        horizontal: 17,
        vertical: 4,
      ),

      decoration: BoxDecoration(
        color: Colors.white,

        borderRadius:
            BorderRadius.circular(
          18,
        ),

        border: Border.all(
          color: _border,
        ),
      ),

      child: Column(
        children:
            List.generate(
          sections.length,
          (index) {
            final section =
                sections[index];

            return Column(
              children: [
                _resultRow(
                  section.label,
                  section.summary,
                ),

                if (
                    index !=
                    sections.length -
                        1)
                  const Divider(
                    height: 1,
                    color:
                        Color(
                      0xFFEEF2F6,
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }

  // ===========================================================
  // 조직 / 유전자 / PD-L1 / TNM 카드
  // ===========================================================

  Widget _buildGroupCard({
    required String title,
    required IconData icon,
    required List<ExamResultSection>
        sections,
  }) {
    return Container(
      width: double.infinity,

      decoration: BoxDecoration(
        color: Colors.white,

        borderRadius:
            BorderRadius.circular(
          18,
        ),

        border: Border.all(
          color: _border,
        ),
      ),

      child: Column(
        crossAxisAlignment:
            CrossAxisAlignment.start,

        children: [
          Padding(
            padding:
                const EdgeInsets.fromLTRB(
              16,
              15,
              16,
              13,
            ),

            child: Row(
              children: [
                Container(
                  width: 34,
                  height: 34,

                  decoration:
                      BoxDecoration(
                    color:
                        const Color(
                      0xFFEAF5FF,
                    ),

                    borderRadius:
                        BorderRadius.circular(
                      10,
                    ),
                  ),

                  child: Icon(
                    icon,
                    size: 18,
                    color:
                        _primaryDark,
                  ),
                ),

                const SizedBox(
                  width: 10,
                ),

                Text(
                  title,

                  style:
                      const TextStyle(
                    fontSize: 15,
                    fontWeight:
                        FontWeight.w800,
                    color:
                        _textPrimary,
                  ),
                ),
              ],
            ),
          ),

          const Divider(
            height: 1,
            color:
                Color(
              0xFFEEF2F6,
            ),
          ),

          Padding(
            padding:
                const EdgeInsets.symmetric(
              horizontal: 17,
              vertical: 4,
            ),

            child: Column(
              children:
                  List.generate(
                sections.length,
                (index) {
                  final section =
                      sections[index];

                  return Column(
                    children: [
                      _resultRow(
                        section.label,
                        section.summary,
                      ),

                      if (index !=
                          sections.length -
                              1)
                        const Divider(
                          height: 1,
                          color:
                              Color(
                            0xFFEEF2F6,
                          ),
                        ),
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ===========================================================
  // 결과 Row
  // ===========================================================

  Widget _resultRow(
    String label,
    String value,
  ) {
    return Padding(
      padding:
          const EdgeInsets.symmetric(
        vertical: 14,
      ),

      child: Row(
        crossAxisAlignment:
            CrossAxisAlignment.start,

        children: [
          Expanded(
            child: Text(
              label,

              style:
                  const TextStyle(
                fontSize: 14,
                fontWeight:
                    FontWeight.w600,
                color:
                    _textSecondary,
              ),
            ),
          ),

          const SizedBox(
            width: 18,
          ),

          Flexible(
            child: Text(
              value,

              textAlign:
                  TextAlign.right,

              style:
                  const TextStyle(
                fontSize: 15,
                height: 1.4,
                fontWeight:
                    FontWeight.w800,
                color:
                    _textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ===========================================================
  // 상세 결과 없음
  // ===========================================================

  Widget _buildEmptyResultCard() {
    return Container(
      width: double.infinity,

      padding:
          const EdgeInsets.symmetric(
        horizontal: 18,
        vertical: 28,
      ),

      decoration: BoxDecoration(
        color: Colors.white,

        borderRadius:
            BorderRadius.circular(
          18,
        ),

        border: Border.all(
          color: _border,
        ),
      ),

      child:
          const Column(
        children: [
          Icon(
            Icons
                .description_outlined,
            size: 34,
            color:
                Color(
              0xFFB0B8C1,
            ),
          ),

          SizedBox(
            height: 10,
          ),

          Text(
            '등록된 상세 검사 결과가 없습니다.',

            textAlign:
                TextAlign.center,

            style:
                TextStyle(
              fontSize: 14,
              color:
                  _textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  // ===========================================================
  // 안내 카드
  // ===========================================================

  Widget _buildNoticeCard() {
    return Container(
      width: double.infinity,

      padding:
          const EdgeInsets.all(
        15,
      ),

      decoration: BoxDecoration(
        color:
            const Color(
          0xFFF3F8FF,
        ),

        borderRadius:
            BorderRadius.circular(
          14,
        ),

        border: Border.all(
          color:
              const Color(
            0xFFDCEBFF,
          ),
        ),
      ),

      child:
          const Row(
        crossAxisAlignment:
            CrossAxisAlignment.start,

        children: [
          Icon(
            Icons
                .info_outline_rounded,
            size: 20,
            color:
                _primary,
          ),

          SizedBox(
            width: 10,
          ),

          Expanded(
            child: Text(
              '검사 결과에 대한 자세한 설명은 담당 의료진과 상담해주세요.',

              style:
                  TextStyle(
                fontSize: 13,
                height: 1.5,
                color:
                    _textSecondary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ===========================================================
  // 목록으로 돌아가기
  // ===========================================================

  Widget _buildBackButton(
    BuildContext context,
  ) {
    return SizedBox(
      width: double.infinity,
      height: 50,

      child: ElevatedButton(
        onPressed: () {
          Navigator.pop(context);
        },

        style:
            ElevatedButton.styleFrom(
          backgroundColor:
              _primaryDark,

          foregroundColor:
              Colors.white,

          elevation: 0,

          shape:
              RoundedRectangleBorder(
            borderRadius:
                BorderRadius.circular(
              14,
            ),
          ),
        ),

        child:
            const Text(
          '목록으로 돌아가기',

          style:
              TextStyle(
            fontSize: 15,
            fontWeight:
                FontWeight.w800,
          ),
        ),
      ),
    );
  }

  // ===========================================================
  // 환자앱 표시 검사명
  // ===========================================================

  String _displayExamName() {
    switch (exam.examType) {
      case 'PATHOLOGY_GENE':
      case 'PDL1':
        return '조직(유전자)검사';

      case 'PET_CT_TNM':
        return 'PET-CT';

      case 'XRAY':
        return '흉부 X-ray';

      case 'CT':
        return '흉부 CT';

      default:
        return exam.examName;
    }
  }

  // ===========================================================
  // 검사 아이콘
  // ===========================================================

  IconData _examIcon() {
    switch (exam.examType) {
      case 'XRAY':
        return Icons.image_outlined;

      case 'CT':
        return Icons.view_in_ar_outlined;

      case 'PET_CT_TNM':
        return Icons.analytics_outlined;

      case 'PATHOLOGY_GENE':
      case 'PDL1':
        return Icons.biotech_outlined;

      default:
        return Icons.science_outlined;
    }
  }

  // ===========================================================
  // 환자에게 보여주지 않는 결과
  // ===========================================================

  static bool _isExcludedSection(
    ExamResultSection section,
  ) {
    final value =
        '${section.type} ${section.label}'
            .toUpperCase();

    return value.contains(
          'DOCTOR_OPINION',
        ) ||
        value.contains(
          'MEDICAL_OPINION',
        ) ||
        value.contains(
          '의료진 소견',
        ) ||
        value.contains(
          'NEXT_PLAN',
        ) ||
        value.contains(
          '다음 계획',
        ) ||
        value.contains(
          'FOLLOW_UP',
        ) ||
        value.contains(
          'RECOMMENDATION',
        ) ||
        value.contains(
          'FINDING_SUMMARY',
        ) ||
        value.contains(
          'DIAGNOSIS_SUMMARY',
        ) ||
        value.contains(
          'INTERPRETATION',
        ) ||
        value.contains(
          '결과 해석',
        );
  }

  // ===========================================================
  // 날짜
  // ===========================================================

  String _formatDateTime(
    DateTime date,
  ) {
    final local =
        date.toLocal();

    final month =
        local.month
            .toString()
            .padLeft(
              2,
              '0',
            );

    final day =
        local.day
            .toString()
            .padLeft(
              2,
              '0',
            );

    final minute =
        local.minute
            .toString()
            .padLeft(
              2,
              '0',
            );

    final period =
        local.hour < 12
            ? '오전'
            : '오후';

    final hour =
        local.hour == 0
            ? 12
            : local.hour > 12
                ? local.hour - 12
                : local.hour;

    return '${local.year}.'
        '$month.'
        '$day '
        '$period '
        '${hour.toString().padLeft(2, '0')}:'
        '$minute';
  }
}