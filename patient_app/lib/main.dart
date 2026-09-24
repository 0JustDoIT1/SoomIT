import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/settings/font_scale_controller.dart';
import 'features/auth/auth_gate.dart';
import 'features/notification/firebase_messaging_service.dart';
import 'features/splash/splash_screen.dart';
import 'firebase_options.dart';
import 'l10n/app_localizations.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

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
  static const String _languagePreferenceKey = 'language_code';
  static const String _darkModePreferenceKey = 'dark_mode_enabled';

  Locale _locale = const Locale('ko');
  ThemeMode _themeMode = ThemeMode.light;

  bool get isDarkMode => _themeMode == ThemeMode.dark;

  @override
  void initState() {
    super.initState();

    _loadSavedLanguage();
    _loadSavedThemeMode();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      FirebaseMessagingService.instance.initialize();
    });
  }

  Future<void> _loadSavedLanguage() async {
    final prefs = await SharedPreferences.getInstance();
    final savedLanguage = prefs.getString(_languagePreferenceKey);

    if (savedLanguage == null || !mounted) {
      return;
    }

    setState(() {
      _locale = Locale(savedLanguage);
    });
  }

  Future<void> changeLanguage(String languageCode) async {
    // 화면 언어를 먼저 바꿔 즉시 반응하도록 함.
    if (mounted) {
      setState(() {
        _locale = Locale(languageCode);
      });
    }

    // 저장은 화면 변경 뒤에 처리.
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _languagePreferenceKey,
      languageCode,
    );
  }

  Future<void> _loadSavedThemeMode() async {
    final prefs = await SharedPreferences.getInstance();
    final darkModeEnabled =
        prefs.getBool(_darkModePreferenceKey) ?? false;

    if (!mounted) {
      return;
    }

    setState(() {
      _themeMode = darkModeEnabled
          ? ThemeMode.dark
          : ThemeMode.light;
    });
  }

  Future<void> changeDarkMode(bool enabled) async {
    // SharedPreferences 저장을 기다리지 않고
    // 테마 상태부터 먼저 변경
    if (mounted) {
      setState(() {
        _themeMode = enabled
            ? ThemeMode.dark
            : ThemeMode.light;
      });
    }

    // 저장은 UI 변경 뒤에 처리.
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(
      _darkModePreferenceKey,
      enabled,
    );
  }

  ThemeData _buildLightTheme() {
    const primary = Color(0xFF2F80ED);

    final colorScheme = ColorScheme.fromSeed(
      seedColor: primary,
      brightness: Brightness.light,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: const Color(0xFFF4F7FB),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.white,
        foregroundColor: Color(0xFF172033),
        surfaceTintColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
      ),
      dividerColor: const Color(0xFFE8EEF4),
    );
  }

  ThemeData _buildDarkTheme() {
    const primary = Color(0xFF6EADFF);

    final colorScheme = ColorScheme.fromSeed(
      seedColor: primary,
      brightness: Brightness.dark,
    ).copyWith(
      surface: const Color(0xFF17212B),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: const Color(0xFF101820),
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xFF17212B),
        foregroundColor: Color(0xFFF5F7FA),
        surfaceTintColor: Color(0xFF17212B),
        elevation: 0,
        scrolledUnderElevation: 0,
      ),
      dividerColor: const Color(0xFF2A3948),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<AppFontSize>(
      valueListenable: fontScaleController,
      builder: (context, fontSize, child) {
        return MaterialApp(
          debugShowCheckedModeBanner: false,
          title: '숨-잇',

          locale: _locale,

          supportedLocales: const [
            Locale('ko'),
            Locale('en'),
          ],

          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],

          theme: _buildLightTheme(),
          darkTheme: _buildDarkTheme(),
          themeMode: _themeMode,

          // 앱 전체 글자 크기 적용
          builder: (context, child) {
            final mediaQuery = MediaQuery.of(context);

            return MediaQuery(
              data: mediaQuery.copyWith(
                textScaler: TextScaler.linear(
                  fontScaleController.scale,
                ),
              ),
              child: child ?? const SizedBox.shrink(),
            );
          },

          // 기존 AuthGate 대신 SplashEntry
          home: const SplashEntry(),
        );
      },
    );
  }
}

// ============================================================
// Splash → AuthGate 연결
// ============================================================

class SplashEntry extends StatefulWidget {
  const SplashEntry({super.key});

  @override
  State<SplashEntry> createState() => _SplashEntryState();
}

class _SplashEntryState extends State<SplashEntry> {
  bool _showSplash = true;

  @override
  Widget build(BuildContext context) {
    if (_showSplash) {
      return SplashScreen(
        onFinished: () {
          if (!mounted) return;

          setState(() {
            _showSplash = false;
          });
        },
      );
    }

    // 스플래시가 끝나면
    // 기존 로그인/JWT 판별 구조로 이동
    return const AuthGate();
  }
}