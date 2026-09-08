import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'l10n/app_localizations.dart';
import 'shared/app_shell.dart';

void main() {
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
  }

  Future<void> _loadSavedLanguage() async {
    final prefs = await SharedPreferences.getInstance();

    final savedLanguage = prefs.getString('language_code');

    if (savedLanguage == null) return;

    setState(() {
      _locale = Locale(savedLanguage);
    });
  }

  Future<void> changeLanguage(String languageCode) async {
    final prefs = await SharedPreferences.getInstance();

    await prefs.setString(
      'language_code',
      languageCode,
    );

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

      home: const AppShell(),
    );
  }
}