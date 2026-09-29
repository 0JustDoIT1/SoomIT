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
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final backgroundColor = isDark ? const Color(0xFF17212B) : Colors.white;

    final buttonBackgroundColor = isDark
        ? const Color(0xFF1F2C38)
        : const Color(0xFFF6FAFF);

    final dividerColor = isDark
        ? const Color(0xFF2A3948)
        : const Color(0xFFE8EEF4);

    return AppBar(
      automaticallyImplyLeading: false,
      elevation: 0,
      scrolledUnderElevation: 0,
      backgroundColor: backgroundColor,
      surfaceTintColor: backgroundColor,
      toolbarHeight: 80,
      titleSpacing: 15,

      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(1),
        child: Divider(height: 1, thickness: 1, color: dividerColor),
      ),

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
          backgroundColor: buttonBackgroundColor,
        ),

        const SizedBox(width: 8),

        Stack(
          clipBehavior: Clip.none,
          children: [
            _HeaderButton(
              icon: Icons.notifications_none_rounded,
              onTap: onNotificationPressed,
              backgroundColor: buttonBackgroundColor,
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
  final Color backgroundColor;

  const _HeaderButton({
    required this.icon,
    required this.onTap,
    required this.backgroundColor,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: backgroundColor,
      shape: const CircleBorder(),
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: 50,
          height: 50,
          child: Icon(icon, size: 25, color: const Color(0xFF2F8DFE)),
        ),
      ),
    );
  }
}
