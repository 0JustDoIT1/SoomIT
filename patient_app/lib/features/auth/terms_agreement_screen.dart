import 'package:flutter/material.dart';

import 'profile_registration_screen.dart';

class TermsAgreementScreen extends StatefulWidget {
  final String registrationToken;
  final String? initialName;

  const TermsAgreementScreen({
    super.key,
    required this.registrationToken,
    this.initialName,
  });

  @override
  State<TermsAgreementScreen> createState() => _TermsAgreementScreenState();
}

class _TermsAgreementScreenState extends State<TermsAgreementScreen> {
  static const Color _background = Color(0xFFF4F8FC);
  static const Color _surface = Colors.white;
  static const Color _primary = Color(0xFF2F80ED);
  static const Color _strongBlue = Color(0xFF1689F5);
  static const Color _textPrimary = Color(0xFF172033);
  static const Color _textSecondary = Color(0xFF748198);
  static const Color _border = Color(0xFFE3EBF3);

  bool _termsAgreed = false;
  bool _privacyAgreed = false;
  bool _sensitiveAgreed = false;
  bool _pushAgreed = false;

  bool get _requiredAgreed =>
      _termsAgreed && _privacyAgreed && _sensitiveAgreed;

  bool get _allAgreed =>
      _termsAgreed &&
      _privacyAgreed &&
      _sensitiveAgreed &&
      _pushAgreed;

  void _toggleAll(bool value) {
    setState(() {
      _termsAgreed = value;
      _privacyAgreed = value;
      _sensitiveAgreed = value;
      _pushAgreed = value;
    });
  }

  void _openDocument(AgreementDocumentType type) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => AgreementDocumentScreen(type: type),
      ),
    );
  }

  void _continue() {
    if (!_requiredAgreed) return;

    // TODO:
    // 동의 이력 저장 API가 준비되면 아래 항목을 서버에 저장:
    // - 서비스 이용약관 동의
    // - 개인정보 수집·이용 동의
    // - 건강정보 등 민감정보 처리 동의
    // - 푸시 알림 수신 동의
    // - 동의 일시 / 약관 버전
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) {
          return ProfileRegistrationScreen(
            registrationToken: widget.registrationToken,
            initialName: widget.initialName,
          );
        },
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
          '서비스 이용 동의',
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
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                physics: const ClampingScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(18, 10, 18, 18),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 430),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _buildHeroCard(),
                        const SizedBox(height: 18),
                        _buildSectionTitle('서비스 이용을 위한 필수 동의'),
                        const SizedBox(height: 10),
                        _buildAgreementGroup(
                          children: [
                            _AgreementRow(
                              checked: _termsAgreed,
                              required: true,
                              title: '숨-잇 서비스 이용약관',
                              subtitle: '서비스 이용에 필요한 약관입니다.',
                              onChanged: (value) {
                                setState(() {
                                  _termsAgreed = value;
                                });
                              },
                              onOpen: () => _openDocument(
                                AgreementDocumentType.terms,
                              ),
                            ),
                            const _AgreementDivider(),
                            _AgreementRow(
                              checked: _privacyAgreed,
                              required: true,
                              title: '개인정보 수집·이용 동의',
                              subtitle: '회원 식별 및 환자정보 연결을 위해 필요합니다.',
                              onChanged: (value) {
                                setState(() {
                                  _privacyAgreed = value;
                                });
                              },
                              onOpen: () => _openDocument(
                                AgreementDocumentType.privacy,
                              ),
                            ),
                            const _AgreementDivider(),
                            _AgreementRow(
                              checked: _sensitiveAgreed,
                              required: true,
                              title: '건강정보 등 민감정보 처리 동의',
                              subtitle: '진료·검사·처방 등 의료정보 연계를 위해 필요합니다.',
                              onChanged: (value) {
                                setState(() {
                                  _sensitiveAgreed = value;
                                });
                              },
                              onOpen: () => _openDocument(
                                AgreementDocumentType.sensitive,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 20),
                        _buildSectionTitle('선택 동의'),
                        const SizedBox(height: 10),
                        _buildAgreementGroup(
                          children: [
                            _AgreementRow(
                              checked: _pushAgreed,
                              required: false,
                              title: '푸시 알림 수신 동의',
                              subtitle: '예약·복약·검사결과 등 주요 알림을 받을 수 있어요.',
                              onChanged: (value) {
                                setState(() {
                                  _pushAgreed = value;
                                });
                              },
                              onOpen: () => _openDocument(
                                AgreementDocumentType.push,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),
                        _buildAllAgreementCard(),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            _buildContinueArea(),
          ],
        ),
      ),
    );
  }

  Widget _buildHeroCard() {
    return Container(
      height: 158,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFFEAF7FF),
            Color(0xFFDDF2FF),
          ],
        ),
        border: Border.all(
          color: const Color(0xFFDDEFFC),
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            right: -36,
            top: -48,
            child: Container(
              width: 155,
              height: 155,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.25),
              ),
            ),
          ),
          const Positioned(
            left: 22,
            top: 30,
            right: 138,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: '안전한 의료 서비스를 위해\n',
                        style: TextStyle(color: _textPrimary),
                      ),
                      TextSpan(
                        text: '약관에 동의해주세요.',
                        style: TextStyle(color: _strongBlue),
                      ),
                    ],
                  ),
                  style: TextStyle(
                    fontSize: 20,
                    height: 1.28,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.6,
                  ),
                ),
                SizedBox(height: 10),
                Text(
                  '고객님의 소중한 정보는\n더 나은 의료 서비스를 위해 사용됩니다.',
                  style: TextStyle(
                    color: _textSecondary,
                    fontSize: 12,
                    height: 1.55,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          Positioned(
            right: 5,
            bottom: -5,
            child: Image.asset(
              'assets/images/동의_숨이.png',
              width: 145,
              height: 145,
              fit: BoxFit.contain,
              errorBuilder: (context, error, stackTrace) {
                return const SizedBox(
                  width: 132,
                  height: 132,
                );
              },
            ),
          ),
          Positioned(
            right: 122,
            top: 58,
            child: Icon(
              Icons.favorite_rounded,
              size: 16,
              color: Colors.white.withValues(alpha: 0.88),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 3),
      child: Text(
        title,
        style: const TextStyle(
          color: _primary,
          fontSize: 14.5,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.2,
        ),
      ),
    );
  }

  Widget _buildAgreementGroup({
    required List<Widget> children,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _border),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF6F8EAE).withValues(alpha: 0.04),
            blurRadius: 16,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(children: children),
    );
  }

  Widget _buildAllAgreementCard() {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () => _toggleAll(!_allAgreed),
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 14, 12, 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: _allAgreed
                  ? const Color(0xFFB7D7FF)
                  : _border,
            ),
          ),
          child: Row(
            children: [
              _AgreementCheckbox(
                checked: _allAgreed,
                onTap: () => _toggleAll(!_allAgreed),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '전체 동의',
                      style: TextStyle(
                        color: _textPrimary,
                        fontSize: 14.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    SizedBox(height: 3),
                    Text(
                      '필수 및 선택 항목에 모두 동의합니다.',
                      style: TextStyle(
                        color: _textSecondary,
                        fontSize: 11.5,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildContinueArea() {
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 14),
      decoration: BoxDecoration(
        color: _background,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.035),
            blurRadius: 10,
            offset: const Offset(0, -3),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: SizedBox(
              width: double.infinity,
              height: 54,
              child: FilledButton(
                onPressed: _requiredAgreed ? _continue : null,
                style: FilledButton.styleFrom(
                  backgroundColor: _primary,
                  disabledBackgroundColor: const Color(0xFFD4DFEC),
                  foregroundColor: Colors.white,
                  disabledForegroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: const Text(
                  '동의하고 계속하기',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AgreementRow extends StatelessWidget {
  final bool checked;
  final bool required;
  final String title;
  final String subtitle;
  final ValueChanged<bool> onChanged;
  final VoidCallback onOpen;

  const _AgreementRow({
    required this.checked,
    required this.required,
    required this.title,
    required this.subtitle,
    required this.onChanged,
    required this.onOpen,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(13, 12, 8, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _AgreementCheckbox(
            checked: checked,
            onTap: () => onChanged(!checked),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => onChanged(!checked),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: required ? '[필수] ' : '[선택] ',
                            style: const TextStyle(
                              color: Color(0xFF1689F5),
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          TextSpan(
                            text: title,
                            style: const TextStyle(
                              color: Color(0xFF243248),
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                      style: const TextStyle(
                        fontSize: 13.5,
                        height: 1.3,
                        letterSpacing: -0.15,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        color: Color(0xFF8B98AA),
                        fontSize: 10.8,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          IconButton(
            onPressed: onOpen,
            visualDensity: VisualDensity.compact,
            splashRadius: 20,
            icon: const Icon(
              Icons.chevron_right_rounded,
              color: Color(0xFF8AA0B6),
              size: 22,
            ),
          ),
        ],
      ),
    );
  }
}

class _AgreementCheckbox extends StatelessWidget {
  final bool checked;
  final VoidCallback onTap;

  const _AgreementCheckbox({
    required this.checked,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      checked: checked,
      button: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(7),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          width: 27,
          height: 27,
          decoration: BoxDecoration(
            color: checked
                ? const Color(0xFF2F80ED)
                : Colors.white,
            borderRadius: BorderRadius.circular(7),
            border: Border.all(
              color: checked
                  ? const Color(0xFF2F80ED)
                  : const Color(0xFFB9C8D8),
              width: 1.6,
            ),
          ),
          child: checked
              ? const Icon(
                  Icons.check_rounded,
                  color: Colors.white,
                  size: 19,
                )
              : null,
        ),
      ),
    );
  }
}

class _AgreementDivider extends StatelessWidget {
  const _AgreementDivider();

  @override
  Widget build(BuildContext context) {
    return const Divider(
      height: 1,
      indent: 52,
      endIndent: 12,
      color: Color(0xFFEDF2F7),
    );
  }
}

enum AgreementDocumentType {
  terms,
  privacy,
  sensitive,
  push,
}

class AgreementDocumentScreen extends StatelessWidget {
  final AgreementDocumentType type;

  const AgreementDocumentScreen({
    super.key,
    required this.type,
  });

  String get _title {
    switch (type) {
      case AgreementDocumentType.terms:
        return '숨-잇 서비스 이용약관';
      case AgreementDocumentType.privacy:
        return '개인정보 수집·이용 동의';
      case AgreementDocumentType.sensitive:
        return '건강정보 등 민감정보 처리 동의';
      case AgreementDocumentType.push:
        return '푸시 알림 수신 동의';
    }
  }

  String get _versionText {
    switch (type) {
      case AgreementDocumentType.terms:
      case AgreementDocumentType.privacy:
      case AgreementDocumentType.sensitive:
        return '최종 수정일 2026. 09. 01.';
      case AgreementDocumentType.push:
        return '선택 동의 항목';
    }
  }

  List<_AgreementSection> get _sections {
    switch (type) {
      case AgreementDocumentType.terms:
        return const [
          _AgreementSection(
            title: '1. 목적',
            body:
                '이 약관은 숨-잇(Soom-it) 환자용 애플리케이션에서 제공하는 건강관리 및 병원 연동 서비스의 이용 조건과 사용자 및 서비스 운영 주체의 기본적인 권리·의무를 정하는 것을 목적으로 합니다.',
          ),
          _AgreementSection(
            title: '2. 주요 서비스',
            body:
                '숨-잇은 환자가 자신의 건강 관련 정보를 보다 편리하게 확인하고 기록할 수 있도록 다음 기능을 제공합니다.\n\n'
                '• 병원 환자정보 연결 및 본인 정보 확인\n'
                '• 진료 예약 요청 및 일정 확인\n'
                '• 검사 일정과 검사 결과 확인\n'
                '• 복약 일정 및 복용 기록 관리\n'
                '• 증상 기록, 문진표 작성, 건강 리포트 확인\n'
                '• 의료진 또는 병원과의 서비스 내 소통 기능\n'
                '• 건강 관련 안내 및 AI 기반 정보 제공 기능',
          ),
          _AgreementSection(
            title: '3. 의료행위에 대한 안내',
            body:
                '숨-잇에서 제공하는 증상 상태, 통계, 건강 리포트, AI 안내 등은 자기관리와 정보 확인을 돕기 위한 참고 정보이며 의료진의 진단, 처방 또는 응급의료 판단을 대신하지 않습니다.\n\n'
                '증상이 지속되거나 악화되거나 응급상황이 의심되는 경우에는 앱의 안내에만 의존하지 말고 의료진, 의료기관 또는 119 등 적절한 응급의료체계를 이용해야 합니다.',
          ),
          _AgreementSection(
            title: '4. 계정 및 환자 연결',
            body:
                '사용자는 본인의 계정과 환자정보를 정확하게 사용해야 하며, 타인의 환자번호 또는 인증정보를 사용해서는 안 됩니다. 계정 또는 앱 잠금정보의 관리 책임은 사용자에게 있으며, 비정상적인 사용이 확인되는 경우 서비스 이용이 제한될 수 있습니다.',
          ),
          _AgreementSection(
            title: '5. 건강정보 기록',
            body:
                '사용자가 직접 입력한 증상, 복약 완료 여부, 문진 답변 등의 정보는 사용자가 입력한 내용을 바탕으로 저장됩니다. 정확한 건강관리를 위해 실제 상태와 다른 정보를 고의로 입력하거나 타인의 정보를 등록해서는 안 됩니다.',
          ),
          _AgreementSection(
            title: '6. 서비스 이용 제한 및 변경',
            body:
                '점검, 시스템 장애, 의료기관 연동 상태 또는 네트워크 환경 등에 따라 일부 기능이 일시적으로 제한될 수 있습니다. 서비스 기능이나 화면 구성은 안정성 및 사용성 개선을 위해 변경될 수 있으며 중요한 변경사항은 적절한 방법으로 안내합니다.',
          ),
          _AgreementSection(
            title: '7. 개인정보 보호',
            body:
                '서비스 이용 과정에서 처리되는 개인정보와 건강 관련 정보는 개인정보 처리방침에 따라 관리합니다.',
          ),
          _AgreementSection(
            title: '8. 약관의 변경',
            body:
                '약관 내용이 변경되는 경우 변경 사유와 적용일을 서비스 내 공지 등 적절한 방법으로 안내합니다.',
          ),
        ];

      case AgreementDocumentType.privacy:
        return const [
          _AgreementSection(
            title: '1. 수집·이용하는 개인정보',
            body:
                '숨-잇은 회원 및 환자 연결, 건강관리 기능 제공을 위해 서비스 이용 과정에서 필요한 정보를 처리할 수 있습니다.\n\n'
                '• 계정 정보: 이름, 이메일, 로그인 식별정보\n'
                '• 환자 기본정보: 환자번호, 생년월일, 성별, 연락처 등 병원 연결에 필요한 정보\n'
                '• 서비스 이용 정보: 알림 설정, 앱 잠금 및 환경설정 정보',
          ),
          _AgreementSection(
            title: '2. 이용 목적',
            body:
                '• 환자 본인 확인 및 병원 환자정보 연결\n'
                '• 진료 예약 및 일정 확인\n'
                '• 검사 일정·결과 확인\n'
                '• 복약 일정과 복용 기록 관리\n'
                '• 증상 및 문진 기록 관리와 건강 리포트 제공\n'
                '• 중요 알림 및 서비스 안내 제공\n'
                '• 서비스 오류 확인과 보안 유지',
          ),
          _AgreementSection(
            title: '3. 보관 및 파기',
            body:
                '개인정보는 서비스 제공 목적이 달성되거나 회원 탈퇴 등으로 보관 필요성이 없어지면 지체 없이 파기하는 것을 원칙으로 합니다. 다만 관계 법령 또는 의료기관의 정당한 보관 의무가 있는 정보는 해당 기간 동안 분리하여 보관할 수 있습니다.',
          ),
          _AgreementSection(
            title: '4. 제3자 제공 및 병원 연동',
            body:
                '숨-잇은 사용자가 연결한 의료기관의 진료·예약·검사·복약 정보를 앱에서 확인할 수 있도록 연동될 수 있습니다. 개인정보를 제3자에게 제공해야 하는 경우에는 법적 근거가 있거나 사용자의 별도 동의를 받은 범위에서 처리하는 것을 원칙으로 합니다.',
          ),
          _AgreementSection(
            title: '5. 이용자의 권리',
            body:
                '사용자는 본인의 개인정보에 대해 열람, 정정, 삭제 또는 처리 제한을 요청할 수 있습니다. 의료기관에서 생성·관리하는 진료정보는 해당 의료기관의 관련 절차가 적용될 수 있습니다.',
          ),
        ];

      case AgreementDocumentType.sensitive:
        return const [
          _AgreementSection(
            title: '1. 처리하는 민감정보',
            body:
                '건강 관련 정보는 민감한 정보에 해당하므로 서비스 제공에 필요한 범위에서만 처리하는 것을 원칙으로 합니다.\n\n'
                '• 증상 기록\n'
                '• 문진표\n'
                '• 복약 일정 및 복용 기록\n'
                '• 진료 예약 정보\n'
                '• 검사 일정 및 검사 결과\n'
                '• 병원 연동 과정에서 제공되는 건강 관련 정보',
          ),
          _AgreementSection(
            title: '2. 처리 목적',
            body:
                '• 환자 본인 확인 및 병원 환자정보 연결\n'
                '• 진료 예약 및 일정 확인\n'
                '• 검사 일정·결과 확인\n'
                '• 복약 일정과 복용 기록 관리\n'
                '• 증상 및 문진 기록 관리와 건강 리포트 제공',
          ),
          _AgreementSection(
            title: '3. 정보 보호',
            body:
                '숨-잇은 인증 토큰 관리, 접근권한 제한, 앱 잠금, 통신 구간 보호 등 개인정보와 건강정보를 안전하게 처리하기 위한 기술적·관리적 보호조치를 적용하도록 설계합니다.',
          ),
          _AgreementSection(
            title: '4. 동의 안내',
            body:
                '건강정보 등 민감정보 처리는 환자 연결 및 건강관리 기능 제공을 위해 필요한 항목입니다.',
          ),
        ];

      case AgreementDocumentType.push:
        return const [
          _AgreementSection(
            title: '1. 수신 항목',
            body:
                '예약, 복약, 검사결과 등 숨-잇 서비스 이용에 도움이 되는 주요 푸시 알림을 받을 수 있습니다.',
          ),
          _AgreementSection(
            title: '2. 선택 동의 안내',
            body:
                '푸시 알림 수신 동의는 선택 항목이며, 동의하지 않아도 기본 서비스 이용에는 영향을 주지 않습니다. 다만 알림을 끄면 예약·복약·검사결과 등 일부 안내를 즉시 받지 못할 수 있습니다.',
          ),
          _AgreementSection(
            title: '3. 변경',
            body:
                '가입 후에도 마이페이지의 알림 설정에서 수신 여부를 변경할 수 있도록 구성합니다.',
          ),
        ];
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F8FC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        foregroundColor: const Color(0xFF172033),
        title: Text(
          _title,
          style: const TextStyle(
            color: Color(0xFF172033),
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
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
              children: [
                Container(
                  padding: const EdgeInsets.all(17),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(
                      color: const Color(0xFFE3EBF3),
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 45,
                        height: 45,
                        decoration: BoxDecoration(
                          color: const Color(0xFFEAF4FF),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: const Icon(
                          Icons.description_outlined,
                          color: Color(0xFF2F80ED),
                          size: 24,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _title,
                              style: const TextStyle(
                                color: Color(0xFF243248),
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _versionText,
                              style: const TextStyle(
                                color: Color(0xFF8A98A9),
                                fontSize: 11.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                for (final section in _sections) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(17),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(
                        color: const Color(0xFFE3EBF3),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          section.title,
                          style: const TextStyle(
                            color: Color(0xFF243248),
                            fontSize: 14.5,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 9),
                        Text(
                          section.body,
                          style: const TextStyle(
                            color: Color(0xFF5E6D80),
                            fontSize: 12.5,
                            height: 1.7,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                ],
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 8, 18, 14),
              child: SizedBox(
                width: double.infinity,
                height: 54,
                child: FilledButton(
                  onPressed: () => Navigator.of(context).pop(),
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF2F80ED),
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: const Text(
                    '확인하고 돌아가기',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AgreementSection {
  final String title;
  final String body;

  const _AgreementSection({
    required this.title,
    required this.body,
  });
}
