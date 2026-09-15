import 'package:flutter/material.dart';

import '../../shared/app_shell.dart';

class RegistrationCompleteScreen extends StatelessWidget {
  final bool isLinked;

  const RegistrationCompleteScreen({
    super.key,
    required this.isLinked,
  });

  void _startApp(BuildContext context) {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(
        builder: (context) => const AppShell(),
      ),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final title = isLinked
        ? '환자정보가 연결됐어요'
        : '가입이 완료됐어요';

    final description = isLinked
        ? '숨-잇의 모든 기능을 사용할 수 있어요.'
        : '환자코드는 마이페이지에서 나중에 연결할 수 있어요.';

    return Scaffold(
      backgroundColor: const Color(0xFFF9F8FC),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(),
              Container(
                width: 88,
                height: 88,
                decoration: const BoxDecoration(
                  color: Color(0xFFE8F7ED),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.check_rounded,
                  color: Color(0xFF2E8B57),
                  size: 48,
                ),
              ),
              const SizedBox(height: 28),
              Text(
                title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Color(0xFF191F28),
                  fontSize: 25,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                description,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Color(0xFF6B7280),
                  fontSize: 14,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 32),
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: const Color(0xFFE5E7EB),
                  ),
                ),
                child: Column(
                  children: [
                    _SummaryRow(
                      label: '계정 상태',
                      value: isLinked ? '연결됨' : '미연결',
                    ),
                    const Divider(height: 28),
                    _SummaryRow(
                      label: '이용 범위',
                      value: isLinked
                          ? '전체 기능'
                          : '제한된 기능',
                    ),
                  ],
                ),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                height: 54,
                child: FilledButton(
                  onPressed: () => _startApp(context),
                  style: FilledButton.styleFrom(
                    backgroundColor:
                        const Color(0xFF6D4FB3),
                    shape: RoundedRectangleBorder(
                      borderRadius:
                          BorderRadius.circular(14),
                    ),
                  ),
                  child: const Text(
                    '숨-잇 시작하기',
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
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;

  const _SummaryRow({
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: Color(0xFF6B7280),
            fontSize: 14,
          ),
        ),
        Text(
          value,
          style: const TextStyle(
            color: Color(0xFF191F28),
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}