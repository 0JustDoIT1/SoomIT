import 'package:flutter/material.dart';

import 'app_lock_screen.dart';
import 'services/app_lock_service.dart';

class AppLockGate extends StatefulWidget {
  final Widget child;

  const AppLockGate({super.key, required this.child});

  @override
  State<AppLockGate> createState() => _AppLockGateState();
}

class _AppLockGateState extends State<AppLockGate> with WidgetsBindingObserver {
  final AppLockService _appLockService = AppLockService.instance;

  bool _loading = true;
  bool _locked = false;
  bool _lockOnResume = false;

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addObserver(this);
    _initializeLock();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _initializeLock() async {
    final pinEnabled = await _appLockService.isPinEnabled();

    if (!mounted) return;

    setState(() {
      _locked = pinEnabled;
      _loading = false;
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden) {
      if (!_locked) {
        _lockOnResume = true;
      }

      return;
    }

    if (state == AppLifecycleState.resumed && _lockOnResume) {
      _lockOnResume = false;
      _lockIfEnabled();
    }
  }

  Future<void> _lockIfEnabled() async {
    final pinEnabled = await _appLockService.isPinEnabled();

    if (!mounted || !pinEnabled) return;

    setState(() {
      _locked = true;
    });
  }

  void _unlock() {
    if (!mounted) return;

    setState(() {
      _locked = false;
      _lockOnResume = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        backgroundColor: Color(0xFFF9F8FC),
        body: Center(
          child: CircularProgressIndicator(color: Color(0xFF6D4FB3)),
        ),
      );
    }

    if (_locked) {
      return AppLockScreen(onUnlocked: _unlock);
    }

    return widget.child;
  }
}
