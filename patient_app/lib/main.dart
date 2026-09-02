import 'package:flutter/material.dart';

import 'shared/app_shell.dart';

void main() {
  runApp(const MedicalApp());
}

class MedicalApp extends StatelessWidget {
  const MedicalApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: '숨-잇',
      home: const AppShell(),
    );
  }
}