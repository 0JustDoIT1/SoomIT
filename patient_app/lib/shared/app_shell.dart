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

  late Future<PatientProfile> _profileFuture;

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

    // 앱이 위젯/알림을 통해 시작됐을 경우

    // pending 된 탭 번호를 먼저 사용

    _selectedIndex = NotificationNavigationService.instance
        .consumeInitialTabIndex();

    // 앱이 이미 실행 중일 때

    // 외부에서 탭 이동 요청을 받음

    _notificationNavigationSubscription = NotificationNavigationService
        .instance
        .tabRequests
        .listen((tabIndex) {
          if (!mounted || tabIndex < 0 || tabIndex > 4) {
            return;
          }

          debugPrint('AppShell 탭 이동 요청 수신: $tabIndex');

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
    // 사용자가 직접 하단 탭을 눌렀다면

    // 이전 외부 이동 요청은 더 이상 유지하지 않음

    NotificationNavigationService.instance.consumePendingRequest();

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
      // 알림 조회 실패는 앱 사용을 막지 않도록 무시
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

  // =========================================================

  // 기본 탭 화면

  // =========================================================

  Widget _buildScreenStack() {
    return FutureBuilder<PatientProfile>(
      future: _profileFuture,

      builder: (context, snapshot) {
        // -----------------------------------------------------

        // 프로필 로딩 중

        // -----------------------------------------------------

        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(
            child: CircularProgressIndicator(color: Color(0xFF3198F4)),
          );
        }

        // -----------------------------------------------------

        // 프로필 조회 실패

        //

        // 서버/네트워크 오류를 환자코드 미연결로

        // 잘못 판단하지 않도록 별도 오류 화면 표시

        // -----------------------------------------------------

        if (snapshot.hasError) {
          return Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),

              child: Column(
                mainAxisSize: MainAxisSize.min,

                children: [
                  Container(
                    width: 64,

                    height: 64,

                    decoration: BoxDecoration(
                      color: const Color(0xFFEAF5FF),

                      borderRadius: BorderRadius.circular(20),
                    ),

                    child: const Icon(
                      Icons.cloud_off_rounded,

                      size: 31,

                      color: Color(0xFF3198F4),
                    ),
                  ),

                  const SizedBox(height: 18),

                  const Text(
                    '환자 정보를 불러오지 못했습니다.',

                    textAlign: TextAlign.center,

                    style: TextStyle(
                      fontSize: 17,

                      fontWeight: FontWeight.w800,

                      color: Color(0xFF191F28),
                    ),
                  ),

                  const SizedBox(height: 8),

                  const Text(
                    '네트워크 또는 서버 연결 상태를 확인한 후\n다시 시도해주세요.',

                    textAlign: TextAlign.center,

                    style: TextStyle(
                      fontSize: 13,

                      height: 1.5,

                      color: Color(0xFF6B7684),
                    ),
                  ),

                  const SizedBox(height: 20),

                  SizedBox(
                    width: 150,

                    height: 46,

                    child: ElevatedButton(
                      onPressed: () {
                        setState(() {
                          _profileFuture = _profileService.getProfile();
                        });
                      },

                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF3198F4),

                        foregroundColor: Colors.white,

                        elevation: 0,

                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(13),
                        ),
                      ),

                      child: const Text(
                        '다시 시도',

                        style: TextStyle(
                          fontSize: 14,

                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        // -----------------------------------------------------

        // 정상 응답인데 데이터가 없는 예외 상황

        // -----------------------------------------------------

        final profile = snapshot.data;

        if (profile == null) {
          return const Center(
            child: Text(
              '환자 정보를 확인할 수 없습니다.',

              style: TextStyle(fontSize: 14, color: Color(0xFF6B7684)),
            ),
          );
        }

        // 실제 프로필 응답의 연결 상태로만 판단

        final isLinked = profile.appLinkStatus.trim().toUpperCase() == 'LINKED';

        final screens = <Widget>[
          // 0 홈
          HomeScreen(
            onOpenExamResults: () {
              _onTabChanged(2);
            },
          ),

          // 1 예약
          isLinked
              ? const AppointmentScreen()
              : const PatientLinkRequiredScreen(featureName: '예약'),

          // 2 검사결과
          isLinked
              ? const ExamResultScreen()
              : const PatientLinkRequiredScreen(featureName: '검사결과'),

          // 3 복약관리
          isLinked
              ? const MedicationScreen()
              : const PatientLinkRequiredScreen(featureName: '복약관리'),

          // 4 마이페이지
          const MyPageScreen(),
        ];

        return IndexedStack(index: _selectedIndex, children: screens);
      },
    );
  }

  // =========================================================

  // 챗봇 Overlay

  // =========================================================

  Widget _buildChatbotOverlay() {
    final topInset = MediaQuery.of(context).padding.top;

    return Stack(
      children: [
        // 기존 화면
        Positioned.fill(child: _buildScreenStack()),

        // 전체 화면 Blur
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

        // 챗봇 카드
        Positioned(
          left: 8,

          right: 8,

          top: topInset + 8,

          bottom: 88,

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
    );
  }

  // =========================================================

  // 화면

  // =========================================================

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      resizeToAvoidBottomInset: true,

      backgroundColor: const Color(0xFFF4F6F9),

      // =====================================================

      // 상단바

      // 챗봇 열리면 숨김

      // =====================================================
      appBar: _isChatbotOpen
          ? null
          : AppHeader(
              onMenuPressed: _openQrScreen,

              onNotificationPressed: _openNotificationScreen,

              hasUnreadNotification: _hasUnreadNotification,
            ),

      // =====================================================

      // 본문

      // =====================================================
      body: _isChatbotOpen ? _buildChatbotOverlay() : _buildScreenStack(),

      // =====================================================

      // 숨이 챗봇 버튼 / 닫기 버튼

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

                  width: 45,

                  height: 45,

                  decoration: BoxDecoration(
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
                        color: const Color(0xFF359FF0).withValues(alpha: 0.26),

                        blurRadius: 10,

                        offset: const Offset(0, 5),
                      ),
                    ],
                  ),

                  child: const Icon(
                    Icons.close_rounded,

                    color: Colors.white,

                    size: 25,
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

      // 챗봇 열리면 숨김

      // =====================================================
      bottomNavigationBar: _isChatbotOpen
          ? null
          : BottomNav(currentIndex: _selectedIndex, onTap: _onTabChanged),
    );
  }
}
