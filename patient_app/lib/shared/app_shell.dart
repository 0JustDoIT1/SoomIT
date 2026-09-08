// 헤더 + 본문
import 'package:flutter/material.dart';

import '../features/notification/notification_list_screen.dart';
import '../features/appointment/appointment_screen.dart';
import '../features/exam_result/exam_result_screen.dart';
import '../features/home/home_screen.dart';
import '../features/mypage/mypage_screen.dart';


import 'app_header.dart';
import 'bottom_nav.dart';

import '../features/medication/medication_screen.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _selectedIndex = 0;

  void _onTabChanged(int index) {
    setState(() {
      _selectedIndex = index;
    });
  }

  @override
  Widget build(BuildContext context) {

  final screens = [
    const HomeScreen(),
    const AppointmentScreen(),
    const ExamResultScreen(),
    const MedicationScreen(),
    const MyPageScreen(),
  ];

    return Scaffold(
      backgroundColor: const Color(0xFFF4F6F9),

      appBar: AppHeader(
        onMenuPressed: () {
          // 메뉴
        },
        onNotificationPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) =>
                  const NotificationListScreen(),
            ),
          );
        },
      ),

      body: IndexedStack(
        index: _selectedIndex,
        children: screens,
      ),

      bottomNavigationBar: BottomNav(
        currentIndex: _selectedIndex,
        onTap: _onTabChanged,
      ),
    );
  }
}

