import 'package:flutter/material.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _selectedIndex = 0;

  // 복약 체크 상태 관리 (임시 Mock)
  final Map<String, bool> _medicationStatus = {
    'morning': true,
    'evening': false,
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F6F9),
      // 1. 상단 앱바
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0.5,
        leading: IconButton(
          icon: const Icon(Icons.menu_rounded, color: Color(0xFF191F28)),
          onPressed: () {},
        ),
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: const [
            Icon(Icons.air_rounded, color: Color(0xFF2B66F6), size: 22),
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
                icon: const Icon(Icons.notifications_none_rounded, color: Color(0xFF191F28)),
                onPressed: () {},
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
      ),

      // 2. 스크롤 본문
      body: SafeArea(
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 환자 프로필 & 환자코드 카드
              _buildProfileCard(),
              const SizedBox(height: 24),

              // 외래진료 예약 섹션
              _buildSectionHeader('다음 진료 예약', () {}),
              const SizedBox(height: 10),
              _buildAppointmentCard(),
              const SizedBox(height: 24),

              // 검사 일정 섹션
              _buildSectionHeader('검사 일정', () {}),
              const SizedBox(height: 10),
              _buildExamCard(),
              const SizedBox(height: 24),

              // 복약 일정 섹션
              _buildSectionHeader('오늘의 복약', () {}),
              const SizedBox(height: 10),
              _buildMedicationCard(),
              const SizedBox(height: 24),

              // 최근 알림 섹션
              _buildSectionHeader('최근 알림', () {}),
              const SizedBox(height: 10),
              _buildRecentNotificationsCard(),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),

      // 3. 하단 탭바
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: Color(0xFFEEEEEE), width: 1.0)),
        ),
        child: BottomNavigationBar(
          currentIndex: _selectedIndex,
          onTap: (index) => setState(() => _selectedIndex = index),
          type: BottomNavigationBarType.fixed,
          backgroundColor: Colors.white,
          selectedItemColor: const Color(0xFF2B66F6),
          unselectedItemColor: const Color(0xFF8B95A1),
          selectedFontSize: 11,
          unselectedFontSize: 11,
          items: const [
            BottomNavigationBarItem(icon: Icon(Icons.home_filled), label: '홈'),
            BottomNavigationBarItem(icon: Icon(Icons.calendar_month_outlined), label: '예약'),
            BottomNavigationBarItem(icon: Icon(Icons.assignment_outlined), label: '검사·결과'),
            BottomNavigationBarItem(icon: Icon(Icons.medication_outlined), label: '복약'),
            BottomNavigationBarItem(icon: Icon(Icons.person_outline), label: '마이페이지'),
          ],
        ),
      ),
    );
  }

  // 공통 섹션 헤더
  Widget _buildSectionHeader(String title, VoidCallback onMoreTap) {
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
                style: TextStyle(fontSize: 13, color: Color(0xFF8B95A1), fontWeight: FontWeight.w500),
              ),
              Icon(Icons.chevron_right_rounded, size: 18, color: Color(0xFF8B95A1)),
            ],
          ),
        ),
      ],
    );
  }

  // 1) 프로필 & 환자코드 카드
  Widget _buildProfileCard() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF2B66F6), Color(0xFF1B4ED8)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF2B66F6).withOpacity(0.25),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            children: [
              const CircleAvatar(
                radius: 24,
                backgroundColor: Colors.white24,
                child: Icon(Icons.person, color: Colors.white, size: 28),
              ),
              const SizedBox(width: 14),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  Text(
                    '김숨잇 님',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
                  ),
                  SizedBox(height: 2),
                  Text(
                    '오늘도 숨 편한 하루 되세요!',
                    style: TextStyle(fontSize: 13, color: Colors.white70),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Row(
                  children: [
                    Text('환자코드', style: TextStyle(fontSize: 13, color: Colors.white70)),
                    SizedBox(width: 10),
                    Text(
                      'PAT-7F29A3',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white, letterSpacing: 0.5),
                    ),
                  ],
                ),
                InkWell(
                  onTap: () {},
                  child: Row(
                    children: const [
                      Icon(Icons.qr_code_rounded, color: Colors.white, size: 18),
                      SizedBox(width: 4),
                      Text('QR보기', style: TextStyle(fontSize: 12, color: Colors.white, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // 2) 외래진료 예약 카드
  Widget _buildAppointmentCard() {
    return _buildBaseCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _buildTag('D-3', const Color(0xFFEFF6FF), const Color(0xFF2B66F6)),
              const Text('예약확정', style: TextStyle(fontSize: 12, color: Color(0xFF2B66F6), fontWeight: FontWeight.w600)),
            ],
          ),
          const SizedBox(height: 12),
          const Text('2026.09.04 (금) 10:30', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF191F28))),
          const SizedBox(height: 4),
          const Text('호흡기내과 · 김의사 교수', style: TextStyle(fontSize: 14, color: Color(0xFF4E5968))),
        ],
      ),
    );
  }

  // 3) 검사 일정 카드
  Widget _buildExamCard() {
    return _buildBaseCard(
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFF3F4F6),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.medical_services_outlined, color: Color(0xFF4E5968), size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text('폐기능 검사 (PFT)', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFF191F28))),
                SizedBox(height: 2),
                Text('2026.09.04 (금) 09:30', style: TextStyle(fontSize: 13, color: Color(0xFF4E5968))),
                Text('본관 2층 검사실', style: TextStyle(fontSize: 12, color: Color(0xFF8B95A1))),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // 4) 복약 일정 카드
  Widget _buildMedicationCard() {
    return _buildBaseCard(
      child: Column(
        children: [
          _buildMedicationRow('morning', '08:00 (아침)', '심바스타틴 20mg 외 1건'),
          const Divider(height: 20, color: Color(0xFFF2F4F6)),
          _buildMedicationRow('evening', '19:00 (저녁)', '아스피린 100mg'),
        ],
      ),
    );
  }

  Widget _buildMedicationRow(String key, String time, String name) {
    bool isDone = _medicationStatus[key] ?? false;
    return Row(
      children: [
        GestureDetector(
          onTap: () {
            setState(() {
              _medicationStatus[key] = !isDone;
            });
          },
          child: Icon(
            isDone ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
            color: isDone ? const Color(0xFF2B66F6) : const Color(0xFFD1D5DB),
            size: 22,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                time,
                style: TextStyle(
                  fontSize: 12,
                  color: isDone ? const Color(0xFF8B95A1) : const Color(0xFF4E5968),
                  fontWeight: FontWeight.w500,
                ),
              ),
              Text(
                name,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: isDone ? const Color(0xFF9CA3AF) : const Color(0xFF191F28),
                  decoration: isDone ? TextDecoration.lineThrough : null,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // 5) 최근 알림 카드
  Widget _buildRecentNotificationsCard() {
    return _buildBaseCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Column(
        children: [
          _buildNotificationItem('폐기능 검사 결과지가 등록되었습니다.', '10분 전'),
          const Divider(height: 1, color: Color(0xFFF2F4F6)),
          _buildNotificationItem('9월 4일 진료 예약 안내', '1시간 전'),
        ],
      ),
    );
  }

  Widget _buildNotificationItem(String title, String time) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10.0),
      child: Row(
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: const BoxDecoration(color: Color(0xFF2B66F6), shape: BoxShape.circle),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              title,
              style: const TextStyle(fontSize: 13, color: Color(0xFF333D4B)),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 8),
          Text(time, style: const TextStyle(fontSize: 11, color: Color(0xFF8B95A1))),
        ],
      ),
    );
  }

  // 카드 공통 래퍼 위젯
  Widget _buildBaseCard({required Widget child, EdgeInsetsGeometry? padding}) {
    return Container(
      width: double.infinity,
      padding: padding ?? const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.03),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: child,
    );
  }

  // Tag 위젯
  Widget _buildTag(String text, Color bgColor, Color textColor) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        text,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: textColor),
      ),
    );
  }
}