import 'dart:ui';

import 'package:flutter/material.dart';

import '../features/appointment/appointment_screen.dart';
import '../features/chatbot/chatbot_screen.dart';
import '../features/exam_result/exam_result_screen.dart';
import '../features/home/home_screen.dart';
import '../features/medication/medication_screen.dart';
import '../features/mypage/mypage_screen.dart';
import '../features/notification/notification_list_screen.dart';

import 'app_header.dart';
import 'bottom_nav.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell>
    with SingleTickerProviderStateMixin {
  int _selectedIndex = 0;

  bool _isChatbotOpen = false;

  late final AnimationController _chatbotController;

  late final Animation<double> _chatbotScale;
  late final Animation<double> _chatbotOpacity;

  @override
  void initState() {
    super.initState();

    _chatbotController = AnimationController(
      vsync: this,
      duration: const Duration(
        milliseconds: 340,
      ),
      reverseDuration: const Duration(
        milliseconds: 250,
      ),
    );

    _chatbotScale = Tween<double>(
      begin: 0.05,
      end: 1.0,
    ).animate(
      CurvedAnimation(
        parent: _chatbotController,
        curve: Curves.easeOutCubic,
        reverseCurve: Curves.easeInCubic,
      ),
    );

    _chatbotOpacity = Tween<double>(
      begin: 0,
      end: 1,
    ).animate(
      CurvedAnimation(
        parent: _chatbotController,
        curve: const Interval(
          0.05,
          1,
          curve: Curves.easeOut,
        ),
        reverseCurve: Curves.easeIn,
      ),
    );
  }

  @override
  void dispose() {
    _chatbotController.dispose();
    super.dispose();
  }

  void _onTabChanged(int index) {
    setState(() {
      _selectedIndex = index;
    });
  }

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
    final screens = [
      const HomeScreen(),
      const AppointmentScreen(),
      const ExamResultScreen(),
      const MedicationScreen(),
      const MyPageScreen(),
    ];

    return Scaffold(
      backgroundColor: const Color(
        0xFFF4F6F9,
      ),

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

      body: Stack(
        children: [
          Positioned.fill(
            child: IndexedStack(
              index: _selectedIndex,
              children: screens,
            ),
          ),

          /*
           * 챗봇 뒤 배경
           *
           * 채팅창이 커질수록 blur도 같이 강해짐.
           */
          if (_isChatbotOpen)
            Positioned.fill(
              child: AnimatedBuilder(
                animation: _chatbotController,
                builder: (
                  context,
                  child,
                ) {
                  final value =
                      _chatbotController.value;

                  return GestureDetector(
                    behavior:
                        HitTestBehavior.opaque,
                    onTap: _closeChatbot,
                    child: BackdropFilter(
                      filter: ImageFilter.blur(
                        sigmaX: 5 * value,
                        sigmaY: 5 * value,
                      ),
                      child: Container(
                        color: Colors.black.withValues(
                          alpha:
                              0.10 * value,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),

          /*
           * 챗봇 창
           *
           * Alignment.bottomRight가 핵심.
           * FAB 방향에서 왼쪽 위로 커져 보임.
           */
          if (_isChatbotOpen)
            Positioned(
              left: 16,
              right: 16,
              top: 24,

              // FAB와 입력창이 붙지 않도록 여백 확보
              bottom: 100,

              child: FadeTransition(
                opacity: _chatbotOpacity,
                child: ScaleTransition(
                  scale: _chatbotScale,

                  // 오른쪽 아래에서 시작
                  alignment:
                      Alignment.bottomRight,

                  child: Material(
                    elevation: 20,
                    borderRadius:
                        BorderRadius.circular(
                      26,
                    ),
                    clipBehavior:
                        Clip.antiAlias,
                    child: DecoratedBox(
                      decoration:
                          BoxDecoration(
                        color:
                            Theme.of(context)
                                .colorScheme
                                .surface,
                        borderRadius:
                            BorderRadius.circular(
                          26,
                        ),
                      ),
                      child:
                          const ChatbotScreen(),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),

      /*
       * 챗봇 버튼
       *
       * 열렸을 때:
       * 챗봇 아이콘 → X
       * 아이콘 자체도 살짝 회전하며 전환
       */
      floatingActionButton:
          FloatingActionButton(
        onPressed: _toggleChatbot,
        child: AnimatedSwitcher(
          duration: const Duration(
            milliseconds: 220,
          ),
          transitionBuilder: (
            child,
            animation,
          ) {
            return RotationTransition(
              turns: Tween<double>(
                begin: 0.75,
                end: 1,
              ).animate(
                animation,
              ),
              child: ScaleTransition(
                scale: animation,
                child: child,
              ),
            );
          },
          child: Icon(
            _isChatbotOpen
                ? Icons.close_rounded
                : Icons.smart_toy_outlined,
            key: ValueKey(
              _isChatbotOpen,
            ),
          ),
        ),
      ),

      floatingActionButtonLocation:
          FloatingActionButtonLocation.endFloat,

      /*
       * 챗봇 열리면 하단 탭 숨김
       */
      bottomNavigationBar:
          _isChatbotOpen
              ? null
              : BottomNav(
                  currentIndex:
                      _selectedIndex,
                  onTap:
                      _onTabChanged,
                ),
    );
  }
}