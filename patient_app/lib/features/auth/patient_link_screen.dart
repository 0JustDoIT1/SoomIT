import 'package:flutter/material.dart';

import 'models/patient_registration_data.dart';
import 'registration_complete_screen.dart';
import 'services/patient_auth_service.dart';

class PatientLinkScreen extends StatefulWidget {
  final PatientRegistrationData registrationData;

  const PatientLinkScreen({super.key, required this.registrationData});

  @override
  State<PatientLinkScreen> createState() => _PatientLinkScreenState();
}

class _PatientLinkScreenState extends State<PatientLinkScreen> {
  final _patientCodeController = TextEditingController();

  final PatientAuthService _authService = PatientAuthService();

  bool _isSubmitting = false;

  @override
  void dispose() {
    _patientCodeController.dispose();
    super.dispose();
  }

  Future<void> _register({String? patientCode}) async {
    if (_isSubmitting) return;

    setState(() {
      _isSubmitting = true;
    });

    final source = widget.registrationData;

    final registrationData = PatientRegistrationData(
      registrationToken: source.registrationToken,
      name: source.name,
      birthDate: source.birthDate,
      sex: source.sex,
      phoneNumber: source.phoneNumber,
      postalCode: source.postalCode,
      address: source.address,
      addressDetail: source.addressDetail,
      patientCode: patientCode,
    );

    try {
      await _authService.registerPatient(registrationData);

      if (!mounted) return;

      await Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute<void>(
          builder: (context) {
            return RegistrationCompleteScreen(isLinked: patientCode != null);
          },
        ),
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

  Future<void> _checkPatientCode() async {
    final patientCode = _patientCodeController.text.trim();

    if (patientCode.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('환자코드를 입력해주세요.')));
      return;
    }

    await _register(patientCode: patientCode);
  }

  Future<void> _skipPatientLink() async {
    await _register();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7FAFD),
      appBar: AppBar(
        title: const Text(
          '환자정보 연결',
          style: TextStyle(
            color: Color(0xFF191F28),
            fontWeight: FontWeight.w700,
          ),
        ),
        backgroundColor: const Color(0xFFF7FAFD),
        foregroundColor: const Color(0xFF191F28),
        surfaceTintColor: Colors.transparent,
        elevation: 0,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
          children: [
            Center(
              child: Container(
                width: 80,
                height: 80,
                decoration: const BoxDecoration(
                  color: Color(0xFFEAF4FF),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.link_rounded,
                  size: 40,
                  color: Color(0xFF3182F6),
                ),
              ),
            ),

            const SizedBox(height: 28),

            const Text(
              '병원에서 받은\n환자코드가 있나요?',
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
              '환자코드를 연결하면 예약, 검사결과, 복약관리 등 '
              '모든 기능을 사용할 수 있어요.',
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
                  _checkPatientCode();
                }
              },
              decoration: InputDecoration(
                labelText: '환자코드',
                hintText: '예: P0001',
                filled: true,
                fillColor: Colors.white,
                labelStyle: const TextStyle(
                  color: Color(0xFF6B7280),
                ),
                hintStyle: const TextStyle(
                  color: Color(0xFF9CA3AF),
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(
                    color: Color(0xFFD9E4F0),
                  ),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(
                    color: Color(0xFF3182F6),
                    width: 1.5,
                  ),
                ),
                disabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(
                    color: Color(0xFFE5E7EB),
                  ),
                ),
              ),
            ),

            const SizedBox(height: 16),

            SizedBox(
              height: 54,
              child: FilledButton(
                onPressed: _isSubmitting ? null : _checkPatientCode,
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF3584E8),
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: const Color(0xFFAFCDF3),
                  disabledForegroundColor: Colors.white,
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
                        '환자코드 확인',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
              ),
            ),

            const SizedBox(height: 12),

            SizedBox(
              height: 52,
              child: TextButton(
                onPressed: _isSubmitting ? null : _skipPatientLink,
                child: const Text(
                  '나중에 입력하기',
                  style: TextStyle(
                    color: Color(0xFF3182F6),
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),

            const SizedBox(height: 12),

            const Text(
              '환자코드가 없어도 가입할 수 있으며, '
              '마이페이지에서 나중에 연결할 수 있습니다.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Color(0xFF8B95A1),
                fontSize: 12,
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}