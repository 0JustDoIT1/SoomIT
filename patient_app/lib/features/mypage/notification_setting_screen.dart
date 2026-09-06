import 'package:flutter/material.dart';

import 'models/notification_setting.dart';
import 'services/notification_setting_service.dart';

class NotificationSettingScreen extends StatefulWidget {
  const NotificationSettingScreen({super.key});

  @override
  State<NotificationSettingScreen> createState() =>
      _NotificationSettingScreenState();
}

class _NotificationSettingScreenState
    extends State<NotificationSettingScreen> {
  final NotificationSettingService _service =
      NotificationSettingService();

  bool _isLoading = true;
  String? _errorMessage;

  List<NotificationSetting> _settings = [];

  // 중복 클릭 방지용
  final Set<String> _updatingTypes = {};

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    try {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });

      final settings =
          await _service.getNotificationSettings();

      if (!mounted) return;

      setState(() {
        _settings = settings;
        _isLoading = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _isLoading = false;
        _errorMessage =
            '알림 설정을 불러오지 못했습니다.';
      });
    }
  }

  Future<void> _toggleSetting(
    NotificationSetting setting,
    bool value,
  ) async {
    if (_updatingTypes.contains(
      setting.notificationType,
    )) {
      return;
    }

    final index = _settings.indexWhere(
      (item) =>
          item.notificationType ==
          setting.notificationType,
    );

    if (index == -1) return;

    final previousSetting = _settings[index];

    // 화면에서는 바로 스위치 변경
    setState(() {
      _updatingTypes.add(
        setting.notificationType,
      );

      _settings[index] = NotificationSetting(
        notificationType:
            setting.notificationType,
        notificationTypeLabel:
            setting.notificationTypeLabel,
        enabled: value,
        updatedAt: setting.updatedAt,
      );
    });

    try {
      final updatedSetting =
          await _service.updateNotificationSetting(
        notificationType:
            setting.notificationType,
        enabled: value,
      );

      if (!mounted) return;

      // 서버에서 받은 최종 값으로 갱신
      setState(() {
        _settings[index] = updatedSetting;

        _updatingTypes.remove(
          setting.notificationType,
        );
      });
    } catch (_) {
      if (!mounted) return;

      // 실패하면 원래 상태로 되돌림
      setState(() {
        _settings[index] = previousSetting;

        _updatingTypes.remove(
          setting.notificationType,
        );
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            '알림 설정 변경에 실패했습니다.',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor:
          const Color(0xFFF4F6F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        centerTitle: true,
        title: const Text(
          '알림 설정',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: Color(0xFF191F28),
          ),
        ),
        leading: IconButton(
          icon: const Icon(
            Icons.arrow_back_ios_new_rounded,
            color: Color(0xFF191F28),
          ),
          onPressed: () {
            Navigator.pop(context);
          },
        ),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    if (_errorMessage != null) {
      return _buildErrorState();
    }

    if (_settings.isEmpty) {
      return const Center(
        child: Text(
          '알림 설정 정보가 없습니다.',
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.symmetric(
            horizontal: 16,
          ),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius:
                BorderRadius.circular(16),
          ),
          child: Column(
            children: [
              for (int i = 0;
                  i < _settings.length;
                  i++) ...[
                _buildSettingItem(
                  _settings[i],
                ),
                if (i !=
                    _settings.length - 1)
                  const Divider(
                    height: 1,
                    color:
                        Color(0xFFEEF1F5),
                  ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSettingItem(
    NotificationSetting setting,
  ) {
    final isUpdating =
        _updatingTypes.contains(
      setting.notificationType,
    );

    return SwitchListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(
        setting.notificationTypeLabel,
        style: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w600,
          color: Color(0xFF191F28),
        ),
      ),
      subtitle: Text(
        _getDescription(
          setting.notificationType,
        ),
        style: const TextStyle(
          fontSize: 12,
          color: Color(0xFF8B95A1),
        ),
      ),
      value: setting.enabled,

      // PATCH 처리 중이면 해당 스위치만 잠깐 비활성화
      onChanged: isUpdating
          ? null
          : (value) {
              _toggleSetting(
                setting,
                value,
              );
            },
    );
  }

  String _getDescription(
    String type,
  ) {
    switch (type) {
      case 'APPOINTMENT':
        return '예약 확정 및 변경 알림';

      case 'EXAMINATION':
        return '검사 일정 관련 알림';

      case 'RESULT':
        return '검사 결과 등록 알림';

      case 'MEDICATION':
        return '복약 시간 및 복약 관련 알림';

      case 'QUESTIONNAIRE':
        return '문진 작성 및 제출 관련 알림';

      case 'HEALTH':
        return '건강 관리 관련 알림';

      default:
        return '';
    }
  }

  Widget _buildErrorState() {
    return Center(
      child: Column(
        mainAxisSize:
            MainAxisSize.min,
        children: [
          Text(
            _errorMessage ??
                '알림 설정을 불러오지 못했습니다.',
            style: const TextStyle(
              color: Color(0xFF8B95A1),
            ),
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: _loadSettings,
            child: const Text(
              '다시 시도',
            ),
          ),
        ],
      ),
    );
  }
}