import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'services/app_lock_service.dart';
import 'services/biometric_auth_service.dart';

class AppLockSettingScreen extends StatefulWidget {
  const AppLockSettingScreen({super.key});

  @override
  State<AppLockSettingScreen> createState() => _AppLockSettingScreenState();
}

class _AppLockSettingScreenState extends State<AppLockSettingScreen> {
  final AppLockService _appLockService = AppLockService.instance;

  final BiometricAuthService _biometricService = BiometricAuthService.instance;

  bool _loading = true;
  bool _pinEnabled = false;
  bool _biometricAvailable = false;
  bool _biometricEnabled = false;
  bool _processing = false;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final pinEnabled = await _appLockService.isPinEnabled();

    final biometricAvailable = await _biometricService.isAvailable();

    final biometricEnabled = await _appLockService.isBiometricEnabled();

    if (!mounted) return;

    setState(() {
      _pinEnabled = pinEnabled;
      _biometricAvailable = biometricAvailable;
      _biometricEnabled = pinEnabled && biometricAvailable && biometricEnabled;
      _loading = false;
    });
  }

  Future<String?> _requestPin({
    required String title,
    required String description,
  }) {
    return showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return _PinInputDialog(title: title, description: description);
      },
    );
  }

  Future<void> _setOrChangePin() async {
    if (_processing) return;

    setState(() {
      _processing = true;
    });

    try {
      if (_pinEnabled) {
        final currentPin = await _requestPin(
          title: '현재 PIN 확인',
          description: '현재 사용 중인 PIN 6자리를 입력해주세요.',
        );

        if (currentPin == null) return;

        final verified = await _appLockService.verifyPin(currentPin);

        if (!verified) {
          _showMessage('현재 PIN이 일치하지 않습니다.');
          return;
        }
      }

      if (!mounted) return;

      final newPin = await _requestPin(
        title: _pinEnabled ? '새 PIN 입력' : 'PIN 등록',
        description: '사용할 숫자 6자리를 입력해주세요.',
      );

      if (newPin == null) return;

      if (!mounted) return;

      final confirmedPin = await _requestPin(
        title: 'PIN 확인',
        description: '같은 PIN을 한 번 더 입력해주세요.',
      );

      if (confirmedPin == null) return;

      if (newPin != confirmedPin) {
        _showMessage('입력한 PIN이 서로 다릅니다.');
        return;
      }

      await _appLockService.savePin(newPin);

      if (!mounted) return;

      setState(() {
        _pinEnabled = true;
      });

      _showMessage(_pinEnabled ? '앱 잠금 PIN이 저장되었습니다.' : '앱 잠금 PIN이 등록되었습니다.');
    } finally {
      if (mounted) {
        setState(() {
          _processing = false;
        });
      }
    }
  }

  Future<void> _disableAppLock() async {
    if (!_pinEnabled || _processing) return;

    setState(() {
      _processing = true;
    });

    try {
      final currentPin = await _requestPin(
        title: '앱 잠금 해제',
        description: '앱 잠금을 끄려면 현재 PIN을 입력해주세요.',
      );

      if (currentPin == null) return;

      final verified = await _appLockService.verifyPin(currentPin);

      if (!verified) {
        _showMessage('현재 PIN이 일치하지 않습니다.');
        return;
      }

      await _appLockService.disableAppLock();

      if (!mounted) return;

      setState(() {
        _pinEnabled = false;
        _biometricEnabled = false;
      });

      _showMessage('앱 잠금이 해제되었습니다.');
    } finally {
      if (mounted) {
        setState(() {
          _processing = false;
        });
      }
    }
  }

  Future<void> _changeBiometricSetting(bool enabled) async {
    if (_processing) return;

    if (!_pinEnabled) {
      _showMessage('먼저 앱 잠금 PIN을 등록해주세요.');
      return;
    }

    if (!_biometricAvailable) {
      _showMessage('이 기기에 등록된 지문이 없거나 생체인증을 사용할 수 없습니다.');
      return;
    }

    setState(() {
      _processing = true;
    });

    try {
      if (enabled) {
        final authenticated = await _biometricService.authenticate();

        if (!authenticated) {
          _showMessage('지문 인증에 실패했습니다.');
          return;
        }
      }

      await _appLockService.setBiometricEnabled(enabled);

      if (!mounted) return;

      setState(() {
        _biometricEnabled = enabled;
      });

      _showMessage(enabled ? '지문 잠금 해제가 설정되었습니다.' : '지문 잠금 해제가 해제되었습니다.');
    } finally {
      if (mounted) {
        setState(() {
          _processing = false;
        });
      }
    }
  }

  void _showMessage(String message) {
    if (!mounted) return;

    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F6F9),
      appBar: AppBar(
        title: const Text('앱 잠금'),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0EBFF),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        Icons.lock_outline_rounded,
                        color: Color(0xFF6D4FB3),
                      ),
                      SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          '앱 잠금을 설정하면 진료 기록과 건강 정보를 PIN 또는 지문으로 보호할 수 있습니다.',
                          style: TextStyle(
                            fontSize: 14,
                            height: 1.5,
                            color: Color(0xFF4E5968),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                _buildSection(
                  title: 'PIN 잠금',
                  children: [
                    ListTile(
                      leading: const Icon(
                        Icons.pin_outlined,
                        color: Color(0xFF475569),
                      ),
                      title: Text(_pinEnabled ? 'PIN 변경' : 'PIN 등록'),
                      subtitle: Text(
                        _pinEnabled
                            ? '숫자 6자리 PIN이 설정되어 있습니다.'
                            : '앱 잠금에 사용할 숫자 6자리를 등록합니다.',
                      ),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      enabled: !_processing,
                      onTap: _setOrChangePin,
                    ),
                    if (_pinEnabled) ...[
                      const Divider(height: 1, indent: 56),
                      ListTile(
                        leading: const Icon(
                          Icons.lock_open_rounded,
                          color: Color(0xFFE5484D),
                        ),
                        title: const Text(
                          '앱 잠금 해제',
                          style: TextStyle(color: Color(0xFFE5484D)),
                        ),
                        enabled: !_processing,
                        onTap: _disableAppLock,
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 16),
                _buildSection(
                  title: '생체인증',
                  children: [
                    SwitchListTile(
                      secondary: const Icon(
                        Icons.fingerprint_rounded,
                        color: Color(0xFF475569),
                      ),
                      title: const Text('지문으로 잠금 해제'),
                      subtitle: Text(
                        !_biometricAvailable
                            ? '기기에 등록된 지문을 확인해주세요.'
                            : 'PIN 대신 지문으로 빠르게 잠금을 해제합니다.',
                      ),
                      value: _biometricEnabled,
                      onChanged:
                          _processing || !_pinEnabled || !_biometricAvailable
                          ? null
                          : _changeBiometricSetting,
                    ),
                  ],
                ),
              ],
            ),
    );
  }

  Widget _buildSection({
    required String title,
    required List<Widget> children,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Text(
            title,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Color(0xFF8B95A1),
            ),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFE5EAF0)),
          ),
          child: Column(children: children),
        ),
      ],
    );
  }
}

class _PinInputDialog extends StatefulWidget {
  final String title;
  final String description;

  const _PinInputDialog({required this.title, required this.description});

  @override
  State<_PinInputDialog> createState() => _PinInputDialogState();
}

class _PinInputDialogState extends State<_PinInputDialog> {
  final TextEditingController _controller = TextEditingController();

  bool _obscurePin = true;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    if (_controller.text.length != 6) {
      return;
    }

    Navigator.pop(context, _controller.text);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.description,
            style: const TextStyle(color: Color(0xFF6B7684)),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            autofocus: true,
            obscureText: _obscurePin,
            keyboardType: TextInputType.number,
            maxLength: 6,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 22,
              letterSpacing: 8,
              fontWeight: FontWeight.w700,
            ),
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(6),
            ],
            decoration: InputDecoration(
              hintText: '••••••',
              counterText: '',
              suffixIcon: IconButton(
                onPressed: () {
                  setState(() {
                    _obscurePin = !_obscurePin;
                  });
                },
                icon: Icon(
                  _obscurePin
                      ? Icons.visibility_off_outlined
                      : Icons.visibility_outlined,
                ),
              ),
            ),
            onChanged: (_) {
              setState(() {});
            },
            onSubmitted: (_) {
              _submit();
            },
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () {
            Navigator.pop(context);
          },
          child: const Text('취소'),
        ),
        FilledButton(
          onPressed: _controller.text.length == 6 ? _submit : null,
          child: const Text('확인'),
        ),
      ],
    );
  }
}
