import 'package:flutter/material.dart';

import 'widgets/appointment_card.dart';
import 'widgets/exam_card.dart';
import 'widgets/medication_card.dart';
import 'widgets/notification_card.dart';
import 'widgets/profile_card.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(
          horizontal: 20,
          vertical: 16,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const ProfileCard(),

            const SizedBox(height: 24),

            _buildSectionHeader(
              '다음 진료 예약',
              () {},
            ),

            const SizedBox(height: 10),

            const AppointmentCard(),

            const SizedBox(height: 24),

            _buildSectionHeader(
              '검사 일정',
              () {},
            ),

            const SizedBox(height: 10),

            const ExamCard(),

            const SizedBox(height: 24),

            _buildSectionHeader(
              '오늘의 복약',
              () {},
            ),

            const SizedBox(height: 10),

            const MedicationCard(),

            const SizedBox(height: 24),

            _buildSectionHeader(
              '최근 알림',
              () {},
            ),

            const SizedBox(height: 10),

            const NotificationCard(),

            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionHeader(
    String title,
    VoidCallback onMoreTap,
  ) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.bold,
            color: Color(0xFF191F28),
          ),
        ),

        GestureDetector(
          onTap: onMoreTap,
          child: const Row(
            children: [
              Text(
                '전체보기',
                style: TextStyle(
                  fontSize: 13,
                  color: Color(0xFF8B95A1),
                  fontWeight: FontWeight.w500,
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                size: 18,
                color: Color(0xFF8B95A1),
              ),
            ],
          ),
        ),
      ],
    );
  }
}