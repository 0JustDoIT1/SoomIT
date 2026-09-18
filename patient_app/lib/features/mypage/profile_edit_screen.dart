import 'package:flutter/material.dart';
import 'package:kpostal/kpostal.dart';

import '../home/models/patient_profile.dart';
import '../home/services/profile_service.dart';

class ProfileEditScreen extends StatefulWidget {
  const ProfileEditScreen({super.key});

  @override
  State<ProfileEditScreen> createState() =>
      _ProfileEditScreenState();
}

class _ProfileEditScreenState
    extends State<ProfileEditScreen> {
  final ProfileService _profileService =
      ProfileService();

  final TextEditingController _phoneController =
      TextEditingController();
  final TextEditingController _postalCodeController =
      TextEditingController();
  final TextEditingController _addressController =
      TextEditingController();
  final TextEditingController _addressDetailController =
      TextEditingController();

  final FocusNode _addressDetailFocusNode =
      FocusNode();

  PatientProfile? _profile;

  bool _isLoading = true;
  bool _isSaving = false;

  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _postalCodeController.dispose();
    _addressController.dispose();
    _addressDetailController.dispose();
    _addressDetailFocusNode.dispose();
    super.dispose();
  }

  Future<void> _loadProfile() async {
    try {
      final profile =
          await _profileService.getProfile();

      if (!mounted) return;

      _phoneController.text =
          profile.phoneNumber ?? '';
      _postalCodeController.text =
          profile.postalCode ?? '';
      _addressController.text =
          profile.address ?? '';
      _addressDetailController.text =
          profile.addressDetail ?? '';

      setState(() {
        _profile = profile;
        _isLoading = false;
        _errorMessage = null;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _isLoading = false;
        _errorMessage =
            '프로필 정보를 불러오지 못했습니다.';
      });
    }
  }

  Future<void> _searchAddress() async {
    final result =
        await Navigator.of(context).push<Kpostal>(
      MaterialPageRoute<Kpostal>(
        builder: (context) {
          return KpostalView(
            appBar: AppBar(
              title: const Text(
                '주소 검색',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                ),
              ),
              backgroundColor:
                  const Color(0xFFF9F8FC),
              foregroundColor:
                  const Color(0xFF191F28),
              surfaceTintColor:
                  Colors.transparent,
            ),
          );
        },
      ),
    );

    if (!mounted || result == null) return;

    setState(() {
      _postalCodeController.text =
          result.postCode;
      _addressController.text =
          result.address;
      _addressDetailController.clear();
    });

    _addressDetailFocusNode.requestFocus();
  }

  Future<void> _saveProfile() async {
    final phoneNumber =
        _phoneController.text.trim();
    final postalCode =
        _postalCodeController.text.trim();
    final address =
        _addressController.text.trim();
    final addressDetail =
        _addressDetailController.text.trim();

    if (phoneNumber.isEmpty) {
      _showMessage('전화번호를 입력해주세요.');
      return;
    }

    if (postalCode.isEmpty || address.isEmpty) {
      _showMessage('주소를 검색해주세요.');
      return;
    }

    if (addressDetail.isEmpty) {
      _showMessage('상세주소를 입력해주세요.');
      return;
    }

    try {
      setState(() {
        _isSaving = true;
      });

      final updatedProfile =
          await _profileService.updateProfile(
        phoneNumber: phoneNumber,
        postalCode: postalCode,
        address: address,
        addressDetail: addressDetail,
      );

      if (!mounted) return;

      setState(() {
        _profile = updatedProfile;
        _phoneController.text =
            updatedProfile.phoneNumber ?? '';
        _postalCodeController.text =
            updatedProfile.postalCode ?? '';
        _addressController.text =
            updatedProfile.address ?? '';
        _addressDetailController.text =
            updatedProfile.addressDetail ?? '';
        _isSaving = false;
      });

      _showMessage(
        '프로필 정보가 변경되었습니다.',
      );
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _isSaving = false;
      });

      _showMessage(
        '프로필 정보 변경에 실패했습니다.',
      );
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
      ),
    );
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
          '프로필 관리',
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
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              _errorMessage!,
              style: const TextStyle(
                color: Color(0xFF8B95A1),
              ),
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () {
                setState(() {
                  _isLoading = true;
                  _errorMessage = null;
                });

                _loadProfile();
              },
              child: const Text('다시 시도'),
            ),
          ],
        ),
      );
    }

    final profile = _profile;

    if (profile == null) {
      return const Center(
        child: Text('프로필 정보가 없습니다.'),
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment:
            CrossAxisAlignment.start,
        children: [
          const Text(
            '기본 정보',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Color(0xFF191F28),
            ),
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius:
                  BorderRadius.circular(16),
            ),
            child: Column(
              children: [
                _buildReadOnlyRow(
                  '이름',
                  profile.name,
                ),
                _divider(),
                _buildReadOnlyRow(
                  '환자번호',
                  profile.patientCode,
                ),
                _divider(),
                _buildReadOnlyRow(
                  '생년월일',
                  _formatBirthDate(
                    profile.birthDate,
                  ),
                ),
                _divider(),
                _buildReadOnlyRow(
                  '성별',
                  profile.sexLabel,
                ),
                _divider(),
                _buildReadOnlyRow(
                  '등록 병원',
                  profile.hospitalName ?? '-',
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          const Text(
            '연락처',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Color(0xFF191F28),
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius:
                  BorderRadius.circular(16),
            ),
            child: TextField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: '전화번호',
                hintText: '01012345678',
                prefixIcon: Icon(
                  Icons.phone_outlined,
                ),
                border: OutlineInputBorder(),
              ),
            ),
          ),

          const SizedBox(height: 24),

          const Text(
            '주소',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Color(0xFF191F28),
            ),
          ),
          const SizedBox(height: 12),

          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius:
                  BorderRadius.circular(16),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller:
                            _postalCodeController,
                        readOnly: true,
                        decoration:
                            const InputDecoration(
                          labelText: '우편번호',
                          border:
                              OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    SizedBox(
                      height: 56,
                      child: OutlinedButton(
                        onPressed:
                            _searchAddress,
                        child: const Text(
                          '주소 검색',
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                TextField(
                  controller:
                      _addressController,
                  readOnly: true,
                  decoration:
                      const InputDecoration(
                    labelText: '기본주소',
                    border:
                        OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller:
                      _addressDetailController,
                  focusNode:
                      _addressDetailFocusNode,
                  decoration:
                      const InputDecoration(
                    labelText: '상세주소',
                    hintText: '동, 호수 등 상세주소',
                    border:
                        OutlineInputBorder(),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          SizedBox(
            width: double.infinity,
            height: 52,
            child: FilledButton(
              onPressed:
                  _isSaving ? null : _saveProfile,
              child: _isSaving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child:
                          CircularProgressIndicator(
                        strokeWidth: 2,
                      ),
                    )
                  : const Text(
                      '저장',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight:
                            FontWeight.bold,
                      ),
                    ),
            ),
          ),

          const SizedBox(height: 12),

          const Center(
            child: Text(
              '이름, 환자번호, 생년월일, 성별, 등록 병원 변경은 병원에 문의해주세요.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12,
                color: Color(0xFF8B95A1),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildReadOnlyRow(
    String label,
    String value,
  ) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        vertical: 13,
      ),
      child: Row(
        children: [
          SizedBox(
            width: 90,
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 13,
                color: Color(0xFF8B95A1),
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Color(0xFF191F28),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _divider() {
    return const Divider(
      height: 1,
      color: Color(0xFFEEF1F5),
    );
  }

  String _formatBirthDate(
    DateTime? birthDate,
  ) {
    if (birthDate == null) {
      return '-';
    }

    return '${birthDate.year}.'
        '${birthDate.month.toString().padLeft(2, '0')}.'
        '${birthDate.day.toString().padLeft(2, '0')}';
  }
}
