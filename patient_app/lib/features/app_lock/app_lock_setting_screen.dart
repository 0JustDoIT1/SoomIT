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
  static const Color _background = Color(0xFFF4F7FB);
  static const Color _surface = Colors.white;
  static const Color _primary = Color(0xFF2F80ED);
  static const Color _navy = Color(0xFF172033);
  static const Color _text = Color(0xFF2A3748);
  static const Color _muted = Color(0xFF7D8A9C);
  static const Color _border = Color(0xFFE3EBF3);
  static const Color _divider = Color(0xFFEEF3F7);

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

    final wasPinEnabled = _pinEnabled;

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

      _showMessage(wasPinEnabled ? '앱 잠금 PIN이 변경되었습니다.' : '앱 잠금 PIN이 등록되었습니다.');
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
      backgroundColor: _background,
      appBar: AppBar(
        title: const Text(
          '앱 잠금',
          style: TextStyle(
            color: _navy,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF27364B),
        surfaceTintColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, color: Color(0xFFE8EEF4)),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _primary))
          : ListView(
              physics: const BouncingScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 32),
              children: [
                _buildStatusCard(),

                const SizedBox(height: 24),

                _buildSectionHeader(
                  title: 'PIN 잠금',
                  subtitle: '숫자 6자리 PIN으로 앱을 보호해요.',
                ),

                const SizedBox(height: 10),

                _buildSectionCard(
                  children: [
                    _buildActionItem(
                      icon: Icons.pin_outlined,
                      iconColor: _primary,
                      iconBackground: const Color(0xFFEAF4FF),
                      title: _pinEnabled ? 'PIN 변경' : 'PIN 등록',
                      subtitle: _pinEnabled
                          ? '숫자 6자리 PIN이 설정되어 있어요.'
                          : '앱 잠금에 사용할 숫자 6자리를 등록해요.',
                      trailing: _processing
                          ? const _SmallProgressIndicator()
                          : const Icon(
                              Icons.chevron_right_rounded,
                              color: Color(0xFFB0BAC6),
                              size: 21,
                            ),
                      enabled: !_processing,
                      onTap: _setOrChangePin,
                    ),

                    if (_pinEnabled) ...[
                      _buildDivider(),
                      _buildActionItem(
                        icon: Icons.lock_open_rounded,
                        iconColor: const Color(0xFFD95460),
                        iconBackground: const Color(0xFFFFF0F1),
                        title: '앱 잠금 해제',
                        subtitle: '등록된 PIN과 생체인증 설정을 해제해요.',
                        titleColor: const Color(0xFFD95460),
                        enabled: !_processing,
                        onTap: _disableAppLock,
                      ),
                    ],
                  ],
                ),

                const SizedBox(height: 24),

                _buildSectionHeader(
                  title: '생체인증',
                  subtitle: 'PIN 대신 지문으로 빠르게 잠금을 해제할 수 있어요.',
                ),

                const SizedBox(height: 10),

                _buildSectionCard(children: [_buildBiometricItem()]),

                const SizedBox(height: 16),

                _buildSecurityNotice(),
              ],
            ),
    );
  }

  Widget _buildStatusCard() {
    final lockEnabled = _pinEnabled;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFFF0F7FF),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFD8EAFB)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFDCEAF7)),
            ),
            child: Icon(
              lockEnabled ? Icons.lock_rounded : Icons.lock_outline_rounded,
              color: _primary,
              size: 23,
            ),
          ),

          const SizedBox(width: 13),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  lockEnabled ? '앱 잠금이 설정되어 있어요' : '앱 잠금이 꺼져 있어요',
                  style: const TextStyle(
                    color: _navy,
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),

                const SizedBox(height: 5),

                Text(
                  lockEnabled
                      ? '진료 기록과 건강 정보를 PIN으로 보호하고 있어요.'
                      : 'PIN을 등록하면 진료 기록과 건강 정보를 안전하게 보호할 수 있어요.',
                  style: const TextStyle(
                    color: Color(0xFF71829A),
                    fontSize: 11.5,
                    height: 1.5,
                    fontWeight: FontWeight.w500,
                  ),
                ),

                if (_pinEnabled) ...[
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 7,
                    runSpacing: 7,
                    children: [
                      const _StatusChip(
                        label: 'PIN 사용 중',
                        icon: Icons.check_rounded,
                      ),
                      if (_biometricEnabled)
                        const _StatusChip(
                          label: '지문 사용 중',
                          icon: Icons.fingerprint_rounded,
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader({required String title, String? subtitle}) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: _navy,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: const TextStyle(
                color: Color(0xFF91A0B2),
                fontSize: 11.5,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSectionCard({required List<Widget> children}) {
    return Container(
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _border),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF6F8EAE).withValues(alpha: 0.045),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(children: children),
    );
  }

  Widget _buildActionItem({
    required IconData icon,
    required Color iconColor,
    required Color iconBackground,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
    bool enabled = true,
    Color titleColor = _text,
    Widget? trailing,
  }) {
    return InkWell(
      onTap: enabled ? onTap : null,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 13, 14),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: iconBackground,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: iconColor, size: 21),
            ),

            const SizedBox(width: 12),

            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: enabled
                          ? titleColor
                          : titleColor.withValues(alpha: 0.45),
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: TextStyle(
                      color: enabled
                          ? const Color(0xFF929EAC)
                          : const Color(0xFFC0C8D1),
                      fontSize: 11.5,
                      height: 1.35,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),

            if (trailing != null) ...[const SizedBox(width: 10), trailing],
          ],
        ),
      ),
    );
  }

  Widget _buildBiometricItem() {
    final canUseBiometric = _pinEnabled && _biometricAvailable && !_processing;

    String subtitle;

    if (!_pinEnabled) {
      subtitle = '생체인증을 사용하려면 먼저 PIN을 등록해주세요.';
    } else if (!_biometricAvailable) {
      subtitle = '기기에 등록된 지문이 없거나 생체인증을 사용할 수 없어요.';
    } else {
      subtitle = 'PIN 대신 지문으로 빠르게 잠금을 해제해요.';
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 14, 13, 14),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: const Color(0xFFEDF4FA),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              Icons.fingerprint_rounded,
              color: canUseBiometric
                  ? const Color(0xFF426F9E)
                  : const Color(0xFF9CAAB8),
              size: 22,
            ),
          ),

          const SizedBox(width: 12),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '지문으로 잠금 해제',
                  style: TextStyle(
                    color: canUseBiometric || _biometricEnabled
                        ? _text
                        : const Color(0xFF8F9BA8),
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: const TextStyle(
                    color: Color(0xFF929EAC),
                    fontSize: 11.5,
                    height: 1.35,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(width: 8),

          if (_processing)
            const _SmallProgressIndicator()
          else
            Switch(
              value: _biometricEnabled,
              onChanged: canUseBiometric ? _changeBiometricSetting : null,
              activeTrackColor: _primary,
              activeThumbColor: Colors.white,
              inactiveTrackColor: const Color(0xFFE0E6ED),
              inactiveThumbColor: Colors.white,
              trackOutlineColor: const WidgetStatePropertyAll<Color>(
                Colors.transparent,
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildSecurityNotice() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE5ECF3)),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.shield_outlined, size: 18, color: Color(0xFF6B7F95)),
          SizedBox(width: 9),
          Expanded(
            child: Text(
              'PIN은 다른 사람에게 알려주지 마세요. '
              '생체인증 사용 가능 여부는 기기 설정에 따라 달라질 수 있어요.',
              style: TextStyle(color: _muted, fontSize: 11.5, height: 1.5),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDivider() {
    return const Divider(height: 1, indent: 66, endIndent: 14, color: _divider);
  }
}

class _StatusChip extends StatelessWidget {
  final String label;
  final IconData icon;

  const _StatusChip({required this.label, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0xFFD7E7F6)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: const Color(0xFF2F80ED)),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
              color: Color(0xFF2F80ED),
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _SmallProgressIndicator extends StatelessWidget {
  const _SmallProgressIndicator();

  @override
  Widget build(BuildContext context) {
    return const SizedBox(
      width: 23,
      height: 23,
      child: Padding(
        padding: EdgeInsets.all(3),
        child: CircularProgressIndicator(
          strokeWidth: 2,
          color: Color(0xFF2F80ED),
        ),
      ),
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
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      titlePadding: const EdgeInsets.fromLTRB(22, 22, 22, 0),
      contentPadding: const EdgeInsets.fromLTRB(22, 12, 22, 0),
      actionsPadding: const EdgeInsets.fromLTRB(14, 8, 14, 14),
      title: Text(
        widget.title,
        style: const TextStyle(
          color: Color(0xFF172033),
          fontSize: 18,
          fontWeight: FontWeight.w800,
        ),
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.description,
            style: const TextStyle(
              color: Color(0xFF7D8A9C),
              fontSize: 12.5,
              height: 1.5,
            ),
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
              color: Color(0xFF172033),
              fontSize: 22,
              letterSpacing: 8,
              fontWeight: FontWeight.w800,
            ),
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(6),
            ],
            decoration: InputDecoration(
              hintText: '••••••',
              counterText: '',
              filled: true,
              fillColor: const Color(0xFFF7F9FC),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 14,
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Color(0xFFE1E8F0)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(
                  color: Color(0xFF2F80ED),
                  width: 1.5,
                ),
              ),
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
                  color: const Color(0xFF8290A3),
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
          style: TextButton.styleFrom(foregroundColor: const Color(0xFF718096)),
          child: const Text(
            '취소',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
        FilledButton(
          onPressed: _controller.text.length == 6 ? _submit : null,
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF2F80ED),
            disabledBackgroundColor: const Color(0xFFD9E2EC),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          child: const Text(
            '확인',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
      ],
    );
  }
}
