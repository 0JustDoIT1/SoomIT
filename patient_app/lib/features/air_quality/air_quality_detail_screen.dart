import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import 'models/air_quality_guidance.dart';
import 'services/air_quality_service.dart';

class AirQualityDetailScreen extends StatefulWidget {
  const AirQualityDetailScreen({super.key});

  @override
  State<AirQualityDetailScreen> createState() => _AirQualityDetailScreenState();
}

class _AirQualityDetailScreenState extends State<AirQualityDetailScreen> {
  static const _strongBlue = Color(0xFF2F8DFE);
  static const _background = Color(0xFFF5FAFF);
  static const _textPrimary = Color(0xFF172033);

  final AirQualityService _service = AirQualityService();

  AirQualityGuidance? _guidance;
  bool _isLoading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _load();
  }

  // =========================================================
  // 대기질 조회
  // =========================================================

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });
    }

    try {
      final position = await _determinePosition();

      final guidance = await _service.getCurrent(
        latitude: position.latitude,
        longitude: position.longitude,
      );

      if (!mounted) return;

      setState(() {
        _guidance = guidance;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _isLoading = false;
        _errorMessage = error.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  // =========================================================
  // 현재 위치
  // =========================================================

  Future<Position> _determinePosition() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw const AirQualityException('휴대폰의 위치 서비스를 켜주세요.');
    }

    var permission = await Geolocator.checkPermission();

    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    if (permission == LocationPermission.denied) {
      throw const AirQualityException('대기질 조회를 위해 위치 권한이 필요합니다.');
    }

    if (permission == LocationPermission.deniedForever) {
      throw const AirQualityException('설정에서 위치 권한을 허용해주세요.');
    }

    return Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 15),
      ),
    );
  }

  // =========================================================
  // 화면
  // =========================================================

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _background,
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
        centerTitle: true,
        title: const Text(
          '대기질 정보',
          style: TextStyle(
            color: _textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        actions: [
          IconButton(
            tooltip: '다시 조회',
            onPressed: _isLoading ? null : _load,
            icon: const Icon(Icons.refresh_rounded, color: _strongBlue),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: _isLoading
          ? const _LoadingView()
          : _errorMessage != null
          ? _ErrorView(message: _errorMessage!, onRetry: _load)
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 18, 16, 52),
                children: [
                  _AirStatusCard(guidance: _guidance!),

                  const SizedBox(height: 16),

                  _RespiratoryGuideCard(guidance: _guidance!),

                  const SizedBox(height: 16),

                  _GradeGuideCard(currentGrade: _guidance!.finalGrade),

                  const SizedBox(height: 16),

                  const _LocationInfoCard(),
                ],
              ),
            ),
    );
  }
}

// ===========================================================
// 현재 대기질 메인 카드
// ===========================================================

class _AirStatusCard extends StatelessWidget {
  const _AirStatusCard({required this.guidance});

  final AirQualityGuidance guidance;

  @override
  Widget build(BuildContext context) {
    final style = _GradeStyle.fromGrade(guidance.finalGrade);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: style.colors,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: style.borderColor),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0D172033),
            blurRadius: 15,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.88),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  Icons.location_on_rounded,
                  color: style.accentColor,
                  size: 22,
                ),
              ),

              const SizedBox(width: 11),

              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '현재 위치 기준',
                      style: TextStyle(
                        color: Color(0xFF748198),
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      '오늘의 공기 상태',
                      style: TextStyle(
                        color: Color(0xFF172033),
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),

              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 11,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.90),
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(
                  style.label,
                  style: TextStyle(
                    color: style.accentColor,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 25),

          Center(
            child: Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.85),
                shape: BoxShape.circle,
                boxShadow: const [
                  BoxShadow(color: Color(0x0F172033), blurRadius: 16),
                ],
              ),
              child: Icon(style.icon, size: 46, color: style.accentColor),
            ),
          ),

          const SizedBox(height: 18),

          Center(
            child: Text(
              guidance.title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Color(0xFF172033),
                fontSize: 22,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.5,
              ),
            ),
          ),

          const SizedBox(height: 8),

          Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.76),
                borderRadius: BorderRadius.circular(99),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.air_rounded, size: 17, color: style.accentColor),
                  const SizedBox(width: 5),
                  const Text(
                    '현재 상태',
                    style: TextStyle(
                      color: Color(0xFF748198),
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    style.label,
                    style: TextStyle(
                      color: style.accentColor,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ===========================================================
// 호흡기 건강 안내
// ===========================================================

class _RespiratoryGuideCard extends StatelessWidget {
  const _RespiratoryGuideCard({required this.guidance});

  final AirQualityGuidance guidance;

  @override
  Widget build(BuildContext context) {
    final style = _GradeStyle.fromGrade(guidance.finalGrade);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFFE5EDF5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: style.accentColor.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Icon(
                  Icons.health_and_safety_rounded,
                  color: style.accentColor,
                  size: 22,
                ),
              ),

              const SizedBox(width: 11),

              const Text(
                '호흡기 건강 안내',
                style: TextStyle(
                  color: Color(0xFF172033),
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),

          const SizedBox(height: 15),

          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(15),
            decoration: BoxDecoration(
              color: style.messageBackgroundColor,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: style.messageBorderColor),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(style.guideIcon, color: style.accentColor, size: 20),

                const SizedBox(width: 9),

                Expanded(
                  child: Text(
                    _healthGuideMessage(guidance.finalGrade),
                    style: TextStyle(
                      color: style.messageTextColor,
                      fontSize: 13,
                      height: 1.6,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 13),

          const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                Icons.info_outline_rounded,
                color: Color(0xFF91A1B7),
                size: 17,
              ),

              SizedBox(width: 7),

              Expanded(
                child: Text(
                  '대기질 정보는 일상적인 건강관리 참고용이며, '
                  '호흡곤란이나 심한 증상이 있는 경우 의료진의 안내를 우선해주세요.',
                  style: TextStyle(
                    color: Color(0xFF748198),
                    fontSize: 10.8,
                    height: 1.5,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ===========================================================
// 대기질 등급
// ===========================================================

class _GradeGuideCard extends StatelessWidget {
  const _GradeGuideCard({required this.currentGrade});

  final String currentGrade;

  @override
  Widget build(BuildContext context) {
    const grades = ['GOOD', 'NORMAL', 'BAD', 'VERY_BAD'];

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFFE5EDF5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.bar_chart_rounded, color: Color(0xFF2F8DFE), size: 22),

              SizedBox(width: 8),

              Text(
                '대기질 등급',
                style: TextStyle(
                  color: Color(0xFF172033),
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          Row(
            children: List.generate(grades.length, (index) {
              final grade = grades[index];

              final style = _GradeStyle.fromGrade(grade);

              final selected = grade == currentGrade;

              return Expanded(
                child: Padding(
                  padding: EdgeInsets.only(
                    right: index != grades.length - 1 ? 6 : 0,
                  ),
                  child: _GradeItem(style: style, selected: selected),
                ),
              );
            }),
          ),
        ],
      ),
    );
  }
}

// ===========================================================
// 대기질 등급 한 칸
// ===========================================================

class _GradeItem extends StatelessWidget {
  const _GradeItem({required this.style, required this.selected});

  final _GradeStyle style;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
      decoration: BoxDecoration(
        color: selected
            ? style.accentColor.withValues(alpha: 0.12)
            : const Color(0xFFF7FAFD),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: selected ? style.accentColor : const Color(0xFFE8EEF4),
          width: selected ? 1.5 : 1,
        ),
      ),
      child: Column(
        children: [
          Icon(
            style.icon,
            color: selected ? style.accentColor : const Color(0xFF9BA8B8),
            size: 21,
          ),

          const SizedBox(height: 6),

          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              style.label,
              maxLines: 1,
              style: TextStyle(
                color: selected ? style.accentColor : const Color(0xFF748198),
                fontSize: 10.5,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ===========================================================
// 현재 위치 기반 안내
// ===========================================================

class _LocationInfoCard extends StatelessWidget {
  const _LocationInfoCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: const Color(0xFFF0F7FF),
        borderRadius: BorderRadius.circular(18),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 36,
            height: 36,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.my_location_rounded,
                color: Color(0xFF2F8DFE),
                size: 19,
              ),
            ),
          ),

          SizedBox(width: 10),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '현재 위치 기반 정보',
                  style: TextStyle(
                    color: Color(0xFF172033),
                    fontSize: 12.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),

                SizedBox(height: 4),

                Text(
                  '기기의 현재 위치를 기준으로 대기질 정보를 조회합니다. '
                  '위치가 변경된 경우 새로고침해 주세요.',
                  style: TextStyle(
                    color: Color(0xFF748198),
                    fontSize: 11,
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ===========================================================
// 로딩
// ===========================================================

class _LoadingView extends StatelessWidget {
  const _LoadingView();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircularProgressIndicator(color: Color(0xFF2F8DFE)),

          SizedBox(height: 14),

          Text(
            '현재 위치의 대기질을 확인하고 있어요.',
            style: TextStyle(
              color: Color(0xFF748198),
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

// ===========================================================
// 오류
// ===========================================================

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: const BoxDecoration(
                color: Color(0xFFFFEEEE),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.cloud_off_rounded,
                size: 31,
                color: Color(0xFFD95C59),
              ),
            ),

            const SizedBox(height: 15),

            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Color(0xFF566579),
                fontSize: 13,
                height: 1.5,
              ),
            ),

            const SizedBox(height: 13),

            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('다시 조회'),
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF2F8DFE),
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ===========================================================
// 등급별 건강 안내 문구
// ===========================================================

String _healthGuideMessage(String grade) {
  switch (grade) {
    case 'GOOD':
      return '오늘은 공기가 좋아요.\n'
          '가벼운 산책이나 외출도 편하게 하셔도 좋아요.';

    case 'NORMAL':
      return '대기질은 무난한 편이에요.\n'
          '장시간 야외 활동 시에는 몸 상태를 한 번씩 확인해주세요.';

    case 'BAD':
      return '공기가 좋지 않아요.\n'
          '외출은 줄이고, 필요할 때는 마스크를 착용해주세요.';

    case 'VERY_BAD':
      return '대기질이 많이 좋지 않아요.\n'
          '가능하면 실내에 머물고, 외출이 꼭 필요할 때는 '
          '마스크를 착용해주세요.';

    default:
      return '현재 대기질 정보를 확인하고 있어요.\n'
          '외출 전 공기 상태를 확인해주세요.';
  }
}

// ===========================================================
// 대기질 등급별 스타일
// ===========================================================

class _GradeStyle {
  const _GradeStyle({
    required this.label,
    required this.icon,
    required this.guideIcon,
    required this.accentColor,
    required this.borderColor,
    required this.colors,
    required this.messageBackgroundColor,
    required this.messageBorderColor,
    required this.messageTextColor,
  });

  final String label;
  final IconData icon;
  final IconData guideIcon;

  final Color accentColor;
  final Color borderColor;

  final List<Color> colors;

  final Color messageBackgroundColor;
  final Color messageBorderColor;
  final Color messageTextColor;

  factory _GradeStyle.fromGrade(String grade) {
    switch (grade) {
      case 'GOOD':
        return const _GradeStyle(
          label: '좋음',
          icon: Icons.air_rounded,
          guideIcon: Icons.eco_rounded,
          accentColor: Color(0xFF2588E8),
          borderColor: Color(0xFFBFDFFF),
          colors: [Color(0xFFEAF5FF), Color(0xFFF7FBFF)],
          messageBackgroundColor: Color(0xFFF2F8FF),
          messageBorderColor: Color(0xFFDDEEFF),
          messageTextColor: Color(0xFF465568),
        );

      case 'NORMAL':
        return const _GradeStyle(
          label: '보통',
          icon: Icons.cloud_outlined,
          guideIcon: Icons.eco_rounded,
          accentColor: Color(0xFF1E9A61),
          borderColor: Color(0xFFC7ECD8),
          colors: [Color(0xFFECFAF3), Color(0xFFF8FDFB)],
          messageBackgroundColor: Color(0xFFF0FAF5),
          messageBorderColor: Color(0xFFD4EFDF),
          messageTextColor: Color(0xFF3F6150),
        );

      case 'BAD':
        return const _GradeStyle(
          label: '나쁨',
          icon: Icons.masks_rounded,
          guideIcon: Icons.masks_rounded,
          accentColor: Color(0xFFE17B16),
          borderColor: Color(0xFFFFD9AE),
          colors: [Color(0xFFFFF2E3), Color(0xFFFFFAF4)],
          messageBackgroundColor: Color(0xFFFFF6EA),
          messageBorderColor: Color(0xFFFFE1BA),
          messageTextColor: Color(0xFF7B562D),
        );

      case 'VERY_BAD':
        return const _GradeStyle(
          label: '매우 나쁨',
          icon: Icons.warning_amber_rounded,
          guideIcon: Icons.warning_amber_rounded,
          accentColor: Color(0xFFD84A4A),
          borderColor: Color(0xFFFFCACA),
          colors: [Color(0xFFFFEAEA), Color(0xFFFFF7F7)],
          messageBackgroundColor: Color(0xFFFFF0F0),
          messageBorderColor: Color(0xFFFFD1D1),
          messageTextColor: Color(0xFF814949),
        );

      default:
        return const _GradeStyle(
          label: '확인 필요',
          icon: Icons.help_outline_rounded,
          guideIcon: Icons.info_outline_rounded,
          accentColor: Color(0xFF748198),
          borderColor: Color(0xFFDCE4EC),
          colors: [Color(0xFFF4F7FA), Color(0xFFFAFCFD)],
          messageBackgroundColor: Color(0xFFF5F7F9),
          messageBorderColor: Color(0xFFE1E7ED),
          messageTextColor: Color(0xFF566579),
        );
    }
  }
}
