import 'package:flutter/material.dart';



import '../../core/settings/font_scale_controller.dart';



class FontSizeSettingScreen extends StatefulWidget {

  const FontSizeSettingScreen({super.key});

  @override
  State<FontSizeSettingScreen> createState() => _FontSizeSettingScreenState();
}

class _FontSizeSettingScreenState extends State<FontSizeSettingScreen> {



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

  static const Color _lightSoftBlue = Color(0xFFEAF4FF);
  Color get _softBlue => _isDark ? Color(0xFF1A3147) : _lightSoftBlue;



  @override

  Widget build(BuildContext context) {

    return Scaffold(

      backgroundColor: _background,

      appBar: AppBar(

        title: Text(

          '글자 크기',

          style: TextStyle(

            color: _navy,

            fontSize: 18,

            fontWeight: FontWeight.w800,

          ),

        ),

        backgroundColor: _surface,

        foregroundColor: Color(0xFF27364B),

        surfaceTintColor: _surface,

        elevation: 0,

        scrolledUnderElevation: 0,

        centerTitle: false,

        bottom: PreferredSize(

          preferredSize: Size.fromHeight(1),

          child: Divider(height: 1, color: Color(0xFFE8EEF4)),

        ),

      ),

      body: ValueListenableBuilder<AppFontSize>(

        valueListenable: fontScaleController,

        builder: (context, selectedSize, child) {

          return ListView(

            physics: BouncingScrollPhysics(),

            padding: const EdgeInsets.fromLTRB(18, 18, 18, 32),

            children: [

              _buildIntroCard(selectedSize),



              SizedBox(height: 24),



              _buildSectionHeader(

                title: '글자 크기 선택',

                subtitle: '보기 편한 크기를 선택해주세요.',

              ),



              SizedBox(height: 10),



              _buildSizeSelector(selectedSize),



              SizedBox(height: 24),



              _buildSectionHeader(

                title: '미리보기',

                subtitle: '선택한 크기가 앱에 어떻게 보이는지 확인해보세요.',

              ),



              SizedBox(height: 10),



              _buildPreviewCard(),



              SizedBox(height: 16),



              _buildGuide(),

            ],

          );

        },

      ),

    );

  }



  Widget _buildIntroCard(AppFontSize selectedSize) {

    return Container(

      width: double.infinity,

      padding: const EdgeInsets.all(18),

      decoration: BoxDecoration(

        color: _isDark ? Color(0xFF14283A) : Color(0xFFF0F7FF),

        borderRadius: BorderRadius.circular(20),

        border: Border.all(color: Color(0xFFD8EAFB)),

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

              border: Border.all(color: Color(0xFFDCEAF7)),

            ),

            child: Icon(

              Icons.text_fields_rounded,

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

                  '편한 크기로 읽어보세요',

                  style: TextStyle(

                    color: _navy,

                    fontSize: 15,

                    fontWeight: FontWeight.w800,

                  ),

                ),

                SizedBox(height: 5),

                Text(

                  '선택한 글자 크기는 앱 전체 화면에 바로 적용돼요.',

                  style: TextStyle(

                    color: Color(0xFF71829A),

                    fontSize: 11.5,

                    height: 1.5,

                    fontWeight: FontWeight.w500,

                  ),

                ),

                SizedBox(height: 10),

                Container(

                  padding: const EdgeInsets.symmetric(

                    horizontal: 10,

                    vertical: 6,

                  ),

                  decoration: BoxDecoration(

                    color: Colors.white,

                    borderRadius: BorderRadius.circular(999),

                    border: Border.all(color: Color(0xFFDCEAF7)),

                  ),

                  child: Text(

                    '현재 ${_labelFor(selectedSize)}',

                    style: TextStyle(

                      color: _primary,

                      fontSize: 11,

                      fontWeight: FontWeight.w800,

                    ),

                  ),

                ),

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



  Widget _buildSizeSelector(AppFontSize selectedSize) {

    return Container(

      padding: const EdgeInsets.all(7),

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

      child: Row(

        children: [

          Expanded(

            child: _buildSizeButton(

              size: AppFontSize.small,

              label: '작게',

              symbolSize: 17,

              selected: selectedSize == AppFontSize.small,

            ),

          ),

          SizedBox(width: 7),

          Expanded(

            child: _buildSizeButton(

              size: AppFontSize.normal,

              label: '기본',

              symbolSize: 21,

              selected: selectedSize == AppFontSize.normal,

            ),

          ),

          SizedBox(width: 7),

          Expanded(

            child: _buildSizeButton(

              size: AppFontSize.large,

              label: '크게',

              symbolSize: 25,

              selected: selectedSize == AppFontSize.large,

            ),

          ),

        ],

      ),

    );

  }



  Widget _buildSizeButton({

    required AppFontSize size,

    required String label,

    required double symbolSize,

    required bool selected,

  }) {

    return InkWell(

      onTap: () {

        fontScaleController.change(size);

      },

      borderRadius: BorderRadius.circular(15),

      child: AnimatedContainer(

        duration: Duration(milliseconds: 180),

        curve: Curves.easeOut,

        height: 104,

        decoration: BoxDecoration(

          color: selected ? _softBlue : Color(0xFFFAFBFD),

          borderRadius: BorderRadius.circular(15),

          border: Border.all(

            color: selected ? Color(0xFFB9DAFF) : Color(0xFFF0F3F7),

            width: selected ? 1.4 : 1,

          ),

        ),

        child: Stack(

          children: [

            Center(

              child: Column(

                mainAxisSize: MainAxisSize.min,

                children: [

                  Text(

                    '가',

                    style: TextStyle(

                      color: selected ? _primary : Color(0xFF59697C),

                      fontSize: symbolSize,

                      height: 1,

                      fontWeight: FontWeight.w800,

                    ),

                  ),

                  SizedBox(height: 10),

                  Text(

                    label,

                    style: TextStyle(

                      color: selected ? _primary : Color(0xFF718096),

                      fontSize: 12.5,

                      fontWeight: selected ? FontWeight.w800 : FontWeight.w600,

                    ),

                  ),

                ],

              ),

            ),

            Positioned(

              top: 8,

              right: 8,

              child: AnimatedOpacity(

                duration: Duration(milliseconds: 150),

                opacity: selected ? 1 : 0,

                child: Container(

                  width: 20,

                  height: 20,

                  decoration: BoxDecoration(

                    color: _primary,

                    shape: BoxShape.circle,

                  ),

                  child: Icon(

                    Icons.check_rounded,

                    color: Colors.white,

                    size: 14,

                  ),

                ),

              ),

            ),

          ],

        ),

      ),

    );

  }



  Widget _buildPreviewCard() {

    return Container(

      width: double.infinity,

      padding: const EdgeInsets.all(18),

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

      child: Column(

        crossAxisAlignment: CrossAxisAlignment.start,

        children: [

          Row(

            children: [

              Container(

                width: 42,

                height: 42,

                decoration: BoxDecoration(

                  color: _softBlue,

                  borderRadius: BorderRadius.circular(13),

                ),

                child: Icon(

                  Icons.favorite_outline_rounded,

                  color: _primary,

                  size: 22,

                ),

              ),

              SizedBox(width: 12),

              Expanded(

                child: Text(

                  '오늘의 건강관리',

                  style: TextStyle(

                    color: _navy,

                    fontSize: 17,

                    fontWeight: FontWeight.w800,

                  ),

                ),

              ),

            ],

          ),

          SizedBox(height: 18),

          Text(

            '숨-잇과 함께 건강을 관리해보세요.',

            style: TextStyle(

              color: _text,

              fontSize: 15,

              fontWeight: FontWeight.w700,

            ),

          ),

          SizedBox(height: 8),

          Text(

            '예약, 검사 일정, 복약 관리와 증상 기록을 '

            '한 곳에서 편하게 확인할 수 있어요.',

            style: TextStyle(

              color: _muted,

              fontSize: 13,

              height: 1.6,

              fontWeight: FontWeight.w500,

            ),

          ),

          SizedBox(height: 18),

          Container(

            width: double.infinity,

            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),

            decoration: BoxDecoration(

              color: _isDark ? Color(0xFF111A23) : Color(0xFFF7FAFD),

              borderRadius: BorderRadius.circular(14),

              border: Border.all(color: Color(0xFFE8EEF4)),

            ),

            child: Row(

              children: [

                Icon(

                  Icons.medication_outlined,

                  color: Color(0xFF4C7EAD),

                  size: 20,

                ),

                SizedBox(width: 10),

                Expanded(

                  child: Text(

                    '오늘 복약 일정을 확인해보세요.',

                    style: TextStyle(

                      color: Color(0xFF536579),

                      fontSize: 12.5,

                      fontWeight: FontWeight.w600,

                    ),

                  ),

                ),

                Icon(

                  Icons.chevron_right_rounded,

                  color: Color(0xFF9AA7B5),

                  size: 20,

                ),

              ],

            ),

          ),

        ],

      ),

    );

  }



  Widget _buildGuide() {

    return Container(

      width: double.infinity,

      padding: const EdgeInsets.all(14),

      decoration: BoxDecoration(

        color: _isDark ? Color(0xFF131D27) : Color(0xFFF8FAFC),

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

              '선택한 글자 크기는 앱 전체에 바로 적용되며, '

              '앱을 다시 실행해도 선택한 설정이 유지됩니다.',

              style: TextStyle(color: _muted, fontSize: 11.5, height: 1.5),

            ),

          ),

        ],

      ),

    );

  }



  String _labelFor(AppFontSize size) {

    switch (size) {

      case AppFontSize.small:

        return '작게';

      case AppFontSize.normal:

        return '기본';

      case AppFontSize.large:

        return '크게';

    }

  }

}
