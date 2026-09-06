import 'package:flutter/material.dart';

import 'language_setting_screen.dart';
import 'notification_setting_screen.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F6F9),
      appBar: AppBar(
        title: const Text('설정'),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildSection(
            title: '앱 설정',
            children: [
              _buildSettingItem(
                icon: Icons.notifications_none_rounded,
                title: '알림 설정',
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) =>
                          const NotificationSettingScreen(),
                    ),
                  );
                },
              ),
              const Divider(
                height: 1,
                indent: 52,
              ),
              _buildSettingItem(
                icon: Icons.language_rounded,
                title: '언어 설정',
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) =>
                          const LanguageSettingScreen(),
                    ),
                  );
                },
              ),
            ],
          ),

          const SizedBox(height: 16),

          _buildSection(
            title: '앱 정보',
            children: [
              _buildSettingItem(
                icon: Icons.info_outline_rounded,
                title: '버전 정보',
                trailing: '1.0.0',
                onTap: null,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSection({
    required String title,
    required List<Widget> children,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(
            left: 4,
            bottom: 8,
          ),
          child: Text(
            title,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Color(0xFF8B95A1),
            ),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: const Color(0xFFE5EAF0),
            ),
          ),
          child: Column(
            children: children,
          ),
        ),
      ],
    );
  }

  Widget _buildSettingItem({
    required IconData icon,
    required String title,
    required VoidCallback? onTap,
    String? trailing,
  }) {
    return ListTile(
      leading: Icon(
        icon,
        color: const Color(0xFF475569),
      ),
      title: Text(
        title,
        style: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: Color(0xFF27364B),
        ),
      ),
      trailing: trailing != null
          ? Text(
              trailing,
              style: const TextStyle(
                fontSize: 13,
                color: Color(0xFF8B95A1),
              ),
            )
          : const Icon(
              Icons.chevron_right_rounded,
              color: Color(0xFFAAB2BD),
            ),
      onTap: onTap,
    );
  }
}