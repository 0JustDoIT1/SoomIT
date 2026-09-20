import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'services/patient_qr_service.dart';

class PatientQrScreen extends StatefulWidget {
  final String patientName;
  final String patientCode;

  const PatientQrScreen({
    super.key,
    required this.patientName,
    required this.patientCode,
  });

  @override
  State<PatientQrScreen> createState() => _PatientQrScreenState();
}

class _PatientQrScreenState extends State<PatientQrScreen> {
  final PatientQrService _service = PatientQrService();

  static const Color _primaryBlue = Color(0xFF3198F4);

  static const Color _softBlue = Color(0xFFEAF5FF);

  static const Color _background = Color(0xFFF7F9FC);

  static const Color _textPrimary = Color(0xFF172033);

  static const Color _textSecondary = Color(0xFF748198);

  PatientQrToken? _qrToken;

  Timer? _timer;

  int _remainingSeconds = 0;

  bool _isLoading = true;

  bool _isRefreshing = false;

  String? _errorMessage;

  @override
  void initState() {
    super.initState();

    _loadQr();
  }

  @override
  void dispose() {
    _timer?.cancel();

    super.dispose();
  }

  Future<void> _loadQr() async {
    _timer?.cancel();

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final qrToken = await _service.createQrToken();

      if (!mounted) {
        return;
      }

      setState(() {
        _qrToken = qrToken;
        _remainingSeconds = qrToken.expiresInSeconds;
        _isLoading = false;
      });

      _startTimer();
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _isLoading = false;
        _errorMessage = 'QR을 불러오지 못했습니다.';
      });
    }
  }

  Future<void> _refreshQr() async {
    if (_isRefreshing) {
      return;
    }

    _timer?.cancel();

    setState(() {
      _isRefreshing = true;
      _errorMessage = null;
    });

    try {
      final qrToken = await _service.createQrToken();

      if (!mounted) {
        return;
      }

      setState(() {
        _qrToken = qrToken;
        _remainingSeconds = qrToken.expiresInSeconds;
        _isRefreshing = false;
      });

      _startTimer();
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _isRefreshing = false;
        _errorMessage = 'QR을 새로 발급하지 못했습니다.';
      });
    }
  }

  void _startTimer() {
    _timer?.cancel();

    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }

      if (_remainingSeconds <= 1) {
        timer.cancel();

        setState(() {
          _remainingSeconds = 0;
        });

        return;
      }

      setState(() {
        _remainingSeconds--;
      });
    });
  }

  String get _remainingText {
    final minutes = _remainingSeconds ~/ 60;

    final seconds = _remainingSeconds % 60;

    return '$minutes:'
        '${seconds.toString().padLeft(2, '0')}';
  }

  bool get _isExpired => _remainingSeconds <= 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _background,

      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,

        foregroundColor: _textPrimary,

        title: const Text(
          '내 환자 QR',
          style: TextStyle(
            color: _textPrimary,
            fontSize: 20,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.5,
          ),
        ),
      ),

      body: SafeArea(child: _buildBody()),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(color: _primaryBlue, strokeWidth: 2.6),
      );
    }

    if (_errorMessage != null && _qrToken == null) {
      return _buildErrorState();
    }

    final qrToken = _qrToken;

    if (qrToken == null) {
      return _buildErrorState();
    }

    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),

      padding: const EdgeInsets.fromLTRB(24, 30, 24, 30),

      child: Column(
        children: [
          _buildHeader(),

          const SizedBox(height: 28),

          _buildQrCard(qrToken.token),

          const SizedBox(height: 20),

          _buildRemainingTime(),

          const SizedBox(height: 22),

          _buildPatientInfo(),

          const SizedBox(height: 24),

          _buildRefreshButton(),

          if (_errorMessage != null) ...[
            const SizedBox(height: 12),

            Text(
              _errorMessage!,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Color(0xFFE5484D),
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],

          const SizedBox(height: 20),

          _buildGuide(),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      children: [
        Container(
          width: 58,
          height: 58,

          decoration: BoxDecoration(
            color: _softBlue,
            borderRadius: BorderRadius.circular(18),
          ),

          child: const Icon(
            Icons.qr_code_2_rounded,
            color: _primaryBlue,
            size: 34,
          ),
        ),

        const SizedBox(height: 14),

        const Text(
          '내 환자 QR',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: _textPrimary,
            letterSpacing: -0.4,
          ),
        ),

        const SizedBox(height: 10),

        const Text(
          '병원에서 환자 확인이 필요할 때\n'
          '아래 QR을 보여주세요.',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: _textSecondary,
            fontSize: 13,
            height: 1.55,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }

  Widget _buildQrCard(String token) {
    return Container(
      width: 244,
      height: 244,

      padding: const EdgeInsets.all(26),

      decoration: BoxDecoration(
        color: Colors.white,

        borderRadius: BorderRadius.circular(24),

        border: Border.all(color: const Color(0xFFF0F4F8)),

        boxShadow: [
          BoxShadow(
            color: const Color(0xFF5389B8).withValues(alpha: 0.09),

            blurRadius: 26,

            offset: const Offset(0, 9),
          ),
        ],
      ),

      child: Opacity(
        opacity: _isExpired ? 0.28 : 1,

        child: QrImageView(
          data: token,

          version: QrVersions.auto,

          padding: EdgeInsets.zero,

          eyeStyle: const QrEyeStyle(
            eyeShape: QrEyeShape.square,

            color: _textPrimary,
          ),

          dataModuleStyle: const QrDataModuleStyle(
            dataModuleShape: QrDataModuleShape.square,

            color: _textPrimary,
          ),
        ),
      ),
    );
  }

  Widget _buildRemainingTime() {
    if (_isExpired) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 8),

        decoration: BoxDecoration(
          color: const Color(0xFFFFF1F2),

          borderRadius: BorderRadius.circular(20),
        ),

        child: const Text(
          'QR이 만료되었습니다.',
          style: TextStyle(
            color: Color(0xFFE5484D),
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 8),

      decoration: BoxDecoration(
        color: _softBlue,

        borderRadius: BorderRadius.circular(20),
      ),

      child: Row(
        mainAxisSize: MainAxisSize.min,

        children: [
          const Icon(Icons.schedule_rounded, size: 16, color: _primaryBlue),

          const SizedBox(width: 6),

          Text(
            '남은 시간 $_remainingText',
            style: const TextStyle(
              color: _primaryBlue,
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPatientInfo() {
    return Column(
      children: [
        Text(
          widget.patientName,
          style: const TextStyle(
            color: _textPrimary,
            fontSize: 16,
            fontWeight: FontWeight.w800,
          ),
        ),

        const SizedBox(height: 6),

        Text(
          widget.patientCode,
          style: const TextStyle(
            color: _textSecondary,
            fontSize: 14,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.2,
          ),
        ),
      ],
    );
  }

  Widget _buildRefreshButton() {
    return SizedBox(
      width: double.infinity,
      height: 48,

      child: OutlinedButton.icon(
        onPressed: _isRefreshing ? null : _refreshQr,

        icon: _isRefreshing
            ? const SizedBox(
                width: 17,
                height: 17,

                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: _primaryBlue,
                ),
              )
            : const Icon(Icons.refresh_rounded, size: 19),

        label: Text(
          _isRefreshing
              ? '새로 발급 중...'
              : _isExpired
              ? '새 QR 발급'
              : 'QR 새로고침',

          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
        ),

        style: OutlinedButton.styleFrom(
          foregroundColor: _primaryBlue,

          disabledForegroundColor: _primaryBlue.withValues(alpha: 0.55),

          backgroundColor: Colors.white,

          side: const BorderSide(color: _primaryBlue),

          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      ),
    );
  }

  Widget _buildGuide() {
    return Container(
      width: double.infinity,

      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),

      decoration: BoxDecoration(
        color: const Color(0xFFF2F8FE),

        borderRadius: BorderRadius.circular(16),
      ),

      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,

        children: [
          Icon(Icons.info_outline_rounded, size: 18, color: _primaryBlue),

          SizedBox(width: 9),

          Expanded(
            child: Text(
              'QR에는 환자정보 대신 일회성 인증 토큰이 포함됩니다.\n'
              '발급 후 2분 동안만 사용할 수 있습니다.',
              style: TextStyle(
                color: _textSecondary,
                fontSize: 11,
                height: 1.55,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),

        child: Column(
          mainAxisSize: MainAxisSize.min,

          children: [
            Container(
              width: 64,
              height: 64,

              decoration: const BoxDecoration(
                color: _softBlue,
                shape: BoxShape.circle,
              ),

              child: const Icon(
                Icons.qr_code_2_rounded,
                color: _primaryBlue,
                size: 34,
              ),
            ),

            const SizedBox(height: 18),

            const Text(
              'QR을 불러오지 못했습니다.',
              style: TextStyle(
                color: _textPrimary,
                fontSize: 17,
                fontWeight: FontWeight.w800,
              ),
            ),

            const SizedBox(height: 8),

            const Text(
              '잠시 후 다시 시도해주세요.',
              style: TextStyle(color: _textSecondary, fontSize: 13),
            ),

            const SizedBox(height: 20),

            SizedBox(
              width: 150,
              height: 44,

              child: FilledButton(
                onPressed: _loadQr,

                style: FilledButton.styleFrom(
                  backgroundColor: _primaryBlue,

                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(13),
                  ),
                ),

                child: const Text(
                  '다시 시도',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
