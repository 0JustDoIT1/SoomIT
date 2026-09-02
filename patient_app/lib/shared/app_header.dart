// 상단 appbar

import 'package:flutter/material.dart';

class AppHeader extends StatelessWidget implements PreferredSizeWidget {
  const AppHeader({
    super.key,
    this.onMenuPressed,
    this.onNotificationPressed,
  });

  final VoidCallback? onMenuPressed;
  final VoidCallback? onNotificationPressed;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      backgroundColor: Colors.white,
      elevation: 0.5,

      leading: IconButton(
        icon: const Icon(
          Icons.menu_rounded,
          color: Color(0xFF191F28),
        ),
        onPressed: onMenuPressed,
      ),

      title: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.air_rounded,
            color: Color(0xFF2B66F6),
            size: 22,
          ),
          SizedBox(width: 6),
          Text(
            '숨-잇',
            style: TextStyle(
              color: Color(0xFF191F28),
              fontWeight: FontWeight.bold,
              fontSize: 18,
            ),
          ),
        ],
      ),

      centerTitle: true,

      actions: [
        Stack(
          alignment: Alignment.center,
          children: [
            IconButton(
              icon: const Icon(
                Icons.notifications_none_rounded,
                color: Color(0xFF191F28),
              ),
              onPressed: onNotificationPressed,
            ),

            Positioned(
              right: 10,
              top: 10,
              child: Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                  color: Color(0xFFFF3B30),
                  shape: BoxShape.circle,
                ),
              ),
            ),
          ],
        ),

        const SizedBox(width: 4),
      ],
    );
  }
}