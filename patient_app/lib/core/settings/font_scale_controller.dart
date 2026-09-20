import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum AppFontSize { small, normal, large }

class FontScaleController extends ValueNotifier<AppFontSize> {
  FontScaleController() : super(AppFontSize.normal);

  static const String _storageKey = 'font_size';

  double get scale {
    switch (value) {
      case AppFontSize.small:
        return 0.90;

      case AppFontSize.normal:
        return 1.00;

      case AppFontSize.large:
        return 1.15;
    }
  }

  String get label {
    switch (value) {
      case AppFontSize.small:
        return '작게';

      case AppFontSize.normal:
        return '기본';

      case AppFontSize.large:
        return '크게';
    }
  }

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();

    final saved = prefs.getString(_storageKey);

    switch (saved) {
      case 'small':
        value = AppFontSize.small;
        break;

      case 'large':
        value = AppFontSize.large;
        break;

      case 'normal':
      default:
        value = AppFontSize.normal;
        break;
    }
  }

  Future<void> change(AppFontSize fontSize) async {
    value = fontSize;

    final prefs = await SharedPreferences.getInstance();

    switch (fontSize) {
      case AppFontSize.small:
        await prefs.setString(_storageKey, 'small');
        break;

      case AppFontSize.normal:
        await prefs.setString(_storageKey, 'normal');
        break;

      case AppFontSize.large:
        await prefs.setString(_storageKey, 'large');
        break;
    }
  }
}

final FontScaleController fontScaleController = FontScaleController();
