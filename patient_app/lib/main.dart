import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:home_widget/home_widget.dart';
import 'package:kakao_flutter_sdk_user/kakao_flutter_sdk_user.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/settings/font_scale_controller.dart';
import 'features/auth/auth_gate.dart';
import 'features/notification/firebase_messaging_service.dart';
import 'features/notification/notification_navigation_service.dart';
import 'firebase_options.dart';
import 'l10n/app_localizations.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 카카오 SDK 초기화
  await KakaoSdk.init(
    nativeAppKey: '0a17fdd9b3ef886194a2c238393ddfc9',
  );

  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  FirebaseMessaging.onBackgroundMessage(
    firebaseMessagingBackgroundHandler,
  );

  // 저장된 글자 크기 설정 불러오기
  await fontScaleController.load();

  runApp(const MedicalApp());
}

class MedicalApp extends StatefulWidget {
  const MedicalApp({super.key});

  @override
  State<MedicalApp> createState() => MedicalAppState();

  static MedicalAppState? of(BuildContext context) {
    return context.findAncestorStateOfType<MedicalAppState>();
  }
}

class MedicalAppState extends State<MedicalApp> {
  static const String _languagePreferenceKey =
      'language_code';

  static const String _darkModePreferenceKey =
      'dark_mode_enabled';

  Locale _locale = const Locale('ko');

  ThemeMode _themeMode = ThemeMode.light;

  StreamSubscription<Uri?>? _homeWidgetClickSubscription;

  bool get isDarkMode =>
      _themeMode == ThemeMode.dark;

  @override
  void initState() {
    super.initState();

    _loadSavedLanguage();

    _loadSavedThemeMode();

    _initializeHomeWidgetNavigation();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      FirebaseMessagingService.instance.initialize();
    });
  }

  // =========================================================
  // 홈 위젯 클릭 처리
  // =========================================================

  Future<void> _initializeHomeWidgetNavigation() async {
    // 앱이 이미 실행 중이거나 백그라운드에 있을 때
    _homeWidgetClickSubscription =
        HomeWidget.widgetClicked.listen(
      _handleHomeWidgetClick,
    );

    // 앱이 완전히 종료된 상태에서 위젯을 눌러 실행했을 때
    final initialUri =
        await HomeWidget.initiallyLaunchedFromHomeWidget();

    if (initialUri != null) {
      _handleHomeWidgetClick(initialUri);
    }
  }

  void _handleHomeWidgetClick(Uri? uri) {
    if (uri == null) {
      return;
    }

    debugPrint(
      '홈 위젯 클릭 URI: $uri',
    );

    // MedicationWidgetProvider.kt에서
    // Uri.parse("soomit://medication") 전달
    if (uri.scheme == 'soomit' &&
        uri.host == 'medication') {
      NotificationNavigationService.instance.handlePayload(
        {
          'notification_type': 'MEDICATION',
        },
      );
    }
  }

  // =========================================================
  // 언어 설정
  // =========================================================

  Future<void> _loadSavedLanguage() async {
    final prefs =
        await SharedPreferences.getInstance();

    final savedLanguage =
        prefs.getString(
      _languagePreferenceKey,
    );

    if (savedLanguage == null || !mounted) {
      return;
    }

    setState(() {
      _locale =
          Locale(savedLanguage);
    });
  }

  Future<void> changeLanguage(
    String languageCode,
  ) async {
    // 화면을 먼저 바꿔서 즉시 반응
    if (mounted) {
      setState(() {
        _locale =
            Locale(languageCode);
      });
    }

    final prefs =
        await SharedPreferences.getInstance();

    await prefs.setString(
      _languagePreferenceKey,
      languageCode,
    );
  }

  // =========================================================
  // 다크모드 설정
  // =========================================================

  Future<void> _loadSavedThemeMode() async {
    final prefs =
        await SharedPreferences.getInstance();

    final darkModeEnabled =
        prefs.getBool(
          _darkModePreferenceKey,
        ) ??
        false;

    if (!mounted) {
      return;
    }

    setState(() {
      _themeMode =
          darkModeEnabled
              ? ThemeMode.dark
              : ThemeMode.light;
    });
  }

  Future<void> changeDarkMode(
    bool enabled,
  ) async {
    // 화면부터 즉시 변경
    if (mounted) {
      setState(() {
        _themeMode =
            enabled
                ? ThemeMode.dark
                : ThemeMode.light;
      });
    }

    final prefs =
        await SharedPreferences.getInstance();

    await prefs.setBool(
      _darkModePreferenceKey,
      enabled,
    );
  }

  // =========================================================
  // 라이트 테마
  // =========================================================

  ThemeData _buildLightTheme() {
    const primary =
        Color(0xFF2F80ED);

    final colorScheme =
        ColorScheme.fromSeed(
      seedColor: primary,
      brightness:
          Brightness.light,
    );

    return ThemeData(
      useMaterial3: true,
      brightness:
          Brightness.light,
      colorScheme: colorScheme,
      scaffoldBackgroundColor:
          const Color(
        0xFFF4F7FB,
      ),
      appBarTheme:
          const AppBarTheme(
        backgroundColor:
            Colors.white,
        foregroundColor:
            Color(
          0xFF172033,
        ),
        surfaceTintColor:
            Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
      ),
      dividerColor:
          const Color(
        0xFFE8EEF4,
      ),
    );
  }

  // =========================================================
  // 다크 테마
  // =========================================================

  ThemeData _buildDarkTheme() {
    const primary =
        Color(0xFF6EADFF);

    final colorScheme =
        ColorScheme.fromSeed(
      seedColor: primary,
      brightness:
          Brightness.dark,
    ).copyWith(
      surface:
          const Color(
        0xFF17212B,
      ),
    );

    return ThemeData(
      useMaterial3: true,
      brightness:
          Brightness.dark,
      colorScheme: colorScheme,
      scaffoldBackgroundColor:
          const Color(
        0xFF101820,
      ),
      appBarTheme:
          const AppBarTheme(
        backgroundColor:
            Color(
          0xFF17212B,
        ),
        foregroundColor:
            Color(
          0xFFF5F7FA,
        ),
        surfaceTintColor:
            Color(
          0xFF17212B,
        ),
        elevation: 0,
        scrolledUnderElevation: 0,
      ),
      dividerColor:
          const Color(
        0xFF2A3948,
      ),
    );
  }

  // =========================================================
  // 종료
  // =========================================================

  @override
  void dispose() {
    _homeWidgetClickSubscription?.cancel();

    super.dispose();
  }

  // =========================================================
  // 앱
  // =========================================================

  @override
  Widget build(
    BuildContext context,
  ) {
    return ValueListenableBuilder<
        AppFontSize>(
      valueListenable:
          fontScaleController,

      builder: (
        context,
        fontSize,
        child,
      ) {
        return MaterialApp(
          debugShowCheckedModeBanner:
              false,

          title: '숨-잇',

          locale: _locale,

          supportedLocales:
              const [
            Locale('ko'),
            Locale('en'),
          ],

          localizationsDelegates:
              const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations
                .delegate,
            GlobalWidgetsLocalizations
                .delegate,
            GlobalCupertinoLocalizations
                .delegate,
          ],

          theme:
              _buildLightTheme(),

          darkTheme:
              _buildDarkTheme(),

          themeMode:
              _themeMode,

          // 앱 전체 글자 크기 적용
          builder: (
            context,
            child,
          ) {
            final mediaQuery =
                MediaQuery.of(
              context,
            );

            return MediaQuery(
              data:
                  mediaQuery.copyWith(
                textScaler:
                    TextScaler.linear(
                  fontScaleController
                      .scale,
                ),
              ),
              child:
                  child ??
                  const SizedBox
                      .shrink(),
            );
          },

          home:
              const AuthGate(),
        );
      },
    );
  }
}