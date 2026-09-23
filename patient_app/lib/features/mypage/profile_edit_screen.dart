import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kpostal/kpostal.dart';

import '../home/models/patient_profile.dart';
import '../home/services/profile_service.dart';

class ProfileEditScreen extends StatefulWidget {
  const ProfileEditScreen({super.key});

  @override
  State<ProfileEditScreen> createState() => _ProfileEditScreenState();
}

class _ProfileEditScreenState extends State<ProfileEditScreen> {
  final ProfileService _profileService = ProfileService();

  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _postalCodeController = TextEditingController();
  final TextEditingController _addressController = TextEditingController();
  final TextEditingController _addressDetailController =
      TextEditingController();

  final FocusNode _phoneFocusNode = FocusNode();
  final FocusNode _addressDetailFocusNode = FocusNode();

  PatientProfile? _profile;

  bool _isLoading = true;
  bool _isSaving = false;
  bool _isEditingContact = false;
  bool _isEditingAddress = false;

  String? _errorMessage;

  // ─────────────────────────────────────
  // 컬러
  // ─────────────────────────────────────

  static const Color _backgroundColor = Color(0xFFF5F8FC);
  static const Color _cardColor = Colors.white;

  static const Color _primaryColor = Color(0xFF4E7CFF);
  static const Color _primarySoft = Color(0xFFF0F5FF);

  static const Color _textPrimary = Color(0xFF182230);
  static const Color _textSecondary = Color(0xFF7D8999);

  static const Color _dividerColor = Color(0xFFEEF2F6);
  static const Color _fieldBorderColor = Color(0xFFDCE3EC);
  static const Color _fieldBackgroundColor = Color(0xFFFAFBFD);

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

    _phoneFocusNode.dispose();
    _addressDetailFocusNode.dispose();

    super.dispose();
  }

  // ─────────────────────────────────────
  // 숫자만 추출
  // ─────────────────────────────────────

  String _onlyDigits(String value) {
    return value.replaceAll(RegExp(r'[^0-9]'), '');
  }

  // ─────────────────────────────────────
  // 프로필 조회
  // ─────────────────────────────────────

  Future<void> _loadProfile() async {
    try {
      final profile = await _profileService.getProfile();

      if (!mounted) return;

      _phoneController.text = _onlyDigits(
        profile.phoneNumber ?? '',
      );

      _postalCodeController.text = profile.postalCode ?? '';
      _addressController.text = profile.address ?? '';
      _addressDetailController.text = profile.addressDetail ?? '';

      setState(() {
        _profile = profile;
        _isLoading = false;

        _isEditingContact = false;
        _isEditingAddress = false;

        _errorMessage = null;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _isLoading = false;
        _errorMessage = '프로필 정보를 불러오지 못했습니다.';
      });
    }
  }

  // ─────────────────────────────────────
  // 연락처 수정 / 취소
  // ─────────────────────────────────────

  void _toggleContactEdit() {
    if (_isSaving) return;

    // 수정 중 → 취소
    if (_isEditingContact) {
      _phoneController.text = _onlyDigits(
        _profile?.phoneNumber ?? '',
      );

      _phoneFocusNode.unfocus();

      setState(() {
        _isEditingContact = false;
      });

      return;
    }

    // 조회 → 수정
    setState(() {
      _isEditingContact = true;
    });

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;

      _phoneFocusNode.requestFocus();
    });
  }

  // ─────────────────────────────────────
  // 주소 수정 / 취소
  // ─────────────────────────────────────

  void _toggleAddressEdit() {
    if (_isSaving) return;

    // 수정 중 → 취소
    if (_isEditingAddress) {
      _postalCodeController.text = _profile?.postalCode ?? '';
      _addressController.text = _profile?.address ?? '';
      _addressDetailController.text =
          _profile?.addressDetail ?? '';

      _addressDetailFocusNode.unfocus();

      setState(() {
        _isEditingAddress = false;
      });

      return;
    }

    // 조회 → 수정
    setState(() {
      _isEditingAddress = true;
    });
  }

  // ─────────────────────────────────────
  // 주소 검색
  // 반드시 주소 수정 상태에서만 가능
  // ─────────────────────────────────────

  Future<void> _searchAddress() async {
    // 수정하기 전에는 주소검색 절대 실행 안 됨
    if (!_isEditingAddress) {
      return;
    }

    final result = await Navigator.of(context).push<Kpostal>(
      MaterialPageRoute<Kpostal>(
        builder: (context) {
          return KpostalView(
            appBar: AppBar(
              title: const Text(
                '주소 검색',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: _textPrimary,
                ),
              ),
              centerTitle: true,
              backgroundColor: Colors.white,
              foregroundColor: _textPrimary,
              surfaceTintColor: Colors.transparent,
              elevation: 0,
            ),
          );
        },
      ),
    );

    if (!mounted || result == null) return;

    setState(() {
      _postalCodeController.text = result.postCode;
      _addressController.text = result.address;
      _addressDetailController.clear();
    });

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;

      _addressDetailFocusNode.requestFocus();
    });
  }

  // ─────────────────────────────────────
  // 저장
  // ─────────────────────────────────────

  Future<void> _saveProfile() async {
    if (!_isEditingContact && !_isEditingAddress) {
      _showMessage('수정할 정보를 선택해주세요.');
      return;
    }

    final phoneNumber = _onlyDigits(
      _phoneController.text.trim(),
    );

    final postalCode = _postalCodeController.text.trim();
    final address = _addressController.text.trim();
    final addressDetail = _addressDetailController.text.trim();

    // 휴대폰 번호 검사
    if (phoneNumber.isEmpty) {
      _showMessage('휴대폰 번호를 입력해주세요.');
      return;
    }

    if (phoneNumber.length < 10 || phoneNumber.length > 11) {
      _showMessage('휴대폰 번호를 10~11자리로 입력해주세요.');
      return;
    }

    // 주소 검사
    if (postalCode.isEmpty || address.isEmpty) {
      _showMessage('주소를 검색해주세요.');
      return;
    }

    if (addressDetail.isEmpty) {
      _showMessage('상세주소를 입력해주세요.');
      return;
    }

    try {
      FocusScope.of(context).unfocus();

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

        _phoneController.text = _onlyDigits(
          updatedProfile.phoneNumber ?? '',
        );

        _postalCodeController.text =
            updatedProfile.postalCode ?? '';

        _addressController.text =
            updatedProfile.address ?? '';

        _addressDetailController.text =
            updatedProfile.addressDetail ?? '';

        _isEditingContact = false;
        _isEditingAddress = false;

        _isSaving = false;
      });

      _showMessage('프로필 정보가 변경되었습니다.');
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _isSaving = false;
      });

      _showMessage('프로필 정보 변경에 실패했습니다.');
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.all(16),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
  }

  // ─────────────────────────────────────
  // 전체 화면
  // ─────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _backgroundColor,
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        title: const Text(
          '프로필 관리',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: _textPrimary,
          ),
        ),
        leading: IconButton(
          onPressed: () {
            Navigator.pop(context);
          },
          icon: const Icon(
            Icons.arrow_back_ios_new_rounded,
            size: 20,
            color: _textPrimary,
          ),
        ),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(
          color: _primaryColor,
        ),
      );
    }

    if (_errorMessage != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: 32,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.error_outline_rounded,
                size: 42,
                color: _textSecondary,
              ),
              const SizedBox(height: 12),
              Text(
                _errorMessage!,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 14,
                  color: _textSecondary,
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
                child: const Text(
                  '다시 시도',
                  style: TextStyle(
                    color: _primaryColor,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    final profile = _profile;

    if (profile == null) {
      return const Center(
        child: Text('프로필 정보가 없습니다.'),
      );
    }

    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          16,
          18,
          16,
          32,
        ),
        child: Column(
          children: [
            // 기본 정보
            _buildBasicInfoCard(profile),

            const SizedBox(height: 14),

            // 연락처
            _buildContactCard(),

            const SizedBox(height: 14),

            // 주소
            _buildAddressCard(),

            const SizedBox(height: 22),

            // 저장
            SizedBox(
              width: double.infinity,
              height: 54,
              child: FilledButton(
                onPressed:
                    (_isSaving ||
                        (!_isEditingContact &&
                            !_isEditingAddress))
                    ? null
                    : _saveProfile,
                style: FilledButton.styleFrom(
                  backgroundColor: _primaryColor,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor:
                      const Color(0xFFD8DFEA),
                  disabledForegroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(15),
                  ),
                ),
                child: _isSaving
                    ? const SizedBox(
                        width: 21,
                        height: 21,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.2,
                          color: Colors.white,
                        ),
                      )
                    : const Text(
                        '저장하기',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
              ),
            ),

            const SizedBox(height: 12),

            const Text(
              '이름, 환자번호, 생년월일, 성별, 등록 병원 변경은 병원에 문의해주세요.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 11.5,
                height: 1.5,
                color: _textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─────────────────────────────────────
  // 기본 정보 카드
  // ─────────────────────────────────────

  Widget _buildBasicInfoCard(PatientProfile profile) {
    return _buildCard(
      child: Column(
        children: [
          Row(
            children: [
              const Icon(
                Icons.person_rounded,
                size: 20,
                color: _primaryColor,
              ),

              const SizedBox(width: 8),

              const Text(
                '기본 정보',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: _textPrimary,
                ),
              ),

              const Spacer(),

              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 9,
                  vertical: 7,
                ),
                decoration: BoxDecoration(
                  color: _primarySoft,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.lock_rounded,
                      size: 13,
                      color: Color(0xFF8795A8),
                    ),
                    SizedBox(width: 4),
                    Text(
                      '병원 정보는 수정이 제한됩니다.',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF8795A8),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 12),

          _buildInfoRow(
            label: '이름',
            value: profile.name,
            alignRight: true,
          ),

          _divider(),

          _buildInfoRow(
            label: '환자번호',
            value: profile.patientCode,
            alignRight: true,
          ),

          _divider(),

          _buildInfoRow(
            label: '생년월일',
            value: _formatBirthDate(profile.birthDate),
            alignRight: true,
          ),

          _divider(),

          _buildInfoRow(
            label: '성별',
            value: profile.sexLabel,
            alignRight: true,
          ),

          _divider(),

          _buildInfoRow(
            label: '등록 병원',
            value: profile.hospitalName ?? '-',
            alignRight: true,
          ),
        ],
      ),
    );
  }

  // ─────────────────────────────────────
  // 연락처 카드
  // ─────────────────────────────────────

  Widget _buildContactCard() {
    return _buildCard(
      child: Column(
        children: [
          Row(
            children: [
              const Icon(
                Icons.phone_rounded,
                size: 20,
                color: _primaryColor,
              ),

              const SizedBox(width: 8),

              const Text(
                '연락처 정보',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: _textPrimary,
                ),
              ),

              const Spacer(),

              _buildEditButton(
                isEditing: _isEditingContact,
                onPressed: _toggleContactEdit,
              ),
            ],
          ),

          const SizedBox(height: 12),

          if (!_isEditingContact)
            _buildInfoRow(
              label: '휴대폰 번호',
              value: _formatPhone(
                _phoneController.text,
              ),
              showChevron: true,
            )
          else
            _buildEditRow(
              label: '휴대폰 번호',
              child: TextField(
                controller: _phoneController,
                focusNode: _phoneFocusNode,

                // 숫자 키패드
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.done,

                // 숫자만 입력
                // 최대 11자리
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(11),
                ],

                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: _textPrimary,
                ),
                decoration: _editInputDecoration(
                  hintText: '01012345678',
                ),
              ),
            ),
        ],
      ),
    );
  }

  // ─────────────────────────────────────
  // 주소 카드
  // ─────────────────────────────────────

  Widget _buildAddressCard() {
    return _buildCard(
      child: Column(
        children: [
          Row(
            children: [
              const Icon(
                Icons.location_on_rounded,
                size: 21,
                color: _primaryColor,
              ),

              const SizedBox(width: 8),

              const Text(
                '주소 정보',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: _textPrimary,
                ),
              ),

              const Spacer(),

              _buildEditButton(
                isEditing: _isEditingAddress,
                onPressed: _toggleAddressEdit,
              ),
            ],
          ),

          const SizedBox(height: 12),

          // ─────────────────────────────
          // 주소 조회 상태
          // ─────────────────────────────

          if (!_isEditingAddress) ...[
            _buildPostalViewRow(),

            _divider(),

            _buildInfoRow(
              label: '기본주소',
              value: _addressController.text.isEmpty
                  ? '-'
                  : _addressController.text,
              showChevron: true,
            ),

            _divider(),

            _buildInfoRow(
              label: '상세주소',
              value: _addressDetailController.text.isEmpty
                  ? '-'
                  : _addressDetailController.text,
              showChevron: true,
            ),
          ]

          // ─────────────────────────────
          // 주소 수정 상태
          // ─────────────────────────────
          else ...[
            _buildEditRow(
              label: '우편번호',
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _postalCodeController,
                      readOnly: true,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: _textPrimary,
                      ),
                      decoration: _editInputDecoration(
                        hintText: '우편번호',
                      ),
                    ),
                  ),

                  const SizedBox(width: 8),

                  SizedBox(
                    height: 44,
                    child: OutlinedButton(
                      // 수정 모드일 때만 존재하는
                      // 활성 주소검색 버튼
                      onPressed: _searchAddress,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: _primaryColor,
                        backgroundColor: Colors.white,
                        side: const BorderSide(
                          color: Color(0xFF8CABFF),
                        ),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 13,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius:
                              BorderRadius.circular(11),
                        ),
                      ),
                      child: const Text(
                        '주소 검색',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 10),

            _buildEditRow(
              label: '기본주소',
              child: TextField(
                controller: _addressController,
                readOnly: true,
                maxLines: 2,
                minLines: 1,
                style: const TextStyle(
                  fontSize: 13,
                  height: 1.35,
                  fontWeight: FontWeight.w600,
                  color: _textPrimary,
                ),
                decoration: _editInputDecoration(
                  hintText: '주소 검색을 이용해주세요.',
                ),
              ),
            ),

            const SizedBox(height: 10),

            _buildEditRow(
              label: '상세주소',
              child: TextField(
                controller: _addressDetailController,
                focusNode: _addressDetailFocusNode,
                textInputAction: TextInputAction.done,
                style: const TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                  color: _textPrimary,
                ),
                decoration: _editInputDecoration(
                  hintText: '동, 호수 등 상세주소',
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ─────────────────────────────────────
  // 조회 상태 우편번호
  // ─────────────────────────────────────

  Widget _buildPostalViewRow() {
    return Padding(
      padding: const EdgeInsets.symmetric(
        vertical: 10,
      ),
      child: Row(
        children: [
          const SizedBox(
            width: 92,
            child: Text(
              '우편번호',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: _textSecondary,
              ),
            ),
          ),

          Expanded(
            child: Text(
              _postalCodeController.text.isEmpty
                  ? '-'
                  : _postalCodeController.text,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: _textPrimary,
              ),
            ),
          ),

          // ─────────────────────────────
          // 수정하기 전 주소검색
          // 보이지만 클릭은 불가능
          // ─────────────────────────────

          SizedBox(
            height: 36,
            child: OutlinedButton(
              onPressed: null,
              style: OutlinedButton.styleFrom(
                disabledForegroundColor:
                    const Color(0xFFAAB3C0),
                disabledBackgroundColor:
                    const Color(0xFFF7F8FA),
                side: const BorderSide(
                  color: Color(0xFFDDE2E8),
                ),
                padding: const EdgeInsets.symmetric(
                  horizontal: 13,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(11),
                ),
              ),
              child: const Text(
                '주소 검색',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ─────────────────────────────────────
  // 수정하기 / 취소 버튼
  // ─────────────────────────────────────

  Widget _buildEditButton({
    required bool isEditing,
    required VoidCallback onPressed,
  }) {
    return Material(
      color: _primarySoft,
      borderRadius: BorderRadius.circular(11),
      child: InkWell(
        onTap: _isSaving ? null : onPressed,
        borderRadius: BorderRadius.circular(11),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: 11,
            vertical: 8,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                isEditing
                    ? Icons.close_rounded
                    : Icons.edit_rounded,
                size: 14,
                color: _primaryColor,
              ),

              const SizedBox(width: 5),

              Text(
                isEditing ? '취소' : '수정하기',
                style: const TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  color: _primaryColor,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ─────────────────────────────────────
  // 조회용 한 줄
  // ─────────────────────────────────────

  Widget _buildInfoRow({
    required String label,
    required String value,
    bool showChevron = false,
    bool alignRight = false,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        vertical: 11,
      ),
      child: Row(
        children: [
          SizedBox(
            width: 92,
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: _textSecondary,
              ),
            ),
          ),

          Expanded(
            child: Text(
              value,
              textAlign:
                  alignRight ? TextAlign.right : TextAlign.left,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: _textPrimary,
              ),
            ),
          ),

          if (showChevron) ...[
            const SizedBox(width: 7),
            const Icon(
              Icons.chevron_right_rounded,
              size: 20,
              color: Color(0xFF9AA6B5),
            ),
          ],
        ],
      ),
    );
  }

  // ─────────────────────────────────────
  // 수정용 한 줄
  // ─────────────────────────────────────

  Widget _buildEditRow({
    required String label,
    required Widget child,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        SizedBox(
          width: 92,
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: _textSecondary,
            ),
          ),
        ),

        Expanded(
          child: child,
        ),
      ],
    );
  }

  // ─────────────────────────────────────
  // 입력창
  // ─────────────────────────────────────

  InputDecoration _editInputDecoration({
    required String hintText,
  }) {
    return InputDecoration(
      hintText: hintText,
      hintStyle: const TextStyle(
        fontSize: 13,
        color: Color(0xFFAAB3C0),
      ),
      filled: true,
      fillColor: _fieldBackgroundColor,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: 12,
        vertical: 13,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(
          color: _fieldBorderColor,
        ),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(
          color: _primaryColor,
          width: 1.4,
        ),
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(
          color: _fieldBorderColor,
        ),
      ),
    );
  }

  // ─────────────────────────────────────
  // 공통 카드
  // ─────────────────────────────────────

  Widget _buildCard({
    required Widget child,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(
        17,
        16,
        17,
        14,
      ),
      decoration: BoxDecoration(
        color: _cardColor,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: const Color(0xFFF0F3F7),
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF6B83A5).withValues(
              alpha: 0.055,
            ),
            blurRadius: 18,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: child,
    );
  }

  Widget _divider() {
    return const Divider(
      height: 1,
      thickness: 1,
      color: _dividerColor,
    );
  }

  // ─────────────────────────────────────
  // 생년월일
  // ─────────────────────────────────────

  String _formatBirthDate(DateTime? birthDate) {
    if (birthDate == null) {
      return '-';
    }

    return '${birthDate.year}.'
        '${birthDate.month.toString().padLeft(2, '0')}.'
        '${birthDate.day.toString().padLeft(2, '0')}';
  }

  // ─────────────────────────────────────
  // 휴대폰 번호 표시
  // 01012345678 → 010-1234-5678
  // ─────────────────────────────────────

  String _formatPhone(String value) {
    final digits = _onlyDigits(value);

    if (digits.length == 11) {
      return '${digits.substring(0, 3)}-'
          '${digits.substring(3, 7)}-'
          '${digits.substring(7, 11)}';
    }

    if (digits.length == 10) {
      return '${digits.substring(0, 3)}-'
          '${digits.substring(3, 6)}-'
          '${digits.substring(6, 10)}';
    }

    return digits.isEmpty ? '-' : digits;
  }
}