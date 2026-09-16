import 'dart:async';

class NotificationNavigationService {
  NotificationNavigationService._();

  static final NotificationNavigationService instance =
      NotificationNavigationService._();

  final StreamController<int> _tabRequestController =
      StreamController<int>.broadcast();

  int? _pendingTabIndex;

  Stream<int> get tabRequests => _tabRequestController.stream;

  int consumeInitialTabIndex() {
    final tabIndex = _pendingTabIndex ?? 0;
    _pendingTabIndex = null;

    return tabIndex;
  }

  void handlePayload(Map<String, dynamic> payload) {
    final notificationType =
        (payload['notification_type'] ?? payload['type'] ?? '')
            .toString()
            .toUpperCase();

    final tabIndex = switch (notificationType) {
      'APPOINTMENT' => 1,
      'EXAMINATION' || 'RESULT' => 2,
      'MEDICATION' => 3,
      _ => 0,
    };

    _pendingTabIndex = tabIndex;
    _tabRequestController.add(tabIndex);
  }

  void consumePendingRequest() {
    _pendingTabIndex = null;
  }
}
