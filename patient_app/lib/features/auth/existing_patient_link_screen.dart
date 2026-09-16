import 'package:flutter/material.dart';

import '../../shared/app_shell.dart';
import 'services/patient_auth_service.dart';

class ExistingPatientLinkScreen extends StatefulWidget {
  const ExistingPatientLinkScreen({super.key});

  @override
  State<ExistingPatientLinkScreen> createState() =>
      _ExistingPatientLinkScreenState();
}

class _ExistingPatientLinkScreenState extends State<ExistingPatientLinkScreen> {
  final _patientCodeController = TextEditingController();

  final PatientAuthService _authService = PatientAuthService();

  bool _isSubmitting = false;

  @override
  void dispose() {
    _patientCodeController.dispose();
    super.dispose();
  }

  Future<void> _linkPatient() async {
    if (_isSubmitting) return;

    final patientCode = _patientCodeController.text.trim();

    if (patientCode.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('환자코드를 입력해주세요.')));
      return;
    }

    setState(() {
      _isSubmitting = true;
    });

    try {
      await _authService.linkPatient(patientCode: patientCode);

      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('환자정보가 연결되었습니다.')));

      await Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute<void>(builder: (context) => const AppShell()),
        (route) => false,
      );
    } catch (error) {
      if (!mounted) return;

      final message = error.toString().replaceFirst('Exception: ', '');

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9F8FC),
      appBar: AppBar(
        title: const Text(
          '환자정보 연결',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
        backgroundColor: const Color(0xFFF9F8FC),
        surfaceTintColor: Colors.transparent,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 28, 24, 32),
          children: [
            Center(
              child: Container(
                width: 80,
                height: 80,
                decoration: const BoxDecoration(
                  color: Color(0xFFEDE7FA),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.link_rounded,
                  size: 40,
                  color: Color(0xFF6D4FB3),
                ),
              ),
            ),
            const SizedBox(height: 28),
            const Text(
              '병원에서 받은\n환자코드를 입력해주세요.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Color(0xFF191F28),
                fontSize: 24,
                height: 1.35,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              '가입할 때 입력한 이름, 생년월일, 성별, '
              '휴대전화번호와 병원 환자정보가 모두 '
              '일치해야 연결할 수 있어요.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Color(0xFF6B7280),
                fontSize: 14,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 36),
            TextField(
              controller: _patientCodeController,
              enabled: !_isSubmitting,
              textCapitalization: TextCapitalization.characters,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) {
                if (!_isSubmitting) {
                  _linkPatient();
                }
              },
              decoration: InputDecoration(
                labelText: '환자코드',
                hintText: '예: P0001',
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFFD1D5DB)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(
                    color: Color(0xFF6D4FB3),
                    width: 1.5,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 54,
              child: FilledButton(
                onPressed: _isSubmitting ? null : _linkPatient,
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF6D4FB3),
                  disabledBackgroundColor: const Color(0xFFB8A8DA),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: _isSubmitting
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: Colors.white,
                        ),
                      )
                    : const Text(
                        '환자정보 연결하기',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
