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
  final PatientQrService _qrService = PatientQrService();

  Timer? _timer;
  PatientQrToken? _qrToken;
  bool _isLoading = true;
  String? _errorMessage;
  int _remainingSeconds = 0;

  @override
  void initState() {
    super.initState();
    _loadQrToken();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _loadQrToken() async {
    _timer?.cancel();

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final qrToken = await _qrService.createQrToken();

      if (!mounted) return;

      setState(() {
        _qrToken = qrToken;
        _remainingSeconds = qrToken.expiresInSeconds;
        _isLoading = false;
      });

      _startTimer();
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _isLoading = false;
        _errorMessage = 'QR을 불러오지 못했습니다.';
      });
    }
  }

  void _startTimer() {
    _timer?.cancel();

    _timer = Timer.periodic(
      const Duration(seconds: 1),
      (timer) {
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
      },
    );
  }

  String get _remainingText {
    final minutes = _remainingSeconds ~/ 60;
    final seconds = _remainingSeconds % 60;

    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }

  bool get _isExpired => _remainingSeconds <= 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F8FA),
      appBar: AppBar(
        title: const Text(
          '내 환자 QR',
          style: TextStyle(
            fontWeight: FontWeight.w700,
          ),
        ),
        backgroundColor: const Color(0xFFF7F8FA),
        surfaceTintColor: Colors.transparent,
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                const Icon(
                  Icons.qr_code_2_rounded,
                  size: 42,
                  color: Color(0xFF6D4FB3),
                ),
                const SizedBox(height: 12),
                const Text(
                  '내 환자 QR',
                  style: TextStyle(
                    color: Color(0xFF191F28),
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  '병원에서 환자 확인이 필요할 때\n아래 QR을 보여주세요.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Color(0xFF6B7280),
                    fontSize: 14,
                    height: 1.5,
                  ),
                ),
                const SizedBox(height: 28),

                Container(
                  width: 268,
                  height: 268,
                  alignment: Alignment.center,
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(
                          alpha: 0.06,
                        ),
                        blurRadius: 24,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: _buildQrContent(),
                ),

                const SizedBox(height: 22),

                if (!_isLoading &&
                    _errorMessage == null &&
                    _qrToken != null)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: _isExpired
                          ? const Color(0xFFFFF1F1)
                          : const Color(0xFFF2EEFB),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      _isExpired
                          ? 'QR이 만료되었습니다.'
                          : '남은 시간 $_remainingText',
                      style: TextStyle(
                        color: _isExpired
                            ? const Color(0xFFD14343)
                            : const Color(0xFF6D4FB3),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),

                const SizedBox(height: 22),

                Text(
                  widget.patientName,
                  style: const TextStyle(
                    color: Color(0xFF191F28),
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),

                const SizedBox(height: 6),

                Text(
                  widget.patientCode,
                  style: const TextStyle(
                    color: Color(0xFF6B7280),
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),

                const SizedBox(height: 20),

                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: _isLoading
                        ? null
                        : _loadQrToken,
                    icon: const Icon(
                      Icons.refresh_rounded,
                    ),
                    label: Text(
                      _isExpired
                          ? '새 QR 발급'
                          : 'QR 새로고침',
                    ),
                  ),
                ),

                const SizedBox(height: 16),

                const Text(
                  'QR에는 환자정보 대신 일회성 인증 토큰이 포함됩니다.\n'
                  '발급 후 2분 동안만 사용할 수 있습니다.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Color(0xFF9CA3AF),
                    fontSize: 12,
                    height: 1.5,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildQrContent() {
    if (_isLoading) {
      return const CircularProgressIndicator();
    }

    if (_errorMessage != null) {
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            Icons.error_outline_rounded,
            size: 42,
            color: Color(0xFFD14343),
          ),
          const SizedBox(height: 12),
          Text(
            _errorMessage!,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Color(0xFF6B7280),
            ),
          ),
        ],
      );
    }

    if (_qrToken == null || _isExpired) {
      return const Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.qr_code_2_rounded,
            size: 72,
            color: Color(0xFFD1D5DB),
          ),
          SizedBox(height: 12),
          Text(
            '새 QR을 발급해주세요.',
            style: TextStyle(
              color: Color(0xFF9CA3AF),
            ),
          ),
        ],
      );
    }

    return QrImageView(
      data: _qrToken!.token,
      version: QrVersions.auto,
      size: 220,
      errorCorrectionLevel: QrErrorCorrectLevel.M,
      eyeStyle: const QrEyeStyle(
        eyeShape: QrEyeShape.square,
        color: Color(0xFF191F28),
      ),
      dataModuleStyle: const QrDataModuleStyle(
        dataModuleShape: QrDataModuleShape.square,
        color: Color(0xFF191F28),
      ),
    );
  }
}
