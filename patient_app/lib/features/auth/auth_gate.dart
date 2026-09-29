import 'package:flutter/material.dart';

import '../../shared/app_shell.dart';
import '../app_lock/app_lock_gate.dart';
import 'login_screen.dart';
import 'services/patient_auth_service.dart';

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  final PatientAuthService _authService = PatientAuthService();

  late final Future<bool> _sessionFuture;

  @override
  void initState() {
    super.initState();

    _sessionFuture = _authService.refreshStoredSession();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<bool>(
      future: _sessionFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Scaffold(
            body: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0xFFF1FBF8),
                    Color(0xFFF3F9FC),
                    Color(0xFFEAF2F8),
                  ],
                  stops: [0.0, 0.52, 1.0],
                ),
              ),
              child: SizedBox.expand(),
            ),
          );
        }

        if (snapshot.data == true) {
          return const AppLockGate(child: AppShell());
        }

        return const LoginScreen();
      },
    );
  }
}
