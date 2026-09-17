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
            backgroundColor: Color(0xFFF9F8FC),
            body: Center(
              child: CircularProgressIndicator(color: Color(0xFF6D4FB3)),
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
