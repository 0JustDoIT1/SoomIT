import 'package:flutter/material.dart';

import '../../main.dart';
import '../../l10n/app_localizations.dart';

class LanguageSettingScreen extends StatefulWidget {
  const LanguageSettingScreen({super.key});

  @override
  State<LanguageSettingScreen> createState() =>
      _LanguageSettingScreenState();
}

class _LanguageSettingScreenState
    extends State<LanguageSettingScreen> {
  String? _selectedLanguage;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    _selectedLanguage ??=
        Localizations.localeOf(context).languageCode;
  }

  void _changeLanguage(String languageCode) {
    setState(() {
      _selectedLanguage = languageCode;
    });

    MedicalApp.of(context)?.changeLanguage(languageCode);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.languageSettings),
      ),
      body: RadioGroup<String>(
        groupValue: _selectedLanguage,
        onChanged: (value) {
          if (value == null) return;
          _changeLanguage(value);
        },
        child: ListView(
          children: [
            RadioListTile<String>(
              title: Text(l10n.korean),
              value: 'ko',
            ),
            RadioListTile<String>(
              title: Text(l10n.english),
              value: 'en',
            ),
          ],
        ),
      ),
    );
  }
}