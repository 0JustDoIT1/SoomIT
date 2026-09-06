import 'package:flutter/material.dart';

class AppLocalizations {
  final Locale locale;

  AppLocalizations(this.locale);

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(
      context,
      AppLocalizations,
    )!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  static final Map<String, Map<String, String>> _localizedValues = {
    'ko': {
      'home': '홈',
      'appointment': '예약',
      'examResult': '검사·결과',
      'medication': '복약',
      'mypage': '마이페이지',
      'languageSettings': '언어 설정',
      'korean': '한국어',
      'english': 'English',

      // 마이페이지
      'qrCode': 'QR 코드',
      'profileManagement': '프로필 관리',
      'notificationSettings': '알림 설정',
      'patientInfo': '환자 정보',
      'questionnaireHistory': '문진표 작성 내역',
      'settings': '설정',
      'logout': '로그아웃',
    },
    'en': {
      'home': 'Home',
      'appointment': 'Appointment',
      'examResult': 'Tests & Results',
      'medication': 'Medication',
      'mypage': 'My Page',
      'languageSettings': 'Language',
      'korean': '한국어',
      'english': 'English',

      // My Page
      'qrCode': 'QR Code',
      'profileManagement': 'Profile',
      'notificationSettings': 'Notifications',
      'patientInfo': 'Patient Information',
      'questionnaireHistory': 'Questionnaire History',
      'settings': 'Settings',
      'logout': 'Log Out',
    },
  };

  String _text(String key) {
    return _localizedValues[locale.languageCode]?[key] ??
        _localizedValues['ko']![key]!;
  }

  String get home => _text('home');
  String get appointment => _text('appointment');
  String get examResult => _text('examResult');
  String get medication => _text('medication');
  String get mypage => _text('mypage');
  String get languageSettings => _text('languageSettings');
  String get korean => _text('korean');
  String get english => _text('english');

  String get qrCode => _text('qrCode');
  String get profileManagement => _text('profileManagement');
  String get notificationSettings => _text('notificationSettings');
  String get patientInfo => _text('patientInfo');
  String get questionnaireHistory => _text('questionnaireHistory');
  String get settings => _text('settings');
  String get logout => _text('logout');
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) {
    return ['ko', 'en'].contains(locale.languageCode);
  }

  @override
  Future<AppLocalizations> load(Locale locale) async {
    return AppLocalizations(locale);
  }

  @override
  bool shouldReload(
    covariant LocalizationsDelegate<AppLocalizations> old,
  ) {
    return false;
  }
}