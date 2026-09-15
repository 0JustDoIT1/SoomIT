import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'patient_link_screen.dart';

class ProfileRegistrationScreen extends StatefulWidget {
  const ProfileRegistrationScreen({super.key});

  @override
  State<ProfileRegistrationScreen> createState() =>
      _ProfileRegistrationScreenState();
}

class _ProfileRegistrationScreenState
    extends State<ProfileRegistrationScreen> {
  final _formKey = GlobalKey<FormState>();

  final _nameController = TextEditingController();
  final _birthDateController = TextEditingController();
  final _phoneController = TextEditingController();
  final _postalCodeController = TextEditingController();
  final _addressController = TextEditingController();
  final _addressDetailController = TextEditingController();

  DateTime? _birthDate;
  String? _sex;

  @override
  void dispose() {
    _nameController.dispose();
    _birthDateController.dispose();
    _phoneController.dispose();
    _postalCodeController.dispose();
    _addressController.dispose();
    _addressDetailController.dispose();
    super.dispose();
  }

  Future<void> _selectBirthDate() async {
    final selectedDate = await showDatePicker(
      context: context,
      initialDate: DateTime(1990),
      firstDate: DateTime(1900),
      lastDate: DateTime.now(),
      helpText: '생년월일 선택',
      cancelText: '취소',
      confirmText: '확인',
    );

    if (selectedDate == null) return;

    setState(() {
      _birthDate = selectedDate;
      _birthDateController.text = DateFormat(
        'yyyy.MM.dd',
      ).format(selectedDate);
    });
  }

  void _searchAddress() {
    setState(() {
      _postalCodeController.text = '35233';
      _addressController.text = '대전광역시 서구 둔산로 100';
    });
  
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('테스트 주소가 입력되었습니다.'),
      ),
    );
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

    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) {
          return const PatientLinkScreen();
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

  InputDecoration _decoration({
    required String label,
    String? hint,
    Widget? suffixIcon,
  }) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      suffixIcon: suffixIcon,
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(
          color: Color(0xFFD1D5DB),
        ),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(
          color: Color(0xFFD1D5DB),
        ),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(
          color: Color(0xFF6D4FB3),
          width: 1.5,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9F8FC),
      appBar: AppBar(
        title: const Text(
          '기본정보 입력',
          style: TextStyle(
            fontWeight: FontWeight.w700,
          ),
        ),
        backgroundColor: const Color(0xFFF9F8FC),
        surfaceTintColor: Colors.transparent,
      ),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(
              24,
              16,
              24,
              32,
            ),
            children: [
              const Text(
                '서비스 이용을 위해\n기본정보를 입력해주세요.',
                style: TextStyle(
                  color: Color(0xFF191F28),
                  fontSize: 24,
                  height: 1.35,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                '입력한 정보는 환자정보 연결에 사용됩니다.',
                style: TextStyle(
                  color: Color(0xFF6B7280),
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 28),
              TextFormField(
                controller: _nameController,
                textInputAction: TextInputAction.next,
                decoration: _decoration(
                  label: '이름',
                  hint: '이름을 입력해주세요.',
                ),
                validator: (value) {
                  return _requiredValidator(value, '이름');
                },
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _birthDateController,
                readOnly: true,
                onTap: _selectBirthDate,
                decoration: _decoration(
                  label: '생년월일',
                  hint: '생년월일을 선택해주세요.',
                  suffixIcon: const Icon(
                    Icons.calendar_month_outlined,
                  ),
                ),
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: _sex,
                decoration: _decoration(
                  label: '성별',
                ),
                items: const [
                  DropdownMenuItem(
                    value: 'MALE',
                    child: Text('남성'),
                  ),
                  DropdownMenuItem(
                    value: 'FEMALE',
                    child: Text('여성'),
                  ),
                  DropdownMenuItem(
                    value: 'OTHER',
                    child: Text('기타'),
                  ),
                  DropdownMenuItem(
                    value: 'UNKNOWN',
                    child: Text('선택하지 않음'),
                  ),
                ],
                onChanged: (value) {
                  setState(() {
                    _sex = value;
                  });
                },
                validator: (value) {
                  if (value == null) {
                    return '성별을 선택해주세요.';
                  }

                  return null;
                },
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.next,
                decoration: _decoration(
                  label: '휴대전화번호',
                  hint: '01012345678',
                ),
                validator: (value) {
                  final requiredError = _requiredValidator(
                    value,
                    '휴대전화번호',
                  );

                  if (requiredError != null) {
                    return requiredError;
                  }

                  final digits = value!.replaceAll(
                    RegExp(r'[^0-9]'),
                    '',
                  );

                  if (digits.length < 10 ||
                      digits.length > 11) {
                    return '휴대전화번호를 확인해주세요.';
                  }

                  return null;
                },
              ),
              const SizedBox(height: 24),
              const Text(
                '주소',
                style: TextStyle(
                  color: Color(0xFF191F28),
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _postalCodeController,
                      readOnly: true,
                      decoration: _decoration(
                        label: '우편번호',
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
                    height: 56,
                    child: OutlinedButton(
                      onPressed: _searchAddress,
                      style: OutlinedButton.styleFrom(
                        foregroundColor:
                            const Color(0xFF6D4FB3),
                        side: const BorderSide(
                          color: Color(0xFF6D4FB3),
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius:
                              BorderRadius.circular(12),
                        ),
                      ),
                      child: const Text(
                        '주소 검색',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _addressController,
                readOnly: true,
                decoration: _decoration(
                  label: '기본주소',
                ),
                validator: (value) {
                  return _requiredValidator(
                    value,
                    '기본주소',
                  );
                },
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _addressDetailController,
                textInputAction: TextInputAction.done,
                decoration: _decoration(
                  label: '상세주소',
                  hint: '동, 호수 등 상세주소',
                ),
                validator: (value) {
                  return _requiredValidator(
                    value,
                    '상세주소',
                  );
                },
              ),
              const SizedBox(height: 32),
              SizedBox(
                height: 54,
                child: FilledButton(
                  onPressed: _continue,
                  style: FilledButton.styleFrom(
                    backgroundColor:
                        const Color(0xFF6D4FB3),
                    shape: RoundedRectangleBorder(
                      borderRadius:
                          BorderRadius.circular(14),
                    ),
                  ),
                  child: const Text(
                    '다음',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
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
