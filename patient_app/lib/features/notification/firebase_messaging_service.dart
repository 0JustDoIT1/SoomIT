import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'device_token_service.dart';

import '../../firebase_options.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

  debugPrint('백그라운드 FCM 수신: ${message.messageId}');
}

class FirebaseMessagingService {
  FirebaseMessagingService._();

  static final FirebaseMessagingService instance = FirebaseMessagingService._();

  static const AndroidNotificationChannel _channel = AndroidNotificationChannel(
    'soomit_high_importance_channel',
    '숨-잇 주요 알림',
    description: '예약, 검사 결과, 복약 등 주요 알림을 제공합니다.',
    importance: Importance.max,
  );

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;

  final DeviceTokenService _deviceTokenService = DeviceTokenService();

  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  StreamSubscription<String>? _tokenRefreshSubscription;
  StreamSubscription<RemoteMessage>? _foregroundMessageSubscription;

  bool _initialized = false;

  Future<void> initialize() async {
    if (_initialized) return;

    _initialized = true;

    await _initializeLocalNotifications();

    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    debugPrint('알림 권한 상태: ${settings.authorizationStatus}');

    final isAllowed =
        settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;

    if (!isAllowed) return;

    await registerCurrentToken();

    _tokenRefreshSubscription = _messaging.onTokenRefresh.listen((
      newToken,
    ) async {
      debugPrint('FCM 토큰이 갱신되었습니다.');

      await _deviceTokenService.registerToken(newToken);
    });

    _foregroundMessageSubscription = FirebaseMessaging.onMessage.listen((
      message,
    ) async {
      debugPrint('포그라운드 FCM 수신: ${message.messageId}');
      debugPrint('알림 제목: ${message.notification?.title}');
      debugPrint('알림 내용: ${message.notification?.body}');

      await _showForegroundNotification(message);
    });
  }

  Future<void> registerCurrentToken() async {
    final token = await _messaging.getToken();

    debugPrint('FCM 토큰 발급 여부: ${token != null}');

    if (token == null || token.isEmpty) return;

    await _deviceTokenService.registerToken(token);
  }

  Future<void> deactivateCurrentToken() async {
    final token = await _messaging.getToken();

    if (token == null || token.isEmpty) return;

    await _deviceTokenService.deactivateToken(token);
  }

  Future<void> _initializeLocalNotifications() async {
    const initializationSettings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
    );

    await _localNotifications.initialize(settings: initializationSettings);

    await _localNotifications
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.createNotificationChannel(_channel);
  }

  Future<void> _showForegroundNotification(RemoteMessage message) async {
    final notification = message.notification;

    if (notification == null) return;

    const notificationDetails = NotificationDetails(
      android: AndroidNotificationDetails(
        'soomit_high_importance_channel',
        '숨-잇 주요 알림',
        channelDescription: '예약, 검사 결과, 복약 등 주요 알림을 제공합니다.',
        importance: Importance.max,
        priority: Priority.high,
        icon: '@mipmap/ic_launcher',
      ),
    );

    await _localNotifications.show(
      id: message.messageId?.hashCode ?? message.hashCode,
      title: notification.title ?? '숨-잇',
      body: notification.body ?? '',
      notificationDetails: notificationDetails,
      payload: message.data.toString(),
    );
  }

  Future<void> dispose() async {
    await _tokenRefreshSubscription?.cancel();
    await _foregroundMessageSubscription?.cancel();

    _initialized = false;
  }
}
