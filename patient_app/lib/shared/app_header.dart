import 'package:flutter/material.dart';

class AppHeader extends StatelessWidget implements PreferredSizeWidget {
  final VoidCallback onMenuPressed;
  final VoidCallback onNotificationPressed;
  final bool hasUnreadNotification;

  const AppHeader({
    super.key,
    required this.onMenuPressed,
    required this.onNotificationPressed,
    this.hasUnreadNotification = false,
  });

  @override
  Size get preferredSize => const Size.fromHeight(70);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      automaticallyImplyLeading: false,
      elevation: 0,
      scrolledUnderElevation: 0,
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.white,
      toolbarHeight: 80,
      titleSpacing: 15,

      title: Align(
        alignment: Alignment.centerLeft,
        child: SizedBox(
          width: 140,
          height: 45,
          child: Image.asset(
            'assets/images/가로_숨잇_logo.png',
            fit: BoxFit.contain,
            alignment: Alignment.centerLeft,
          ),
        ),
      ),

      actions: [
        _HeaderButton(
          icon: Icons.qr_code_scanner_rounded,
          onTap: onMenuPressed,
        ),

        const SizedBox(width: 8),

        Stack(
          clipBehavior: Clip.none,
          children: [
            _HeaderButton(
              icon: Icons.notifications_none_rounded,
              onTap: onNotificationPressed,
            ),

            if (hasUnreadNotification)
              Positioned(
                right: 7,
                top: 7,
                child: Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    color: Color(0xFFFF5A5F),
                    shape: BoxShape.circle,
                  ),
                ),
              ),
          ],
        ),

        const SizedBox(width: 15),
      ],
    );
  }
}

class _HeaderButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _HeaderButton({
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFF6FAFF),
      shape: const CircleBorder(),
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: 50,
          height: 50,
          child: Icon(
            icon,
            size: 25,
            color: const Color(0xFF2F8DFE),
          ),
        ),
      ),
    );
  }
}