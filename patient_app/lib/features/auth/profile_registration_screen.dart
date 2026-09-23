import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:kpostal/kpostal.dart';

import 'models/patient_registration_data.dart';
import 'patient_link_screen.dart';

class ProfileRegistrationScreen extends StatefulWidget {
  final String registrationToken;
  final String? initialName;

  const ProfileRegistrationScreen({
    super.key,
    required this.registrationToken,
    this.initialName,
  });

  @override
  State<ProfileRegistrationScreen> createState() =>
      _ProfileRegistrationScreenState();
}

class _ProfileRegistrationScreenState
    extends State<ProfileRegistrationScreen> {
  static const Color _background = Color(0xFFF4F8FC);
  static const Color _surface = Colors.white;
  static const Color _primary = Color(0xFF2F80ED);
  static const Color _strongBlue = Color(0xFF1689F5);
  static const Color _textPrimary = Color(0xFF172033);
  static const Color _textSecondary = Color(0xFF748198);
  static const Color _border = Color(0xFFDDE7F1);
  static const Color _softBlue = Color(0xFFEAF5FF);

  final _formKey = GlobalKey<FormState>();

  late final TextEditingController _nameController;
  final _birthDateController = TextEditingController();
  final _phoneController = TextEditingController();
  final _postalCodeController = TextEditingController();
  final _addressController = TextEditingController();
  final _addressDetailController = TextEditingController();

  final _addressDetailFocusNode = FocusNode();

  DateTime? _birthDate;
  String? _sex;
  bool _isSexDropdownOpen = false;

  @override
  void initState() {
    super.initState();

    _nameController = TextEditingController(
      text: widget.initialName ?? '',
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _birthDateController.dispose();
    _phoneController.dispose();
    _postalCodeController.dispose();
    _addressController.dispose();
    _addressDetailController.dispose();
    _addressDetailFocusNode.dispose();
    super.dispose();
  }

  int _daysInMonth(int year, int month) {
    return DateTime(year, month + 1, 0).day;
  }

  Future<void> _selectBirthDate() async {
    final now = DateTime.now();
    final initialDate = _birthDate ?? DateTime(2000, 1, 1);

    var selectedYear = initialDate.year;
    var selectedMonth = initialDate.month;
    var selectedDay = initialDate.day;

    final years = List<int>.generate(
      now.year - 1899,
      (index) => 1900 + index,
    );

    final selected = await showModalBottomSheet<DateTime>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.28),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            final maxDay = _daysInMonth(
              selectedYear,
              selectedMonth,
            );

            if (selectedDay > maxDay) {
              selectedDay = maxDay;
            }

            return SafeArea(
              top: false,
              child: Container(
                padding: const EdgeInsets.fromLTRB(
                  18,
                  10,
                  18,
                  18,
                ),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.vertical(
                    top: Radius.circular(26),
                  ),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 42,
                      height: 4,
                      decoration: BoxDecoration(
                        color: const Color(0xFFD4DEE8),
                        borderRadius: BorderRadius.circular(99),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            color: _softBlue,
                            borderRadius: BorderRadius.circular(13),
                          ),
                          child: const Icon(
                            Icons.calendar_month_rounded,
                            color: _primary,
                            size: 22,
                          ),
                        ),
                        const SizedBox(width: 10),
                        const Expanded(
                          child: Text(
                            '생년월일 선택',
                            style: TextStyle(
                              color: _textPrimary,
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.3,
                            ),
                          ),
                        ),
                        IconButton(
                          onPressed: () {
                            Navigator.of(sheetContext).pop();
                          },
                          icon: const Icon(
                            Icons.close_rounded,
                            color: _textPrimary,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Text(
                      '$selectedYear년 $selectedMonth월 $selectedDay일',
                      style: const TextStyle(
                        color: _primary,
                        fontSize: 19,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Row(
                      children: [
                        Expanded(
                          child: Center(
                            child: Text(
                              '년',
                              style: TextStyle(
                                color: _textSecondary,
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ),
                        Expanded(
                          child: Center(
                            child: Text(
                              '월',
                              style: TextStyle(
                                color: _textSecondary,
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ),
                        Expanded(
                          child: Center(
                            child: Text(
                              '일',
                              style: TextStyle(
                                color: _textSecondary,
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    SizedBox(
                      height: 180,
                      child: Row(
                        children: [
                          Expanded(
                            child: CupertinoPicker(
                              scrollController:
                                  FixedExtentScrollController(
                                initialItem:
                                    years.indexOf(selectedYear),
                              ),
                              itemExtent: 42,
                              useMagnifier: true,
                              magnification: 1.08,
                              selectionOverlay:
                                  CupertinoPickerDefaultSelectionOverlay(
                                background:
                                    _softBlue.withValues(alpha: 0.9),
                              ),
                              onSelectedItemChanged: (index) {
                                setModalState(() {
                                  selectedYear = years[index];

                                  if (selectedYear == now.year &&
                                      selectedMonth > now.month) {
                                    selectedMonth = now.month;
                                  }

                                  final newMaxDay = _daysInMonth(
                                    selectedYear,
                                    selectedMonth,
                                  );

                                  if (selectedDay > newMaxDay) {
                                    selectedDay = newMaxDay;
                                  }
                                });
                              },
                              children: [
                                for (final year in years)
                                  Center(
                                    child: Text(
                                      '$year',
                                      style: const TextStyle(
                                        color: _textPrimary,
                                        fontSize: 17,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          Expanded(
                            child: CupertinoPicker(
                              scrollController:
                                  FixedExtentScrollController(
                                initialItem: selectedMonth - 1,
                              ),
                              itemExtent: 42,
                              useMagnifier: true,
                              magnification: 1.08,
                              selectionOverlay:
                                  CupertinoPickerDefaultSelectionOverlay(
                                background:
                                    _softBlue.withValues(alpha: 0.9),
                              ),
                              onSelectedItemChanged: (index) {
                                setModalState(() {
                                  selectedMonth = index + 1;

                                  if (selectedYear == now.year &&
                                      selectedMonth > now.month) {
                                    selectedMonth = now.month;
                                  }

                                  final newMaxDay = _daysInMonth(
                                    selectedYear,
                                    selectedMonth,
                                  );

                                  if (selectedDay > newMaxDay) {
                                    selectedDay = newMaxDay;
                                  }
                                });
                              },
                              children: [
                                for (var month = 1; month <= 12; month++)
                                  Center(
                                    child: Text(
                                      '$month',
                                      style: const TextStyle(
                                        color: _textPrimary,
                                        fontSize: 17,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          Expanded(
                            child: CupertinoPicker(
                              scrollController:
                                  FixedExtentScrollController(
                                initialItem: selectedDay - 1,
                              ),
                              itemExtent: 42,
                              useMagnifier: true,
                              magnification: 1.08,
                              selectionOverlay:
                                  CupertinoPickerDefaultSelectionOverlay(
                                background:
                                    _softBlue.withValues(alpha: 0.9),
                              ),
                              onSelectedItemChanged: (index) {
                                setModalState(() {
                                  selectedDay = index + 1;
                                });
                              },
                              children: [
                                for (var day = 1; day <= maxDay; day++)
                                  Center(
                                    child: Text(
                                      '$day',
                                      style: const TextStyle(
                                        color: _textPrimary,
                                        fontSize: 17,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 18),
                    Row(
                      children: [
                        Expanded(
                          child: SizedBox(
                            height: 52,
                            child: OutlinedButton(
                              onPressed: () {
                                Navigator.of(sheetContext).pop();
                              },
                              style: OutlinedButton.styleFrom(
                                foregroundColor: _textPrimary,
                                backgroundColor:
                                    const Color(0xFFF2F6FA),
                                side: BorderSide.none,
                                shape: RoundedRectangleBorder(
                                  borderRadius:
                                      BorderRadius.circular(14),
                                ),
                              ),
                              child: const Text(
                                '취소',
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: SizedBox(
                            height: 52,
                            child: FilledButton(
                              onPressed: () {
                                final candidate = DateTime(
                                  selectedYear,
                                  selectedMonth,
                                  selectedDay,
                                );

                                if (candidate.isAfter(now)) {
                                  ScaffoldMessenger.of(context)
                                      .showSnackBar(
                                    const SnackBar(
                                      content: Text(
                                        '오늘 이후 날짜는 선택할 수 없습니다.',
                                      ),
                                    ),
                                  );
                                  return;
                                }

                                Navigator.of(sheetContext).pop(
                                  candidate,
                                );
                              },
                              style: FilledButton.styleFrom(
                                backgroundColor: _primary,
                                foregroundColor: Colors.white,
                                elevation: 0,
                                shape: RoundedRectangleBorder(
                                  borderRadius:
                                      BorderRadius.circular(14),
                                ),
                              ),
                              child: const Text(
                                '확인',
                                style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    if (!mounted || selected == null) return;

    setState(() {
      _birthDate = selected;
      _birthDateController.text = DateFormat(
        'yyyy.MM.dd',
      ).format(selected);
    });
  }

  Future<void> _searchAddress() async {
    final result = await showModalBottomSheet<Kpostal>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.28),
      builder: (sheetContext) {
        return FractionallySizedBox(
          heightFactor: 0.92,
          child: ClipRRect(
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(26),
            ),
            child: KpostalView(
              appBar: AppBar(
                automaticallyImplyLeading: false,
                centerTitle: false,
                backgroundColor: Colors.white,
                foregroundColor: _textPrimary,
                surfaceTintColor: Colors.white,
                elevation: 0,
                scrolledUnderElevation: 0,
                titleSpacing: 18,
                title: const Text(
                  '주소 검색',
                  style: TextStyle(
                    color: _textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                actions: [
                  IconButton(
                    onPressed: () {
                      Navigator.of(sheetContext).pop();
                    },
                    icon: const Icon(
                      Icons.close_rounded,
                    ),
                  ),
                  const SizedBox(width: 6),
                ],
              ),
            ),
          ),
        );
      },
    );

    if (!mounted || result == null) return;

    setState(() {
      _postalCodeController.text = result.postCode;
      _addressController.text = result.address;
      _addressDetailController.clear();
    });

    _addressDetailFocusNode.requestFocus();
  }

  void _continue() {
    if (!_formKey.currentState!.validate()) return;

    if (_birthDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('생년월일을 선택해주세요.'),
        ),
      );
      return;
    }

    if (_sex == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('성별을 선택해주세요.'),
        ),
      );
      return;
    }

    final registrationData = PatientRegistrationData(
      registrationToken: widget.registrationToken,
      name: _nameController.text.trim(),
      birthDate: _birthDate!,
      sex: _sex!,
      phoneNumber: _phoneController.text.trim(),
      postalCode: _postalCodeController.text.trim(),
      address: _addressController.text.trim(),
      addressDetail: _addressDetailController.text.trim(),
    );

    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) {
          return PatientLinkScreen(
            registrationData: registrationData,
          );
        },
      ),
    );
  }

  String? _requiredValidator(
    String? value,
    String fieldName,
  ) {
    if (value == null || value.trim().isEmpty) {
      return '$fieldName을 입력해주세요.';
    }

    return null;
  }

  Widget _fieldLabel(String label) {
    return Padding(
      padding: const EdgeInsets.only(
        left: 2,
        bottom: 7,
      ),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text(
          label,
          style: const TextStyle(
            color: _textPrimary,
            fontSize: 13,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }

  InputDecoration _decoration({
    required String hint,
    required IconData icon,
    Widget? suffixIcon,
  }) {
    return InputDecoration(
      hintText: hint,
      prefixIcon: Padding(
        padding: const EdgeInsets.all(9),
        child: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: _softBlue,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(
            icon,
            color: _strongBlue,
            size: 20,
          ),
        ),
      ),
      suffixIcon: suffixIcon,
      filled: true,
      fillColor: Colors.white,
      hintStyle: const TextStyle(
        color: Color(0xFF9AA8B8),
        fontSize: 13,
      ),
      contentPadding: const EdgeInsets.symmetric(
        horizontal: 14,
        vertical: 16,
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(
          color: _border,
        ),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(
          color: _border,
        ),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(
          color: _primary,
          width: 1.5,
        ),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(
          color: Color(0xFFE45B65),
        ),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(
          color: Color(0xFFE45B65),
          width: 1.5,
        ),
      ),
    );
  }

  Widget _sectionCard({
    required List<Widget> children,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: _border,
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF6F8EAE)
                .withValues(alpha: 0.045),
            blurRadius: 16,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Column(
        children: children,
      ),
    );
  }
  
  Widget _buildIntro() {
    return SizedBox(
      height: 136,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // ==========================================
          // 배경 버블 장식
          // ==========================================
  
          // 오른쪽 위 큰 버블
          Positioned(
            right: 38,
            top: -18,
            child: Container(
              width: 86,
              height: 86,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color.fromARGB(255, 212, 237, 255)
                    .withValues(alpha: 0.48),
              ),
            ),
          ),
  
          // 왼쪽 아래 은은한 버블
          Positioned(
            left: -22,
            bottom: -18,
            child: Container(
              width: 76,
              height: 76,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color.fromARGB(255, 226, 248, 255)
                    .withValues(alpha: 0.55),
              ),
            ),
          ),
  
          // 숨이 뒤 작은 흰 버블
          Positioned(
            right: 103,
            top: 47,
            child: Container(
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color.fromARGB(255, 202, 244, 255).withValues(
                  alpha: 0.72,
                ),
              ),
            ),
          ),
  
          // ==========================================
          // 안내 문구
          // ==========================================
          const Positioned(
            left: 10,
            top: 25,
            right: 118,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: '서비스 이용을 위해\n',
                        style: TextStyle(
                          color: _textPrimary,
                        ),
                      ),
                      TextSpan(
                        text: '기본정보를 입력해주세요.',
                        style: TextStyle(
                          color: _strongBlue,
                        ),
                      ),
                    ],
                  ),
                  style: TextStyle(
                    fontSize: 23,
                    height: 1.3,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.7,
                  ),
                ),
                SizedBox(height: 8),
                Text(
                  '입력한 정보는 환자정보 연결에 사용됩니다.',
                  style: TextStyle(
                    color: _textSecondary,
                    fontSize: 13,
                    height: 1.55,
                  ),
                ),
              ],
            ),
          ),
  
          // ==========================================
          // 보안 숨이
          // ==========================================
          Positioned(
            right: 3,
            top: 5,
            child: Image.asset(
              'assets/images/보안_숨이.png',
              width: 130,
              height: 130,
              fit: BoxFit.contain,
              filterQuality: FilterQuality.high,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSexDropdown() {
    return Column(
      children: [
        Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () {
              setState(() {
                _isSexDropdownOpen =
                    !_isSexDropdownOpen;
              });
            },
            borderRadius: BorderRadius.circular(14),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 160),
              height: 56,
              padding: const EdgeInsets.symmetric(
                horizontal: 12,
              ),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: _isSexDropdownOpen
                      ? _primary
                      : _border,
                  width: _isSexDropdownOpen ? 1.5 : 1,
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: _softBlue,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.person_search_outlined,
                      color: _strongBlue,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      _sex == 'MALE'
                          ? '남성'
                          : _sex == 'FEMALE'
                              ? '여성'
                              : _sex == 'OTHER'
                                  ? '기타'
                                  : '선택해주세요.',
                      style: TextStyle(
                        color: _sex == null
                            ? const Color(0xFF9AA8B8)
                            : _textPrimary,
                        fontSize: 13.5,
                        fontWeight: _sex == null
                            ? FontWeight.w500
                            : FontWeight.w600,
                      ),
                    ),
                  ),
                  AnimatedRotation(
                    turns: _isSexDropdownOpen ? 0.5 : 0,
                    duration:
                        const Duration(milliseconds: 180),
                    child: const Icon(
                      Icons.keyboard_arrow_down_rounded,
                      color: Color(0xFF718398),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),

        AnimatedSize(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          child: _isSexDropdownOpen
              ? Container(
                  margin: const EdgeInsets.only(top: 4),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: _border,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF6F8EAE)
                            .withValues(alpha: 0.08),
                        blurRadius: 14,
                        offset: const Offset(0, 5),
                      ),
                    ],
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: Column(
                    children: [
                      _buildSexOption(
                        label: '남성',
                        value: 'MALE',
                      ),
                      const Divider(
                        height: 1,
                        color: Color(0xFFEDF2F7),
                      ),
                      _buildSexOption(
                        label: '여성',
                        value: 'FEMALE',
                      ),
                      const Divider(
                        height: 1,
                        color: Color(0xFFEDF2F7),
                      ),
                      _buildSexOption(
                        label: '기타',
                        value: 'OTHER',
                      ),
                    ],
                  ),
                )
              : const SizedBox.shrink(),
        ),
      ],
    );
  }

  Widget _buildSexOption({
    required String label,
    required String value,
  }) {
    final selected = _sex == value;

    return Material(
      color: selected
          ? const Color(0xFFEAF4FF)
          : Colors.white,
      child: InkWell(
        onTap: () {
          setState(() {
            _sex = value;
            _isSexDropdownOpen = false;
          });
        },
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 15,
          ),
          child: Text(
            label,
            style: TextStyle(
              color: selected
                  ? _primary
                  : _textPrimary,
              fontSize: 14,
              fontWeight: selected
                  ? FontWeight.w800
                  : FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _background,
      appBar: AppBar(
        centerTitle: true,
        backgroundColor: Colors.white,
        foregroundColor: _textPrimary,
        surfaceTintColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: const Text(
          '기본정보 입력',
          style: TextStyle(
            color: _textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(
            height: 1,
            color: Color(0xFFE8EEF4),
          ),
        ),
      ),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            physics: const ClampingScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(
              18,
              10,
              18,
              28,
            ),
            children: [
              _buildIntro(),

              _sectionCard(
                children: [
                  _fieldLabel('이름'),
                  TextFormField(
                    controller: _nameController,
                    textInputAction: TextInputAction.next,
                    decoration: _decoration(
                      hint: '이름을 입력해주세요.',
                      icon: Icons.person_outline_rounded,
                    ),
                    validator: (value) {
                      return _requiredValidator(
                        value,
                        '이름',
                      );
                    },
                  ),

                  const SizedBox(height: 13),

                  _fieldLabel('생년월일'),
                  TextFormField(
                    controller: _birthDateController,
                    readOnly: true,
                    onTap: _selectBirthDate,
                    decoration: _decoration(
                      hint: '생년월일을 선택해주세요.',
                      icon: Icons.calendar_month_rounded,
                      suffixIcon: const Icon(
                        Icons.calendar_today_outlined,
                        color: Color(0xFF718398),
                        size: 20,
                      ),
                    ),
                    validator: (_) {
                      if (_birthDate == null) {
                        return '생년월일을 선택해주세요.';
                      }

                      return null;
                    },
                  ),

                  const SizedBox(height: 13),

                  _fieldLabel('성별'),
                  _buildSexDropdown(),

                  const SizedBox(height: 13),

                  _fieldLabel('휴대전화번호'),
                  TextFormField(
                    controller: _phoneController,
                    keyboardType: TextInputType.phone,
                    textInputAction: TextInputAction.done,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(11),
                    ],
                    decoration: _decoration(
                      hint: '- 없이 숫자만 입력해주세요.',
                      icon: Icons.phone_outlined,
                    ),
                    validator: (value) {
                      final requiredError =
                          _requiredValidator(
                        value,
                        '휴대전화번호',
                      );

                      if (requiredError != null) {
                        return requiredError;
                      }

                      if (value!.length != 11) {
                        return '휴대전화번호 11자리를 입력해주세요.';
                      }

                      if (!value.startsWith('010')) {
                        return '010으로 시작하는 번호를 입력해주세요.';
                      }

                      return null;
                    },
                  ),

                  const SizedBox(height: 7),

                ],
              ),

              const SizedBox(height: 22),

              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 2),
                child: Text(
                  '주소',
                  style: TextStyle(
                    color: _textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),

              const SizedBox(height: 10),

              _sectionCard(
                children: [
                  _fieldLabel('우편번호'),

                  Row(
                    crossAxisAlignment:
                        CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller:
                              _postalCodeController,
                          readOnly: true,
                          decoration: _decoration(
                            hint: '우편번호',
                            icon:
                                Icons.location_on_outlined,
                          ),
                          validator: (value) {
                            return _requiredValidator(
                              value,
                              '우편번호',
                            );
                          },
                        ),
                      ),

                      const SizedBox(width: 10),

                      SizedBox(
                        width: 100,
                        height: 52,
                        child: OutlinedButton.icon(
                          onPressed: _searchAddress,
                          style: OutlinedButton.styleFrom(
                            foregroundColor: _primary,
                            backgroundColor:
                                const Color(0xFFEAF4FF),
                            side: const BorderSide(
                              color: Color(0xFFD4E6FA),
                            ),
                            padding:
                                const EdgeInsets.symmetric(
                              horizontal: 10,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius:
                                  BorderRadius.circular(14),
                            ),
                          ),
                          icon: const Icon(
                            Icons.search_rounded,
                            size: 18,
                          ),
                          label: const Text(
                            '주소 검색',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 13),

                  _fieldLabel('기본주소'),
                  TextFormField(
                    controller: _addressController,
                    readOnly: true,
                    decoration: _decoration(
                      hint: '주소 검색 후 자동으로 입력됩니다.',
                      icon: Icons.home_outlined,
                    ),
                    validator: (value) {
                      return _requiredValidator(
                        value,
                        '기본주소',
                      );
                    },
                  ),

                  const SizedBox(height: 13),

                  _fieldLabel('상세주소'),
                  TextFormField(
                    controller: _addressDetailController,
                    focusNode: _addressDetailFocusNode,
                    textInputAction: TextInputAction.done,
                    decoration: _decoration(
                      hint: '동, 호수 등 상세주소를 입력해주세요.',
                      icon: Icons.notes_rounded,
                    ),
                    validator: (value) {
                      return _requiredValidator(
                        value,
                        '상세주소',
                      );
                    },
                  ),
                ],
              ),

              const SizedBox(height: 24),

              SizedBox(
                height: 56,
                child: FilledButton(
                  onPressed: _continue,
                  style: FilledButton.styleFrom(
                    backgroundColor: _primary,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius:
                          BorderRadius.circular(14),
                    ),
                  ),
                  child: const Text(
                    '다음',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
