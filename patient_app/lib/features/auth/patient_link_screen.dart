import 'package:flutter/material.dart';
import 'registration_complete_screen.dart';

class PatientLinkScreen extends StatefulWidget {
  final String patientAccountId;

  const PatientLinkScreen({super.key, required this.patientAccountId});

  @override
  State<PatientLinkScreen> createState() =>
      _PatientLinkScreenState();
}

class _PatientLinkScreenState extends State<PatientLinkScreen> {
  final _patientCodeController = TextEditingController();

  @override
  void dispose() {
    _patientCodeController.dispose();
    super.dispose();
  }

  void _checkPatientCode() {
    final patientCode =
        _patientCodeController.text.trim();

    if (patientCode.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('환자코드를 입력해주세요.'),
        ),
      );
      return;
    }

    // TODO: Backend 환자코드 확인 API 성공 후 이동
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) {
          return const RegistrationCompleteScreen(
            isLinked: true,
          );
        },
      ),
    );
  }

  void _skipPatientLink() {
    // TODO: Backend에서 UNLINKED 상태로 회원가입 완료
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) {
          return const RegistrationCompleteScreen(
            isLinked: false,
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9F8FC),
      appBar: AppBar(
        title: const Text(
          '환자정보 연결',
          style: TextStyle(
            fontWeight: FontWeight.w700,
          ),
        ),
        backgroundColor: const Color(0xFFF9F8FC),
        surfaceTintColor: Colors.transparent,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            24,
            24,
            24,
            32,
          ),
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
              textCapitalization:
                  TextCapitalization.characters,
              decoration: InputDecoration(
                labelText: '환자코드',
                hintText: '예: P0001',
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius:
                      BorderRadius.circular(12),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius:
                      BorderRadius.circular(12),
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
                onPressed: _checkPatientCode,
                style: FilledButton.styleFrom(
                  backgroundColor:
                      const Color(0xFF6D4FB3),
                  shape: RoundedRectangleBorder(
                    borderRadius:
                        BorderRadius.circular(14),
                  ),
                ),
                child: const Text(
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
                onPressed: _skipPatientLink,
                child: const Text(
                  '나중에 입력하기',
                  style: TextStyle(
                    color: Color(0xFF6D4FB3),
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
