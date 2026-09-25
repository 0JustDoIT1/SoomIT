import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import '../models/air_quality_guidance.dart';
import '../services/air_quality_service.dart';

class AirQualityCard extends StatefulWidget {
  const AirQualityCard({
    super.key,
    this.compact = false,
    this.onTap,
  });

  final bool compact;
  final VoidCallback? onTap;

  @override
  State<AirQualityCard> createState() => _AirQualityCardState();
}

class _AirQualityCardState extends State<AirQualityCard> {
  final _service = AirQualityService();

  AirQualityGuidance? _guidance;
  String? _errorMessage;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

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

  @override
  Widget build(BuildContext context) {
    if (widget.compact) {
      return _buildCompact();
    }

    return _buildFull();
  }

  Widget _buildCompact() {
    if (_isLoading) {
      return const _CompactShell(
        child: Row(
          children: [
            SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2.3),
            ),
            SizedBox(width: 11),
            Expanded(
              child: Text(
                '현재 위치의 대기질을 확인하고 있어요.',
                style: TextStyle(
                  color: Color(0xFF66758A),
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      );
    }

    if (_errorMessage != null) {
      return _CompactShell(
        child: Row(
          children: [
            const Icon(
              Icons.cloud_off_rounded,
              color: Color(0xFFD95C59),
              size: 22,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                _errorMessage!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Color(0xFF66758A),
                  fontSize: 12,
                  height: 1.35,
                ),
              ),
            ),
            IconButton(
              tooltip: '다시 조회',
              onPressed: _load,
              icon: const Icon(Icons.refresh_rounded, size: 20),
            ),
          ],
        ),
      );
    }

    final guidance = _guidance!;
    final style = _GradeStyle.fromGrade(guidance.finalGrade);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: widget.onTap,
        borderRadius: BorderRadius.circular(17),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(13, 12, 10, 12),
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: style.colors),
            borderRadius: BorderRadius.circular(17),
            border: Border.all(color: style.borderColor),
          ),
          child: Row(
            children: [
              Container(
                width: 43,
                height: 43,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.88),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  style.icon,
                  color: style.accentColor,
                  size: 24,
                ),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '오늘의 공기 상태',
                      style: TextStyle(
                        color: Color(0xFF748198),
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      guidance.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Color(0xFF172033),
                        fontSize: 14.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      guidance.message,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Color(0xFF748198),
                        fontSize: 10.5,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 9,
                  vertical: 5,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.9),
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(
                  style.label,
                  style: TextStyle(
                    color: style.accentColor,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              if (widget.onTap != null) ...[
                const SizedBox(width: 2),
                const Icon(
                  Icons.chevron_right_rounded,
                  size: 20,
                  color: Color(0xFF91A1B7),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFull() {
    if (_isLoading) {
      return const _CardShell(
        colors: [Color(0xFFEAF5FF), Color(0xFFF5FAFF)],
        child: Row(
          children: [
            SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2.5),
            ),
            SizedBox(width: 12),
            Text('현재 위치의 대기질을 확인하고 있어요.'),
          ],
        ),
      );
    }

    if (_errorMessage != null) {
      return _CardShell(
        colors: const [Color(0xFFFFF3F2), Color(0xFFFFFAFA)],
        child: Row(
          children: [
            const Icon(Icons.cloud_off_rounded, color: Color(0xFFD95C59)),
            const SizedBox(width: 12),
            Expanded(child: Text(_errorMessage!)),
            IconButton(
              tooltip: '다시 조회',
              onPressed: _load,
              icon: const Icon(Icons.refresh_rounded),
            ),
          ],
        ),
      );
    }

    final guidance = _guidance!;
    final style = _GradeStyle.fromGrade(guidance.finalGrade);

    return _CardShell(
      colors: style.colors,
      borderColor: style.borderColor,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.86),
                  shape: BoxShape.circle,
                ),
                child: Icon(style.icon, color: style.accentColor, size: 28),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '현재 위치 대기질',
                      style: TextStyle(
                        color: Color(0xFF66758A),
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      guidance.title,
                      style: const TextStyle(
                        color: Color(0xFF172033),
                        fontSize: 19,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.82),
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(
                  style.label,
                  style: TextStyle(
                    color: style.accentColor,
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                  ),
                ),
              ),
              IconButton(
                tooltip: '다시 조회',
                onPressed: _load,
                icon: const Icon(Icons.refresh_rounded, size: 21),
              ),
            ],
          ),
          const SizedBox(height: 15),
          Text(
            guidance.message,
            style: const TextStyle(
              color: Color(0xFF344054),
              fontSize: 14,
              height: 1.55,
            ),
          ),
        ],
      ),
    );
  }
}

class _CompactShell extends StatelessWidget {
  const _CompactShell({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 13),
      decoration: BoxDecoration(
        color: const Color(0xFFF7FBFF),
        borderRadius: BorderRadius.circular(17),
        border: Border.all(color: const Color(0xFFE5EFF8)),
      ),
      child: child,
    );
  }
}

class _CardShell extends StatelessWidget {
  const _CardShell({
    required this.colors,
    required this.child,
    this.borderColor = const Color(0xFFD9ECFF),
  });

  final List<Color> colors;
  final Widget child;
  final Color borderColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: colors),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: borderColor),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0D172033),
            blurRadius: 14,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: child,
    );
  }
}

class _GradeStyle {
  const _GradeStyle({
    required this.label,
    required this.icon,
    required this.accentColor,
    required this.borderColor,
    required this.colors,
  });

  final String label;
  final IconData icon;
  final Color accentColor;
  final Color borderColor;
  final List<Color> colors;

  factory _GradeStyle.fromGrade(String grade) {
    switch (grade) {
      case 'GOOD':
        return const _GradeStyle(
          label: '좋음',
          icon: Icons.air_rounded,
          accentColor: Color(0xFF2588E8),
          borderColor: Color(0xFFBFDFFF),
          colors: [Color(0xFFEAF5FF), Color(0xFFF7FBFF)],
        );
      case 'NORMAL':
        return const _GradeStyle(
          label: '보통',
          icon: Icons.cloud_outlined,
          accentColor: Color(0xFF1E9A61),
          borderColor: Color(0xFFC7ECD8),
          colors: [Color(0xFFECFAF3), Color(0xFFF8FDFB)],
        );
      case 'BAD':
        return const _GradeStyle(
          label: '나쁨',
          icon: Icons.masks_rounded,
          accentColor: Color(0xFFE17B16),
          borderColor: Color(0xFFFFD9AE),
          colors: [Color(0xFFFFF2E3), Color(0xFFFFFAF4)],
        );
      default:
        return const _GradeStyle(
          label: '매우 나쁨',
          icon: Icons.warning_amber_rounded,
          accentColor: Color(0xFFD84A4A),
          borderColor: Color(0xFFFFCACA),
          colors: [Color(0xFFFFEAEA), Color(0xFFFFF7F7)],
        );
    }
  }
}
