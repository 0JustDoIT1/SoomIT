import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

class PatientQrScreen extends StatelessWidget {
  final String patientName;
  final String patientCode;

  const PatientQrScreen({
    super.key,
    required this.patientName,
    required this.patientCode,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F8FA),
      appBar: AppBar(
        title: const Text(
          '내 환자 QR',
          style: TextStyle(fontWeight: FontWeight.w700),
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
                  '내 환자코드',
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
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.06),
                        blurRadius: 24,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: QrImageView(
                    data: patientCode,
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
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  patientName,
                  style: const TextStyle(
                    color: Color(0xFF191F28),
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                SelectableText(
                  patientCode,
                  style: const TextStyle(
                    color: Color(0xFF6D4FB3),
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 20),
                const Text(
                  'QR에는 환자코드만 포함되어 있습니다.',
                  style: TextStyle(
                    color: Color(0xFF9CA3AF),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}