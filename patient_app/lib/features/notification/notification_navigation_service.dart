import 'dart:async';

class NotificationNavigationService {
  NotificationNavigationService._();

  static final NotificationNavigationService instance =
      NotificationNavigationService._();

  final StreamController<int> _tabRequestController =
      StreamController<int>.broadcast();

  int? _pendingTabIndex;

  Stream<int> get tabRequests =>
      _tabRequestController.stream;

  // =========================================================
  // 알림 / 홈 위젯 payload 처리
  // =========================================================

  void handlePayload(
    Map<String, dynamic> payload,
  ) {
    final notificationType =
        (
          payload['notification_type'] ??
              payload['type'] ??
              ''
        )
            .toString()
            .trim()
            .toUpperCase();

    final tabIndex =
        _resolveTabIndex(
      notificationType,
    );

    requestTab(tabIndex);
  }

  // =========================================================
  // 알림 종류 → 하단 탭 번호
  // =========================================================

  int _resolveTabIndex(
    String notificationType,
  ) {
    switch (notificationType) {
      // 예약
      case 'APPOINTMENT':
        return 1;

      // 검사 일정 / 검사 결과
      case 'EXAMINATION':
      case 'RESULT':
        return 2;

      // 복약
      case 'MEDICATION':
        return 3;

      // 기본 홈
      default:
        return 0;
    }
  }

  // =========================================================
  // 탭 이동 요청
  // =========================================================

  void requestTab(
    int tabIndex,
  ) {
    if (tabIndex < 0 ||
        tabIndex > 4) {
      return;
    }

    // 중요:
    // AppShell이 다시 생성되어도 같은 탭을 유지할 수 있도록
    // pending 값을 보관한다.
    _pendingTabIndex =
        tabIndex;

    _tabRequestController.add(
      tabIndex,
    );
  }

  // =========================================================
  // AppShell 최초 생성 시 사용할 탭
  // =========================================================

  int consumeInitialTabIndex() {
    // 중요:
    // 여기서 pending 값을 지우면 안 됨.
    //
    // 위젯 클릭 직후 AuthGate / AppShell이 다시 만들어질 경우
    // 두 번째 AppShell이 홈(0)으로 돌아가는 문제가 생길 수 있음.
    return _pendingTabIndex ?? 0;
  }

  // =========================================================
  // 현재 pending 요청 확인
  // =========================================================

  int? get pendingTabIndex =>
      _pendingTabIndex;

  // =========================================================
  // 외부 이동 요청 종료
  // =========================================================

  int? consumePendingRequest() {
    final tabIndex =
        _pendingTabIndex;

    _pendingTabIndex = null;

    return tabIndex;
  }

  // =========================================================
  // 필요 시 명시적으로 초기화
  // =========================================================

  void clearPendingRequest() {
    _pendingTabIndex = null;
  }

  void dispose() {
    _tabRequestController.close();
  }
}