import 'package:flutter/material.dart';

import 'exam_result_detail_screen.dart';

import 'mock/exam_result_mock.dart';

import 'models/exam_result.dart';

import 'services/exam_result_service.dart';

bool _isDarkMode(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark;

Color _pageBackground(BuildContext context) =>
    _isDarkMode(context) ? Color(0xFF101820) : Color(0xFFF5F9FD);

Color _surfaceColor(BuildContext context) =>
    _isDarkMode(context) ? Color(0xFF17212B) : Colors.white;

Color _surfaceAltColor(BuildContext context) =>
    _isDarkMode(context) ? Color(0xFF1B2834) : Color(0xFFF8FBFE);

Color _textPrimaryColor(BuildContext context) =>
    _isDarkMode(context) ? Color(0xFFF5F7FA) : Color(0xFF191F28);

Color _textSecondaryColor(BuildContext context) =>
    _isDarkMode(context) ? Color(0xFFC6D0DA) : Color(0xFF4E5968);

Color _mutedTextColor(BuildContext context) =>
    _isDarkMode(context) ? Color(0xFF9EACBA) : Color(0xFF8B95A1);

Color _borderColor(BuildContext context) =>
    _isDarkMode(context) ? Color(0xFF2A3948) : Color(0xFFE8EEF5);

Color _softBlueColor(BuildContext context) =>
    _isDarkMode(context) ? Color(0xFF1A3147) : Color(0xFFF0F7FF);

Color _chevronColor(BuildContext context) =>
    _isDarkMode(context) ? Color(0xFF718293) : Color(0xFFB0B8C1);

class ExamResultScreen extends StatefulWidget {
  const ExamResultScreen({super.key});

  @override
  State<ExamResultScreen> createState() => _ExamResultScreenState();
}

class _ExamResultScreenState extends State<ExamResultScreen>
    with SingleTickerProviderStateMixin {
  static const bool _useMockResults = false;

  static const Color _primary = Color(0xFF3198F4);

  static const Color _primaryDark = Color(0xFF2F8DFE);

  static const Color _textPrimary = Color(0xFF191F28);

  static const Color _textSecondary = Color(0xFF6B7684);

  static const Color _border = Color(0xFFE7EDF3);

  static const Color _background = Color(0xFFF5F9FD);

  int _selectedTab = 0;

  late final TabController _tabController;

  String _selectedResultFilter = '전체';

  final ExamResultService _examResultService = ExamResultService();

  late Future<List<ExamResult>> _resultsFuture;

  /// 검사 안내에서 펼쳐져 있는 카드 index

  int? _expandedGuideIndex;

  @override
  void initState() {
    super.initState();

    _tabController = TabController(
      length: 2,

      vsync: this,

      initialIndex: _selectedTab,
    );

    _loadResults();
  }

  @override
  void dispose() {
    _tabController.dispose();

    super.dispose();
  }

  void _loadResults() {
    _resultsFuture = _useMockResults
        ? Future.value(mockExamResults)
        : _examResultService.getExamResults();
  }

  void _retryResults() {
    setState(_loadResults);
  }

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: _pageBackground(context),

      child: SafeArea(
        bottom: false,

        child: Column(
          children: [
            _buildTopHeader(),

            Expanded(
              child: ColoredBox(
                color: _pageBackground(context),

                child: IndexedStack(
                  index: _selectedTab,

                  children: [_buildResultTab(), _buildGuideTab()],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ============================================================

  // 상단 영역

  // ============================================================

  Widget _buildTopHeader() {
    final bool isResultTab = _selectedTab == 0;

    return Container(
      width: double.infinity,

      color: _surfaceColor(context),

      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,

        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),

            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,

              children: [
                Text(
                  isResultTab ? '검사 결과' : '검사 안내',

                  style: TextStyle(
                    fontSize: 22,

                    fontWeight: FontWeight.w800,

                    color: _textPrimaryColor(context),
                  ),
                ),

                SizedBox(height: 6),

                Text(
                  isResultTab
                      ? '진행한 검사 결과를 확인해보세요.'
                      : '검사별 준비사항과 주의사항을 확인해보세요.',

                  style: TextStyle(
                    fontSize: 13,

                    height: 1.4,

                    color: _mutedTextColor(context),
                  ),
                ),
              ],
            ),
          ),

          SizedBox(height: 10),

          _buildTabBar(),
        ],
      ),
    );
  }

  Widget _buildTabBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),

      child: TabBar(
        controller: _tabController,

        indicatorColor: _primaryDark,

        indicatorWeight: 2.5,

        indicatorSize: TabBarIndicatorSize.label,

        labelColor: _primaryDark,

        unselectedLabelColor: _mutedTextColor(context),

        labelStyle: TextStyle(fontSize: 14, fontWeight: FontWeight.w800),

        unselectedLabelStyle: TextStyle(
          fontSize: 14,

          fontWeight: FontWeight.w600,
        ),

        dividerColor: Colors.transparent,

        dividerHeight: 0,

        onTap: (index) {
          setState(() {
            _selectedTab = index;
          });
        },

        tabs: [
          Tab(text: '검사 결과'),

          Tab(text: '검사 안내'),
        ],
      ),
    );
  }

  // ============================================================

  // 검사 결과 탭

  // ============================================================

  Widget _buildResultTab() {
    return FutureBuilder<List<ExamResult>>(
      future: _resultsFuture,

      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return Center(child: CircularProgressIndicator(color: _primary));
        }

        if (snapshot.hasError) {
          return _buildResultErrorState();
        }

        final results = snapshot.data ?? [];

        if (results.isEmpty) {
          return RefreshIndicator(
            color: _primaryDark,

            onRefresh: () async {
              setState(_loadResults);

              await _resultsFuture;
            },

            child: _buildEmptyResultState(),
          );
        }

        final visibleResults = results.where((exam) {
          if (_selectedResultFilter == '전체') {
            return true;
          }

          return _resultCategory(exam) == _selectedResultFilter;
        }).toList();

        return RefreshIndicator(
          color: _primaryDark,

          onRefresh: () async {
            setState(_loadResults);

            await _resultsFuture;
          },

          child: ListView(
            physics: AlwaysScrollableScrollPhysics(
              parent: BouncingScrollPhysics(),
            ),

            padding: const EdgeInsets.fromLTRB(20, 18, 20, 30),

            children: [
              _buildResultFilters(results),

              SizedBox(height: 18),

              if (visibleResults.isEmpty)
                _buildFilteredEmptyState('해당 분류의 검사 결과가 없어요.')
              else
                ...visibleResults.map(
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

  Widget _buildResultFilters(List<ExamResult> results) {
    const filters = ['전체', '영상', '병리'];

    int countFor(String filter) {
      if (filter == '전체') {
        return results.length;
      }

      return results.where((item) => _resultCategory(item) == filter).length;
    }

    return Row(
      children: filters.map((filter) {
        final selected = _selectedResultFilter == filter;

        final count = countFor(filter);

        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(right: filter == filters.last ? 0 : 8),

            child: InkWell(
              onTap: () {
                setState(() {
                  _selectedResultFilter = filter;
                });
              },

              borderRadius: BorderRadius.circular(999),

              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 9),

                decoration: BoxDecoration(
                  color: selected ? _primaryDark : _surfaceAltColor(context),

                  borderRadius: BorderRadius.circular(999),

                  border: Border.all(
                    color: selected ? _primaryDark : _borderColor(context),
                  ),
                ),

                child: Text(
                  '$filter ($count)',

                  textAlign: TextAlign.center,

                  style: TextStyle(
                    fontSize: 12,

                    fontWeight: FontWeight.w700,

                    color: selected
                        ? Colors.white
                        : _textSecondaryColor(context),
                  ),
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildResultCard(ExamResult exam) {
    final bool isPathology = _resultCategory(exam) == '병리';

    return Material(
      color: _surfaceColor(context),

      borderRadius: BorderRadius.circular(18),

      child: InkWell(
        borderRadius: BorderRadius.circular(18),

        onTap: () {
          Navigator.push(
            context,

            MaterialPageRoute(
              builder: (_) => ExamResultDetailScreen(exam: exam),
            ),
          );
        },

        child: Container(
          width: double.infinity,

          padding: const EdgeInsets.all(16),

          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),

            border: Border.all(color: _borderColor(context)),

            boxShadow: [
              BoxShadow(
                color: _isDarkMode(context)
                    ? Colors.black.withValues(alpha: 0.14)
                    : Color(0xFF172033).withValues(alpha: 0.025),

                blurRadius: 12,

                offset: Offset(0, 4),
              ),
            ],
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
                      color: isPathology
                          ? Color(0xFFF8F1FF)
                          : Color(0xFFF0FBF6),

                      borderRadius: BorderRadius.circular(12),
                    ),

                    child: Icon(
                      isPathology
                          ? Icons.biotech_outlined
                          : Icons.fact_check_outlined,

                      color: isPathology
                          ? Color(0xFF8C63D9)
                          : Color(0xFF20A66A),

                      size: 23,
                    ),
                  ),

                  SizedBox(width: 12),

                  Expanded(
                    child: Text(
                      exam.examName,

                      style: TextStyle(
                        fontSize: 17,

                        fontWeight: FontWeight.w800,

                        color: _textPrimaryColor(context),
                      ),
                    ),
                  ),

                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,

                      vertical: 5,
                    ),

                    decoration: BoxDecoration(
                      color: Color(0xFFEAF8F1),

                      borderRadius: BorderRadius.circular(8),
                    ),

                    child: Text(
                      exam.resultStatusLabel,

                      style: TextStyle(
                        fontSize: 11,

                        fontWeight: FontWeight.w700,

                        color: Color(0xFF20A66A),
                      ),
                    ),
                  ),
                ],
              ),

              SizedBox(height: 12),

              Row(
                children: [
                  Icon(
                    Icons.calendar_today_outlined,

                    size: 16,

                    color: _mutedTextColor(context),
                  ),

                  SizedBox(width: 6),

                  Text(
                    _formatDate(exam.resultDate),

                    style: TextStyle(
                      fontSize: 13,

                      color: _mutedTextColor(context),
                    ),
                  ),
                ],
              ),

              SizedBox(height: 10),

              Text(
                exam.resultSummary,

                maxLines: 2,

                overflow: TextOverflow.ellipsis,

                style: TextStyle(
                  fontSize: 13,

                  height: 1.5,

                  color: _textSecondaryColor(context),
                ),
              ),

              SizedBox(height: 12),

              Row(
                mainAxisAlignment: MainAxisAlignment.end,

                children: [
                  Text(
                    '결과 자세히 보기',

                    style: TextStyle(
                      fontSize: 13,

                      fontWeight: FontWeight.w700,

                      color: _primaryDark,
                    ),
                  ),

                  SizedBox(width: 2),

                  Icon(
                    Icons.chevron_right_rounded,

                    size: 20,

                    color: _primaryDark,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ============================================================

  // 검사 안내 탭

  // ============================================================

  Widget _buildGuideTab() {
    final guides = _examGuides;

    return ListView(
      physics: BouncingScrollPhysics(),

      padding: const EdgeInsets.fromLTRB(20, 18, 20, 30),

      children: [
        _buildGuideIntro(),

        SizedBox(height: 16),

        ...List.generate(
          guides.length,

          (index) => Padding(
            padding: const EdgeInsets.only(bottom: 12),

            child: _buildGuideCard(guide: guides[index], index: index),
          ),
        ),

        SizedBox(height: 4),

        _buildGuideNotice(),
      ],
    );
  }

  Widget _buildGuideIntro() {
    return Container(
      width: double.infinity,

      padding: const EdgeInsets.all(15),

      decoration: BoxDecoration(
        color: _softBlueColor(context),

        borderRadius: BorderRadius.circular(16),

        border: Border.all(
          color: _isDarkMode(context) ? Color(0xFF2A4961) : Color(0xFFD6EAFB),
        ),
      ),

      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,

        children: [
          Icon(Icons.info_outline_rounded, color: _primaryDark, size: 20),

          SizedBox(width: 10),

          Expanded(
            child: Text(
              '검사 종류를 선택하면 검사 전 준비사항과 '
              '검사 후 주의사항을 확인할 수 있어요.',

              style: TextStyle(
                fontSize: 12.5,

                height: 1.5,

                fontWeight: FontWeight.w500,

                color: _textSecondaryColor(context),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGuideCard({required _ExamGuide guide, required int index}) {
    final bool expanded = _expandedGuideIndex == index;

    return AnimatedContainer(
      duration: Duration(milliseconds: 180),

      decoration: BoxDecoration(
        color: _surfaceColor(context),

        borderRadius: BorderRadius.circular(18),

        border: Border.all(
          color: expanded
              ? (_isDarkMode(context) ? Color(0xFF31506B) : Color(0xFFD8E9FA))
              : _borderColor(context),
        ),

        boxShadow: [
          BoxShadow(
            color: _isDarkMode(context)
                ? Colors.black.withValues(alpha: 0.14)
                : Color(0xFF172033).withValues(alpha: 0.025),

            blurRadius: 12,

            offset: Offset(0, 4),
          ),
        ],
      ),

      child: Column(
        children: [
          InkWell(
            onTap: () {
              setState(() {
                if (_expandedGuideIndex == index) {
                  _expandedGuideIndex = null;
                } else {
                  _expandedGuideIndex = index;
                }
              });
            },

            borderRadius: BorderRadius.circular(18),

            child: Padding(
              padding: const EdgeInsets.all(16),

              child: Row(
                children: [
                  Container(
                    width: 46,

                    height: 46,

                    decoration: BoxDecoration(
                      color: guide.iconBackground,

                      borderRadius: BorderRadius.circular(13),
                    ),

                    child: Icon(guide.icon, color: guide.iconColor, size: 25),
                  ),

                  SizedBox(width: 12),

                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,

                      children: [
                        Text(
                          guide.title,

                          style: TextStyle(
                            fontSize: 16,

                            fontWeight: FontWeight.w800,

                            color: _textPrimaryColor(context),
                          ),
                        ),

                        SizedBox(height: 4),

                        Text(
                          guide.description,

                          style: TextStyle(
                            fontSize: 12,

                            height: 1.4,

                            color: _mutedTextColor(context),
                          ),
                        ),
                      ],
                    ),
                  ),

                  SizedBox(width: 8),

                  AnimatedRotation(
                    turns: expanded ? 0.5 : 0,

                    duration: Duration(milliseconds: 180),

                    child: Icon(
                      Icons.keyboard_arrow_down_rounded,

                      color: Color(0xFF7D8DA1),

                      size: 25,
                    ),
                  ),
                ],
              ),
            ),
          ),

          AnimatedCrossFade(
            duration: Duration(milliseconds: 200),

            crossFadeState: expanded
                ? CrossFadeState.showSecond
                : CrossFadeState.showFirst,

            firstChild: SizedBox(width: double.infinity, height: 0),

            secondChild: _buildGuideDetail(guide),
          ),
        ],
      ),
    );
  }

  Widget _buildGuideDetail(_ExamGuide guide) {
    return Container(
      width: double.infinity,

      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: _borderColor(context))),
      ),

      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),

        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,

          children: [
            _buildGuideSection(
              icon: Icons.assignment_outlined,

              iconColor: _primaryDark,

              iconBackground: Color(0xFFEAF5FF),

              title: '검사 전 준비사항',

              titleColor: _primaryDark,

              contents: guide.beforeExam,
            ),

            SizedBox(height: 20),

            _buildGuideSection(
              icon: Icons.local_hospital_outlined,

              iconColor: Color(0xFF8467D7),

              iconBackground: Color(0xFFF2EEFF),

              title: '검사 당일 안내',

              titleColor: Color(0xFF8467D7),

              contents: guide.examDay,
            ),

            SizedBox(height: 20),

            _buildGuideSection(
              icon: Icons.health_and_safety_outlined,

              iconColor: Color(0xFF20A66A),

              iconBackground: Color(0xFFEAF8F1),

              title: '검사 후 주의사항',

              titleColor: Color(0xFF20A66A),

              contents: guide.afterExam,
            ),

            SizedBox(height: 20),

            _buildResultGuideSection(),

            SizedBox(height: 18),

            Container(
              width: double.infinity,

              padding: const EdgeInsets.all(12),

              decoration: BoxDecoration(
                color: _surfaceAltColor(context),

                borderRadius: BorderRadius.circular(12),
              ),

              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,

                children: [
                  Icon(
                    Icons.info_outline_rounded,

                    size: 17,

                    color: Color(0xFF7D8DA1),
                  ),

                  SizedBox(width: 8),

                  Expanded(
                    child: Text(
                      '개인의 상태와 검사 방법에 따라 준비사항이 '
                      '달라질 수 있으니 정확한 내용은 병원 안내를 따라주세요.',

                      style: TextStyle(
                        fontSize: 11.5,

                        height: 1.5,

                        color: _textSecondaryColor(context),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGuideSection({
    required IconData icon,

    required Color iconColor,

    required Color iconBackground,

    required String title,

    required Color titleColor,

    required List<String> contents,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,

      children: [
        Container(
          width: 34,

          height: 34,

          decoration: BoxDecoration(
            color: iconBackground,

            borderRadius: BorderRadius.circular(10),
          ),

          child: Icon(icon, color: iconColor, size: 19),
        ),

        SizedBox(width: 11),

        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,

            children: [
              Text(
                title,

                style: TextStyle(
                  fontSize: 14,

                  fontWeight: FontWeight.w800,

                  color: titleColor,
                ),
              ),

              SizedBox(height: 7),

              ...contents.map(
                (text) => Padding(
                  padding: const EdgeInsets.only(bottom: 5),

                  child: _buildBulletText(text),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildBulletText(String text) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,

      children: [
        Padding(
          padding: const EdgeInsets.only(top: 7),

          child: Container(
            width: 3,

            height: 3,

            decoration: BoxDecoration(
              color: _mutedTextColor(context),

              shape: BoxShape.circle,
            ),
          ),
        ),

        SizedBox(width: 7),

        Expanded(
          child: Text(
            text,

            style: TextStyle(
              fontSize: 12,

              height: 1.5,

              color: _textSecondaryColor(context),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildResultGuideSection() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,

      children: [
        Container(
          width: 34,

          height: 34,

          decoration: BoxDecoration(
            color: Color(0xFFF0EEFF),

            borderRadius: BorderRadius.circular(10),
          ),

          child: Icon(
            Icons.description_outlined,

            color: Color(0xFF7165D9),

            size: 19,
          ),
        ),

        SizedBox(width: 11),

        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,

            children: [
              Text(
                '결과 확인 안내',

                style: TextStyle(
                  fontSize: 14,

                  fontWeight: FontWeight.w800,

                  color: Color(0xFF7165D9),
                ),
              ),

              SizedBox(height: 7),

              Text(
                '검사 결과가 등록되면 검사 결과 탭에서 확인할 수 있어요.',

                style: TextStyle(
                  fontSize: 12,

                  height: 1.5,

                  color: _textSecondaryColor(context),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildGuideNotice() {
    return Container(
      width: double.infinity,

      padding: const EdgeInsets.all(14),

      decoration: BoxDecoration(
        color: _softBlueColor(context),

        borderRadius: BorderRadius.circular(14),
      ),

      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,

        children: [
          Icon(Icons.info_outline_rounded, color: Color(0xFF6995BB), size: 19),

          SizedBox(width: 9),

          Expanded(
            child: Text(
              '검사 안내는 일반적인 참고 정보입니다. '
              '실제 검사 전에는 의료진과 병원에서 제공한 안내를 우선해서 확인해주세요.',

              style: TextStyle(
                fontSize: 11.5,

                height: 1.5,

                color: Color(0xFF698199),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ============================================================

  // 빈 상태 / 오류

  // ============================================================

  Widget _buildFilteredEmptyState(String text) {
    return Container(
      width: double.infinity,

      margin: const EdgeInsets.only(top: 14),

      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 36),

      decoration: BoxDecoration(
        color: _surfaceColor(context),

        borderRadius: BorderRadius.circular(18),

        border: Border.all(color: _borderColor(context)),
      ),

      child: Column(
        children: [
          Icon(Icons.inbox_outlined, size: 40, color: Color(0xFFB0B8C1)),

          SizedBox(height: 10),

          Text(text, style: TextStyle(fontSize: 14, color: _textSecondary)),
        ],
      ),
    );
  }

  Widget _buildEmptyResultState() {
    return ListView(
      physics: AlwaysScrollableScrollPhysics(),

      padding: const EdgeInsets.fromLTRB(16, 22, 16, 28),

      children: [
        Container(
          padding: const EdgeInsets.fromLTRB(22, 34, 22, 32),

          decoration: BoxDecoration(
            color: _surfaceColor(context),

            borderRadius: BorderRadius.circular(24),

            border: Border.all(color: Color(0xFFE2ECF5)),

            boxShadow: [
              BoxShadow(
                color: Color(0x0C1B4B72),

                blurRadius: 16,

                offset: Offset(0, 7),
              ),
            ],
          ),

          child: Column(
            children: [
              CircleAvatar(
                radius: 38,

                backgroundColor: Color(0xFFEAF6FF),

                child: Icon(
                  Icons.fact_check_rounded,

                  size: 38,

                  color: Color(0xFF35AEE2),
                ),
              ),

              SizedBox(height: 20),

              Text(
                '확인 가능한 검사 결과가 없어요.',

                textAlign: TextAlign.center,

                style: TextStyle(
                  color: Color(0xFF172033),

                  fontSize: 18,

                  fontWeight: FontWeight.w800,
                ),
              ),

              SizedBox(height: 9),

              Text(
                '검사 결과가 등록되면\n이곳에서 확인할 수 있어요.',

                textAlign: TextAlign.center,

                style: TextStyle(
                  color: Color(0xFF8A96A8),

                  fontSize: 13,

                  height: 1.5,

                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildResultErrorState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),

        child: Column(
          mainAxisSize: MainAxisSize.min,

          children: [
            Icon(
              Icons.error_outline_rounded,

              size: 48,

              color: _mutedTextColor(context),
            ),

            SizedBox(height: 14),

            Text(
              '검사 결과를 불러오지 못했습니다.',

              style: TextStyle(
                fontSize: 16,

                fontWeight: FontWeight.w700,

                color: _textPrimaryColor(context),
              ),
            ),

            SizedBox(height: 8),

            Text(
              '잠시 후 다시 시도해주세요.',

              style: TextStyle(fontSize: 13, color: Color(0xFF8B95A1)),
            ),

            SizedBox(height: 18),

            OutlinedButton(onPressed: _retryResults, child: Text('다시 시도')),
          ],
        ),
      ),
    );
  }

  // ============================================================

  // 기타

  // ============================================================

  String _resultCategory(ExamResult exam) {
    final type = exam.examType.toUpperCase();

    if (type.contains('PATHOLOGY') || type.contains('PDL1')) {
      return '병리';
    }

    return '영상';
  }

  String _formatDate(DateTime date) {
    final local = date.toLocal();

    return '${local.year}.'
        '${local.month.toString().padLeft(2, '0')}.'
        '${local.day.toString().padLeft(2, '0')}';
  }

  // ============================================================

  // 검사 안내 데이터

  // ============================================================

  List<_ExamGuide> get _examGuides => [
    const _ExamGuide(
      title: '흉부 X-ray',

      description: '폐와 흉부의 상태를 확인하는 기본 검사입니다.',

      icon: Icons.air_rounded,

      iconColor: Color(0xFF328EEB),

      iconBackground: Color(0xFFEAF5FF),

      beforeExam: [
        '목걸이 등 검사 부위에 겹치는 금속 물품은 제거해주세요.',

        '임신 중이거나 임신 가능성이 있다면 검사 전에 의료진에게 알려주세요.',

        '검사 전 별도의 금식이 필요하지 않은 경우가 많습니다.',
      ],

      examDay: [
        '촬영 시 의료진의 안내에 따라 자세를 유지해주세요.',

        '촬영 중 잠시 숨을 참아달라는 안내를 받을 수 있어요.',

        '검사는 비교적 짧은 시간 안에 진행됩니다.',
      ],

      afterExam: [
        '일반적인 흉부 X-ray 촬영 후에는 특별한 회복 과정이 필요하지 않습니다.',

        '추가 안내가 있는 경우 의료진의 설명을 따라주세요.',
      ],
    ),

    _ExamGuide(
      title: '흉부 CT',

      description: '폐와 흉부 내부를 보다 자세하게 확인하는 검사입니다.',

      icon: Icons.donut_large_rounded,

      iconColor: Color(0xFF6C74E8),

      iconBackground: Color(0xFFF0F1FF),

      beforeExam: [
        '조영제를 사용하는 CT는 검사 전 금식이 필요할 수 있어요.',

        '조영제 알레르기 경험이 있다면 의료진에게 미리 알려주세요.',

        '신장질환 등 관련 질환이 있다면 검사 전에 의료진에게 알려주세요.',

        '검사에 방해가 되는 금속 액세서리는 제거해주세요.',
      ],

      examDay: [
        '검사대에 누운 상태로 촬영이 진행됩니다.',

        '의료진의 안내에 따라 움직이지 않고 자세를 유지해주세요.',

        '촬영 중 잠시 숨을 참아달라는 안내가 있을 수 있어요.',

        '검사에 따라 조영제를 사용할 수 있습니다.',
      ],

      afterExam: [
        '조영제를 사용했다면 의료진의 안내에 따라 수분 섭취가 권장될 수 있어요.',

        '검사 후 발진, 호흡곤란 등 이상 증상이 나타나면 의료진에게 알려주세요.',
      ],
    ),

    _ExamGuide(
      title: '병리검사',

      description: '채취한 조직이나 세포를 분석하는 검사입니다.',

      icon: Icons.biotech_outlined,

      iconColor: Color(0xFFA35BD8),

      iconBackground: Color(0xFFF8EEFF),

      beforeExam: [
        '검체 채취 방법에 따라 준비사항이 달라질 수 있어요.',

        '복용 중인 약이 있다면 의료진에게 알려주세요.',

        '금식이나 약 복용 조절이 필요한 경우 병원의 안내를 따라주세요.',
      ],

      examDay: [
        '검사 종류에 따라 조직 또는 세포를 채취할 수 있습니다.',

        '검체 채취 전 의료진이 검사 방법과 주의사항을 안내합니다.',

        '불편감이 있으면 검사 중 의료진에게 알려주세요.',
      ],

      afterExam: [
        '검체 채취 부위에 따라 출혈이나 통증 여부를 확인해주세요.',

        '검사 후 주의사항은 검체 채취 방법에 따라 달라질 수 있습니다.',

        '병원에서 안내받은 관리 방법을 따라주세요.',
      ],
    ),
  ];
}

// ============================================================

// 검사 안내 모델

// ============================================================

class _ExamGuide {
  const _ExamGuide({
    required this.title,

    required this.description,

    required this.icon,

    required this.iconColor,

    required this.iconBackground,

    required this.beforeExam,

    required this.examDay,

    required this.afterExam,
  });

  final String title;

  final String description;

  final IconData icon;

  final Color iconColor;

  final Color iconBackground;

  final List<String> beforeExam;

  final List<String> examDay;

  final List<String> afterExam;
}
