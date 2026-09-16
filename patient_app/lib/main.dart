import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'features/notification/firebase_messaging_service.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'features/auth/auth_gate.dart';
import 'firebase_options.dart';
import 'l10n/app_localizations.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

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
  Locale _locale = const Locale('ko');

  @override
  void initState() {
    super.initState();

    _loadSavedLanguage();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      FirebaseMessagingService.instance.initialize();
    });
  }

  Future<void> _loadSavedLanguage() async {
    final prefs = await SharedPreferences.getInstance();

    final savedLanguage = prefs.getString('language_code');

    if (savedLanguage == null || !mounted) return;

    setState(() {
      _locale = Locale(savedLanguage);
    });
  }

  Future<void> changeLanguage(String languageCode) async {
    final prefs = await SharedPreferences.getInstance();

    await prefs.setString('language_code', languageCode);

    if (!mounted) return;

    setState(() {
      _locale = Locale(languageCode);
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: '숨-잇',

      locale: _locale,

      supportedLocales: const [Locale('ko'), Locale('en')],

      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],

      home: const AuthGate(),
    );
  }
}
