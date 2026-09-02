// 헤더 + 본문
import 'package:flutter/material.dart';

import '../features/home/home_screen.dart';
import 'app_header.dart';
import 'bottom_nav.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _selectedIndex = 0;

  final List<Widget> _screens = const [
    HomeScreen(),
    _PlaceholderScreen(title: '예약'),
    _PlaceholderScreen(title: '검사·결과'),
    _PlaceholderScreen(title: '복약'),
    _PlaceholderScreen(title: '마이페이지'),
  ];

  void _onTabChanged(int index) {
    setState(() {
      _selectedIndex = index;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F6F9),

      appBar: AppHeader(
        onMenuPressed: () {
          // TODO: 메뉴 기능 연결
        },
        onNotificationPressed: () {
          // TODO: 알림 화면 연결
        },
      ),

      body: IndexedStack(
        index: _selectedIndex,
        children: _screens,
      ),

      bottomNavigationBar: BottomNav(
        currentIndex: _selectedIndex,
        onTap: _onTabChanged,
      ),
    );
  }
}

class _PlaceholderScreen extends StatelessWidget {
  const _PlaceholderScreen({
    required this.title,
  });

  final String title;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        title,
        style: const TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.bold,
          color: Color(0xFF191F28),
        ),
      ),
    );
  }
}