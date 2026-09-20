import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';

import '../features/appointment/appointment_screen.dart';
import '../features/chatbot/chatbot_screen.dart';
import '../features/exam_result/exam_result_screen.dart';
import '../features/home/home_screen.dart';
import '../features/home/models/patient_profile.dart';
import '../features/home/services/profile_service.dart';
import '../features/home/services/notification_service.dart';
import '../features/medication/medication_screen.dart';
import '../features/mypage/mypage_screen.dart';
import '../features/mypage/patient_qr_screen.dart';
import '../features/notification/notification_list_screen.dart';
import '../features/notification/notification_navigation_service.dart';

import 'app_header.dart';
import 'bottom_nav.dart';
import 'patient_link_required_screen.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell>
    with SingleTickerProviderStateMixin {
  final ProfileService _profileService = ProfileService();
  final NotificationService _notificationService = NotificationService();

  late final Future<PatientProfile> _profileFuture;

  late int _selectedIndex;

  bool _isChatbotOpen = false;
  bool _hasUnreadNotification = false;

  late final AnimationController _chatbotController;

  late final Animation<double> _chatbotScale;

  late final Animation<double> _chatbotOpacity;

  late final StreamSubscription<int> _notificationNavigationSubscription;

  @override
  void initState() {
    super.initState();

    _selectedIndex = NotificationNavigationService.instance
        .consumeInitialTabIndex();

    _notificationNavigationSubscription = NotificationNavigationService
        .instance
        .tabRequests
        .listen((tabIndex) {
          NotificationNavigationService.instance.consumePendingRequest();

          if (!mounted || tabIndex < 0 || tabIndex > 4) {
            return;
          }

          setState(() {
            _selectedIndex = tabIndex;
          });
        });

    _profileFuture = _profileService.getProfile();

    unawaited(_refreshUnreadNotificationState());

    _chatbotController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 340),
      reverseDuration: const Duration(milliseconds: 250),
    );

    _chatbotScale = Tween<double>(begin: 0.05, end: 1.0).animate(
      CurvedAnimation(
        parent: _chatbotController,
        curve: Curves.easeOutCubic,
        reverseCurve: Curves.easeInCubic,
      ),
    );

    _chatbotOpacity = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(
        parent: _chatbotController,
        curve: const Interval(0.05, 1, curve: Curves.easeOut),
        reverseCurve: Curves.easeIn,
      ),
    );
  }

  @override
  void dispose() {
    _notificationNavigationSubscription.cancel();

    _chatbotController.dispose();

    super.dispose();
  }

  // =========================================================
  // 하단 탭 변경
  // =========================================================

  void _onTabChanged(int index) {
    setState(() {
      _selectedIndex = index;
    });
  }

  // =========================================================
  // QR 화면
  // =========================================================

  Future<void> _openQrScreen() async {
    try {
      final profile = await _profileFuture;

      if (!mounted) {
        return;
      }

      if (profile.appLinkStatus != 'LINKED') {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('환자코드를 연결한 후 QR을 사용할 수 있습니다.')),
        );

        return;
      }

      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) {
            return PatientQrScreen(
              patientName: profile.name,
              patientCode: profile.patientCode,
            );
          },
        ),
      );
    } catch (_) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('QR 정보를 불러오지 못했습니다.')));
    }
  }

  // =========================================================
  // 알림 읽음 상태
  // =========================================================

  Future<void> _refreshUnreadNotificationState() async {
    try {
      final notifications = await _notificationService.getNotifications();

      if (!mounted) {
        return;
      }

      final hasUnread = notifications.any(
        (notification) => !notification.isRead,
      );

      if (_hasUnreadNotification == hasUnread) {
        return;
      }

      setState(() {
        _hasUnreadNotification = hasUnread;
      });
    } catch (_) {
      // 알림 상태 조회 실패는 상단바 전체 사용을 막지 않도록 무시합니다.
    }
  }

  // =========================================================
  // 알림 화면
  // =========================================================

  Future<void> _openNotificationScreen() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) {
          return const NotificationListScreen();
        },
      ),
    );

    if (!mounted) {
      return;
    }

    await _refreshUnreadNotificationState();
  }

  // =========================================================
  // 챗봇
  // =========================================================

  Future<void> _openChatbot() async {
    if (_isChatbotOpen) {
      return;
    }

    setState(() {
      _isChatbotOpen = true;
    });

    await _chatbotController.forward();
  }

  Future<void> _closeChatbot() async {
    if (!_isChatbotOpen) {
      return;
    }

    await _chatbotController.reverse();

    if (!mounted) {
      return;
    }

    setState(() {
      _isChatbotOpen = false;
    });
  }

  void _toggleChatbot() {
    if (_isChatbotOpen) {
      _closeChatbot();
    } else {
      _openChatbot();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F6F9),

      // =====================================================
      // 상단바
      // =====================================================
      appBar: AppHeader(
        // 기존 onMenuPressed 자리를
        // QR 버튼으로 사용
        onMenuPressed: _openQrScreen,

        onNotificationPressed: _openNotificationScreen,
        hasUnreadNotification: _hasUnreadNotification,
      ),

      // =====================================================
      // 본문
      // =====================================================
      body: Stack(
        children: [
          Positioned.fill(
            child: FutureBuilder<PatientProfile>(
              future: _profileFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Center(
                    child: CircularProgressIndicator(color: Color(0xFF3198F4)),
                  );
                }

                final isLinked = snapshot.data?.appLinkStatus == 'LINKED';

                final screens = <Widget>[
                  // 홈
                  const HomeScreen(),

                  // 예약
                  isLinked
                      ? const AppointmentScreen()
                      : const PatientLinkRequiredScreen(featureName: '예약'),

                  // 검사 결과
                  isLinked
                      ? const ExamResultScreen()
                      : const PatientLinkRequiredScreen(featureName: '검사결과'),

                  // 복약
                  isLinked
                      ? const MedicationScreen()
                      : const PatientLinkRequiredScreen(featureName: '복약관리'),

                  // 마이페이지
                  const MyPageScreen(),
                ];

                return IndexedStack(index: _selectedIndex, children: screens);
              },
            ),
          ),

          // =================================================
          // 챗봇 열렸을 때 배경 Blur
          // =================================================
          if (_isChatbotOpen)
            Positioned.fill(
              child: AnimatedBuilder(
                animation: _chatbotController,
                builder: (context, child) {
                  final value = _chatbotController.value;

                  return GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: _closeChatbot,
                    child: BackdropFilter(
                      filter: ImageFilter.blur(
                        sigmaX: 5 * value,
                        sigmaY: 5 * value,
                      ),
                      child: Container(
                        color: Colors.black.withValues(alpha: 0.10 * value),
                      ),
                    ),
                  );
                },
              ),
            ),

          // =================================================
          // 챗봇 창
          // =================================================
          if (_isChatbotOpen)
            Positioned(
              left: 16,
              right: 16,
              top: 24,
              // 닫기(X) 버튼과 챗봇 카드가 겹치지 않도록
              // 버튼 높이 + 그림자 영역까지 여유 공간 확보
              bottom: 112,

              child: FadeTransition(
                opacity: _chatbotOpacity,

                child: ScaleTransition(
                  scale: _chatbotScale,

                  alignment: Alignment.bottomRight,

                  child: Material(
                    elevation: 20,

                    borderRadius: BorderRadius.circular(26),

                    clipBehavior: Clip.antiAlias,

                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.surface,

                        borderRadius: BorderRadius.circular(26),
                      ),

                      child: const ChatbotScreen(),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),

      // =====================================================
      // 숨이 챗봇 플로팅 버튼
      // =====================================================
      floatingActionButton: GestureDetector(
        onTap: _toggleChatbot,

        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),

          transitionBuilder: (child, animation) {
            return RotationTransition(
              turns: Tween<double>(begin: 0.75, end: 1).animate(animation),

              child: ScaleTransition(scale: animation, child: child),
            );
          },

          child: _isChatbotOpen
              ? Container(
                  key: const ValueKey('chatbot-close'),
                  width: 58,
                  height: 58,
                  decoration: BoxDecoration(
                    // 숨이 아이콘의 하늘색·청록색·블루 톤에 맞춘 그라데이션.
                    // 별도의 하이라이트/테두리 원은 사용하지 않음.
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        Color(0xFF9DEEF7),
                        Color(0xFF61D4F5),
                        Color(0xFF359FF0),
                        Color(0xFF75E5D5),
                      ],
                      stops: [0.0, 0.34, 0.70, 1.0],
                    ),
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF359FF0).withValues(alpha: 0.30),
                        blurRadius: 14,
                        offset: const Offset(0, 7),
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.close_rounded,
                    color: Colors.white,
                    size: 30,
                  ),
                )
              : SizedBox(
                  key: const ValueKey('chatbot-soomi'),
                  width: 70,
                  height: 70,
                  child: Image.asset(
                    'assets/images/AIchat숨이.png',
                    fit: BoxFit.contain,
                  ),
                ),
        ),
      ),

      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,

      // =====================================================
      // 하단 네비게이션
      // =====================================================
      bottomNavigationBar: _isChatbotOpen
          ? null
          : BottomNav(currentIndex: _selectedIndex, onTap: _onTabChanged),
    );
  }
}
