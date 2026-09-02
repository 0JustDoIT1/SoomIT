import 'package:flutter/material.dart';

import '../../../shared/base_card.dart';

class NotificationCard extends StatelessWidget {
  const NotificationCard({super.key});

  @override
  Widget build(BuildContext context) {
    return BaseCard(
      padding: const EdgeInsets.symmetric(
        horizontal: 16,
        vertical: 8,
      ),
      child: Column(
        children: [
          _buildNotificationItem(
            '폐기능 검사 결과지가 등록되었습니다.',
            '10분 전',
          ),

          const Divider(
            height: 1,
            color: Color(0xFFF2F4F6),
          ),

          _buildNotificationItem(
            '9월 4일 진료 예약 안내',
            '1시간 전',
          ),
        ],
      ),
    );
  }

  Widget _buildNotificationItem(
    String title,
    String time,
  ) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        vertical: 10,
      ),
      child: Row(
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: const BoxDecoration(
              color: Color(0xFF2B66F6),
              shape: BoxShape.circle,
            ),
          ),

          const SizedBox(width: 10),

          Expanded(
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 13,
                color: Color(0xFF333D4B),
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),

          const SizedBox(width: 8),

          Text(
            time,
            style: const TextStyle(
              fontSize: 11,
              color: Color(0xFF8B95A1),
            ),
          ),
        ],
      ),
    );
  }
}