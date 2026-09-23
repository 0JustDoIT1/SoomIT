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

  static const Color _primaryBlue = Color(0xFF3198F4);

  @override
  Size get preferredSize => const Size.fromHeight(60);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      automaticallyImplyLeading: false,
      elevation: 0,
      scrolledUnderElevation: 0,
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.white,
      toolbarHeight: 82,
      titleSpacing: 20,

      title: Row(
        children: [
          Image.asset(
            'assets/images/APP_ICON.png',
            width: 47,
            height: 47,
            fit: BoxFit.contain,
          ),

          const SizedBox(width: 9),

          const Text(
            '숨-잇',
            style: TextStyle(
              color: _primaryBlue,
              fontSize: 24,
              fontWeight: FontWeight.w800,
              letterSpacing: -1,
            ),
          ),
        ],
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

        const SizedBox(width: 16),
      ],
    );
  }
}

class _HeaderButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _HeaderButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFF6FAFF),
      shape: const CircleBorder(),
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: 46,
          height: 46,
          child: Icon(icon, size: 26, color: const Color(0xFF2F8DFE)),
        ),
      ),
    );
  }
}
