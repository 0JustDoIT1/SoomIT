import 'package:flutter/material.dart';



import 'models/notification_setting.dart';

import 'services/notification_setting_service.dart';



class NotificationSettingScreen extends StatefulWidget {

  const NotificationSettingScreen({super.key});



  @override

  State<NotificationSettingScreen> createState() =>

      _NotificationSettingScreenState();

}



class _NotificationSettingScreenState extends State<NotificationSettingScreen> {

  static const Color _lightBackground = Color(0xFFF4F7FB);
  bool get _isDark => Theme.of(context).brightness == Brightness.dark;
  Color get _background => _isDark ? Color(0xFF101820) : _lightBackground;

  static const Color _lightSurface = Colors.white;
  Color get _surface => _isDark ? Color(0xFF17212B) : _lightSurface;

  static const Color _primary = Color(0xFF2F80ED);

  static const Color _lightNavy = Color(0xFF172033);
  Color get _navy => _isDark ? Color(0xFFF5F7FA) : _lightNavy;

  static const Color _lightText = Color(0xFF2A3748);
  Color get _text => _isDark ? Color(0xFFE8EDF3) : _lightText;

  static const Color _lightMuted = Color(0xFF7D8A9C);
  Color get _muted => _isDark ? Color(0xFF9EACBA) : _lightMuted;

  static const Color _lightBorder = Color(0xFFE3EBF3);
  Color get _border => _isDark ? Color(0xFF2A3948) : _lightBorder;

  static const Color _lightDivider = Color(0xFFEEF3F7);
  Color get _divider => _isDark ? Color(0xFF263543) : _lightDivider;



  final NotificationSettingService _service = NotificationSettingService();



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



      final settings = await _service.getNotificationSettings();



      if (!mounted) return;



      setState(() {

        _settings = settings;

        _isLoading = false;

      });

    } catch (_) {

      if (!mounted) return;



      setState(() {

        _isLoading = false;

        _errorMessage = '알림 설정을 불러오지 못했습니다.';

      });

    }

  }



  Future<void> _toggleSetting(NotificationSetting setting, bool value) async {

    if (_updatingTypes.contains(setting.notificationType)) {

      return;

    }



    final index = _settings.indexWhere(

      (item) => item.notificationType == setting.notificationType,

    );



    if (index == -1) return;



    final previousSetting = _settings[index];



    // 화면에서는 바로 스위치 변경

    setState(() {

      _updatingTypes.add(setting.notificationType);



      _settings[index] = NotificationSetting(

        notificationType: setting.notificationType,

        notificationTypeLabel: setting.notificationTypeLabel,

        enabled: value,

        updatedAt: setting.updatedAt,

      );

    });



    try {

      final updatedSetting = await _service.updateNotificationSetting(

        notificationType: setting.notificationType,

        enabled: value,

      );



      if (!mounted) return;



      // 서버에서 받은 최종 값으로 갱신

      setState(() {

        _settings[index] = updatedSetting;

        _updatingTypes.remove(setting.notificationType);

      });

    } catch (_) {

      if (!mounted) return;



      // 실패하면 원래 상태로 되돌림

      setState(() {

        _settings[index] = previousSetting;

        _updatingTypes.remove(setting.notificationType);

      });



      ScaffoldMessenger.of(

        context,

      ).showSnackBar(SnackBar(content: Text('알림 설정 변경에 실패했습니다.')));

    }

  }



  @override

  Widget build(BuildContext context) {

    return Scaffold(

      backgroundColor: _background,

      appBar: AppBar(

        backgroundColor: _surface,

        foregroundColor: Color(0xFF27364B),

        surfaceTintColor: _surface,

        elevation: 0,

        scrolledUnderElevation: 0,

        centerTitle: false,

        title: Text(

          '알림 설정',

          style: TextStyle(

            color: _navy,

            fontSize: 18,

            fontWeight: FontWeight.w800,

          ),

        ),

        bottom: PreferredSize(

          preferredSize: Size.fromHeight(1),

          child: Divider(height: 1, color: Color(0xFFE8EEF4)),

        ),

      ),

      body: _buildBody(),

    );

  }



  Widget _buildBody() {

    if (_isLoading) {

      return Center(child: CircularProgressIndicator(color: _primary));

    }



    if (_errorMessage != null) {

      return _buildErrorState();

    }



    if (_settings.isEmpty) {

      return _buildEmptyState();

    }



    final enabledCount = _settings.where((setting) => setting.enabled).length;



    return RefreshIndicator(

      color: _primary,

      onRefresh: _loadSettings,

      child: ListView(

        physics: AlwaysScrollableScrollPhysics(

          parent: BouncingScrollPhysics(),

        ),

        padding: const EdgeInsets.fromLTRB(18, 18, 18, 32),

        children: [

          _buildSummaryCard(

            enabledCount: enabledCount,

            totalCount: _settings.length,

          ),



          SizedBox(height: 24),



          _buildSectionHeader(

            title: '알림 항목',

            subtitle: '받고 싶은 알림만 선택해서 관리할 수 있어요.',

          ),



          SizedBox(height: 10),



          Container(

            decoration: BoxDecoration(

              color: _surface,

              borderRadius: BorderRadius.circular(20),

              border: Border.all(color: _border),

              boxShadow: [

                BoxShadow(

                  color: Color(0xFF6F8EAE).withValues(alpha: 0.045),

                  blurRadius: 16,

                  offset: Offset(0, 6),

                ),

              ],

            ),

            clipBehavior: Clip.antiAlias,

            child: Column(

              children: [

                for (int i = 0; i < _settings.length; i++) ...[

                  _buildSettingItem(_settings[i]),

                  if (i != _settings.length - 1) _buildDivider(),

                ],

              ],

            ),

          ),



          SizedBox(height: 16),



          _buildNoticeCard(),

        ],

      ),

    );

  }



  Widget _buildSummaryCard({

    required int enabledCount,

    required int totalCount,

  }) {

    final allEnabled = enabledCount == totalCount;



    return Container(

      width: double.infinity,

      padding: const EdgeInsets.all(18),

      decoration: BoxDecoration(

        color: _isDark ? Color(0xFF14283A) : Color(0xFFF0F7FF),

        borderRadius: BorderRadius.circular(20),

        border: Border.all(color: _isDark ? Color(0xFF27435A) : Color(0xFFD8EAFB)),

      ),

      child: Row(

        children: [

          Container(

            width: 46,

            height: 46,

            decoration: BoxDecoration(

              color: Colors.white,

              borderRadius: BorderRadius.circular(14),

              border: Border.all(color: Color(0xFFDCEAF7)),

            ),

            child: Icon(

              Icons.notifications_active_outlined,

              color: _primary,

              size: 24,

            ),

          ),



          SizedBox(width: 13),



          Expanded(

            child: Column(

              crossAxisAlignment: CrossAxisAlignment.start,

              children: [

                Text(

                  allEnabled ? '모든 알림을 받고 있어요' : '$enabledCount개의 알림을 받고 있어요',

                  style: TextStyle(

                    color: _navy,

                    fontSize: 15,

                    fontWeight: FontWeight.w800,

                  ),

                ),

                SizedBox(height: 5),

                Text(

                  allEnabled

                      ? '예약, 검사, 복약 등 주요 소식을 놓치지 않도록 알려드려요.'

                      : '필요한 알림은 아래에서 언제든 다시 켤 수 있어요.',

                  style: TextStyle(

                    color: Color(0xFF71829A),

                    fontSize: 11.5,

                    height: 1.5,

                    fontWeight: FontWeight.w500,

                  ),

                ),

              ],

            ),

          ),



          SizedBox(width: 10),



          Container(

            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),

            decoration: BoxDecoration(

              color: Colors.white,

              borderRadius: BorderRadius.circular(999),

              border: Border.all(color: Color(0xFFDCEAF7)),

            ),

            child: Text(

              '$enabledCount/$totalCount',

              style: TextStyle(

                color: _primary,

                fontSize: 12,

                fontWeight: FontWeight.w800,

              ),

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

            style: TextStyle(

              color: _navy,

              fontSize: 16,

              fontWeight: FontWeight.w800,

            ),

          ),

          if (subtitle != null) ...[

            SizedBox(height: 4),

            Text(

              subtitle,

              style: TextStyle(

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



  Widget _buildSettingItem(NotificationSetting setting) {

    final isUpdating = _updatingTypes.contains(setting.notificationType);



    final style = _getStyle(setting.notificationType);



    return Padding(

      padding: const EdgeInsets.fromLTRB(14, 13, 13, 13),

      child: Row(

        children: [

          Container(

            width: 40,

            height: 40,

            decoration: BoxDecoration(

              color: style.background,

              borderRadius: BorderRadius.circular(12),

            ),

            child: Icon(style.icon, color: style.color, size: 21),

          ),



          SizedBox(width: 12),



          Expanded(

            child: Column(

              crossAxisAlignment: CrossAxisAlignment.start,

              children: [

                Text(

                  setting.notificationTypeLabel,

                  style: TextStyle(

                    color: _text,

                    fontSize: 14,

                    fontWeight: FontWeight.w700,

                  ),

                ),



                SizedBox(height: 4),



                Text(

                  _getDescription(setting.notificationType),

                  style: TextStyle(

                    color: Color(0xFF929EAC),

                    fontSize: 11.5,

                    height: 1.35,

                    fontWeight: FontWeight.w500,

                  ),

                ),

              ],

            ),

          ),



          SizedBox(width: 10),



          if (isUpdating)

            SizedBox(

              width: 24,

              height: 24,

              child: Padding(

                padding: EdgeInsets.all(3),

                child: CircularProgressIndicator(

                  strokeWidth: 2,

                  color: _primary,

                ),

              ),

            )

          else

            Switch(

              value: setting.enabled,

              onChanged: (value) {

                _toggleSetting(setting, value);

              },

              activeTrackColor: _primary,

              activeThumbColor: Colors.white,

              inactiveTrackColor: Color(0xFFE0E6ED),

              inactiveThumbColor: Colors.white,

              trackOutlineColor: const WidgetStatePropertyAll<Color>(

                Colors.transparent,

              ),

            ),

        ],

      ),

    );

  }



  Widget _buildNoticeCard() {

    return Container(

      width: double.infinity,

      padding: const EdgeInsets.all(14),

      decoration: BoxDecoration(

        color: Color(0xFFF8FAFC),

        borderRadius: BorderRadius.circular(16),

        border: Border.all(color: Color(0xFFE5ECF3)),

      ),

      child: Row(

        crossAxisAlignment: CrossAxisAlignment.start,

        children: [

          Icon(Icons.info_outline_rounded, size: 18, color: Color(0xFF6B7F95)),

          SizedBox(width: 9),

          Expanded(

            child: Text(

              '기기의 알림 권한이 꺼져 있으면 앱에서 알림을 켜도 '

              '푸시 알림이 표시되지 않을 수 있어요.',

              style: TextStyle(color: _muted, fontSize: 11.5, height: 1.5),

            ),

          ),

        ],

      ),

    );

  }



  Widget _buildDivider() {

    return Divider(height: 1, indent: 66, endIndent: 14, color: _divider);

  }



  String _getDescription(String type) {

    switch (type) {

      case 'APPOINTMENT':

        return '예약 확정 및 변경 소식을 알려드려요.';



      case 'EXAMINATION':

        return '예정된 검사 일정과 관련 안내를 알려드려요.';



      case 'RESULT':

        return '새 검사 결과가 등록되면 알려드려요.';



      case 'MEDICATION':

        return '복약 시간과 복약 관련 알림을 보내드려요.';



      case 'QUESTIONNAIRE':

        return '문진 작성 및 제출 관련 안내를 알려드려요.';



      case 'HEALTH':

        return '건강 관리에 필요한 주요 안내를 알려드려요.';



      default:

        return '';

    }

  }



  _NotificationTypeStyle _getStyle(String type) {

    switch (type) {

      case 'APPOINTMENT':

        return _NotificationTypeStyle(

          icon: Icons.calendar_month_outlined,

          color: Color(0xFF2F80ED),

          background: Color(0xFFEAF4FF),

        );



      case 'EXAMINATION':

        return _NotificationTypeStyle(

          icon: Icons.event_available_outlined,

          color: Color(0xFF3F7DB8),

          background: Color(0xFFEDF5FB),

        );



      case 'RESULT':

        return _NotificationTypeStyle(

          icon: Icons.description_outlined,

          color: Color(0xFF3A78B8),

          background: Color(0xFFEDF5FB),

        );



      case 'MEDICATION':

        return _NotificationTypeStyle(

          icon: Icons.medication_outlined,

          color: Color(0xFF2F80ED),

          background: Color(0xFFEAF4FF),

        );



      case 'QUESTIONNAIRE':

        return _NotificationTypeStyle(

          icon: Icons.assignment_outlined,

          color: Color(0xFF4C789F),

          background: Color(0xFFF0F5F9),

        );



      case 'HEALTH':

        return _NotificationTypeStyle(

          icon: Icons.favorite_border_rounded,

          color: Color(0xFF397AA8),

          background: Color(0xFFEDF6FA),

        );



      default:

        return _NotificationTypeStyle(

          icon: Icons.notifications_none_rounded,

          color: Color(0xFF5C6F86),

          background: Color(0xFFF1F5F8),

        );

    }

  }



  Widget _buildEmptyState() {

    return RefreshIndicator(

      color: _primary,

      onRefresh: _loadSettings,

      child: ListView(

        physics: AlwaysScrollableScrollPhysics(),

        padding: const EdgeInsets.fromLTRB(24, 130, 24, 32),

        children: [

          Icon(

            Icons.notifications_off_outlined,

            size: 48,

            color: Color(0xFFA8B3C0),

          ),

          SizedBox(height: 14),

          Text(

            '알림 설정 정보가 없습니다.',

            textAlign: TextAlign.center,

            style: TextStyle(

              color: _navy,

              fontSize: 15,

              fontWeight: FontWeight.w700,

            ),

          ),

          SizedBox(height: 6),

          Text(

            '아래로 당겨 새로고침해보세요.',

            textAlign: TextAlign.center,

            style: TextStyle(color: _muted, fontSize: 12),

          ),

        ],

      ),

    );

  }



  Widget _buildErrorState() {

    return RefreshIndicator(

      color: _primary,

      onRefresh: _loadSettings,

      child: ListView(

        physics: AlwaysScrollableScrollPhysics(),

        padding: const EdgeInsets.fromLTRB(24, 125, 24, 32),

        children: [

          Icon(

            Icons.error_outline_rounded,

            size: 48,

            color: Color(0xFFA8B3C0),

          ),

          SizedBox(height: 14),

          Text(

            _errorMessage ?? '알림 설정을 불러오지 못했습니다.',

            textAlign: TextAlign.center,

            style: TextStyle(

              color: _navy,

              fontSize: 15,

              fontWeight: FontWeight.w700,

            ),

          ),

          SizedBox(height: 7),

          Text(

            '네트워크 상태를 확인한 뒤 다시 시도해주세요.',

            textAlign: TextAlign.center,

            style: TextStyle(color: _muted, fontSize: 12),

          ),

          SizedBox(height: 18),

          Center(

            child: OutlinedButton.icon(

              onPressed: _loadSettings,

              icon: Icon(Icons.refresh_rounded, size: 18),

              label: Text('다시 시도'),

              style: OutlinedButton.styleFrom(

                foregroundColor: _primary,

                side: BorderSide(color: Color(0xFFCFE2F7)),

                padding: const EdgeInsets.symmetric(

                  horizontal: 16,

                  vertical: 11,

                ),

                shape: RoundedRectangleBorder(

                  borderRadius: BorderRadius.circular(12),

                ),

              ),

            ),

          ),

        ],

      ),

    );

  }

}



class _NotificationTypeStyle {

  final IconData icon;

  final Color color;

  final Color background;



  _NotificationTypeStyle({

    required this.icon,

    required this.color,

    required this.background,

  });

}
