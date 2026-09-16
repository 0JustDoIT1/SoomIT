import 'package:flutter/material.dart';

import '../features/auth/existing_patient_link_screen.dart';

class PatientLinkRequiredScreen extends StatelessWidget {
  final String featureName;

  const PatientLinkRequiredScreen({super.key, required this.featureName});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              Container(
                width: 76,
                height: 76,
                decoration: const BoxDecoration(
                  color: Color(0xFFEDE7FA),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.link_rounded,
                  color: Color(0xFF6D4FB3),
                  size: 38,
                ),
              ),
              const SizedBox(height: 22),
              Text(
                '$featureName 이용을 위해\n환자코드를 연결해주세요.',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Color(0xFF191F28),
                  fontSize: 22,
                  height: 1.4,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                '병원에서 받은 환자코드를 연결하면 '
                '병원에 등록된 정보를 확인할 수 있어요.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Color(0xFF6B7280),
                  fontSize: 14,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: FilledButton(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (context) {
                          return const ExistingPatientLinkScreen();
                        },
                      ),
                    );
                  },
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF6D4FB3),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: const Text(
                    '환자코드 연결하기',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
