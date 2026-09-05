import 'package:flutter/material.dart';

import '../home/models/patient_profile.dart';
import '../home/services/profile_service.dart';
import 'patient_info_screen.dart';

class MyPageScreen extends StatefulWidget {
  const MyPageScreen({super.key});

  @override
  State<MyPageScreen> createState() => _MyPageScreenState();
}

class _MyPageScreenState extends State<MyPageScreen> {
  final ProfileService _profileService = ProfileService();

  late Future<PatientProfile> _profileFuture;

  @override
  void initState() {
    super.initState();
    _profileFuture = _profileService.getProfile();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: FutureBuilder<PatientProfile>(
        future: _profileFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(
              child: CircularProgressIndicator(),
            );
          }

          if (snapshot.hasError) {
            return _buildError();
          }

          final profile = snapshot.data;

          if (profile == null) {
            return _buildError();
          }

          return SingleChildScrollView(
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 30),
            child: Column(
              children: [
                _buildProfileCard(profile),

                const SizedBox(height: 14),

                _buildQuickMenu(),

                const SizedBox(height: 14),

                _buildMenuList(),

                const SizedBox(height: 14),

                _buildLogoutButton(),
              ],
            ),
          );
        },
      ),
    );
  }

  // ─────────────────────────────────────────────
  // 상단 프로필
  // ─────────────────────────────────────────────
  Widget _buildProfileCard(PatientProfile profile) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF3B82F6),
            Color(0xFF2563EB),
          ],
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF2563EB)
                .withValues(alpha: 0.18),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.95),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.person_rounded,
              size: 42,
              color: Color(0xFFB8C2D1),
            ),
          ),

          const SizedBox(width: 16),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  profile.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),

                const SizedBox(height: 5),

                Text(
                  profile.patientCode,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.9),
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),

                if (profile.hospitalName != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    profile.hospitalName!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.75),
                      fontSize: 12,
                    ),
                  ),
                ],
              ],
            ),
          ),

          const Icon(
            Icons.chevron_right_rounded,
            color: Colors.white,
            size: 28,
          ),
        ],
      ),
    );
  }

  // ─────────────────────────────────────────────
  // QR / 프로필 / 알림
  // ─────────────────────────────────────────────
  Widget _buildQuickMenu() {
    return Container(
      padding: const EdgeInsets.symmetric(
        vertical: 16,
        horizontal: 8,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: const Color(0xFFE5EAF0),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: _buildQuickMenuItem(
              icon: Icons.qr_code_2_rounded,
              title: 'QR 코드',
              onTap: () {
                // TODO: QR 코드 화면
              },
            ),
          ),

          _buildDivider(),

          Expanded(
            child: _buildQuickMenuItem(
              icon: Icons.person_outline_rounded,
              title: '프로필 관리',
              onTap: () {
                // TODO: 프로필 관리
              },
            ),
          ),

          _buildDivider(),

          Expanded(
            child: _buildQuickMenuItem(
              icon: Icons.notifications_none_rounded,
              title: '알림 설정',
              onTap: () {
                // TODO: 알림 설정
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickMenuItem({
    required IconData icon,
    required String title,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Column(
          children: [
            Icon(
              icon,
              size: 26,
              color: const Color(0xFF334155),
            ),
            const SizedBox(height: 7),
            Text(
              title,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Color(0xFF334155),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDivider() {
    return Container(
      width: 1,
      height: 38,
      color: const Color(0xFFE8ECF2),
    );
  }

  // ─────────────────────────────────────────────
  // 메뉴
  // ─────────────────────────────────────────────
  Widget _buildMenuList() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: const Color(0xFFE5EAF0),
        ),
      ),
      child: Column(
        children: [
          _buildMenuItem(
            icon: Icons.person_outline_rounded,
            title: '환자 정보',
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) =>
                      const PatientInfoScreen(),
                ),
              );
            },
          ),

          _menuDivider(),

          _buildMenuItem(
            icon: Icons.assignment_outlined,
            title: '문진표 작성 내역',
            onTap: () {
              // TODO
            },
          ),

          _menuDivider(),

          _buildMenuItem(
            icon: Icons.language_rounded,
            title: '언어 설정',
            trailingText: '한국어',
            onTap: () {
              // TODO
            },
          ),

          _menuDivider(),

          _buildMenuItem(
            icon: Icons.settings_outlined,
            title: '설정',
            onTap: () {
              // TODO
            },
          ),
        ],
      ),
    );
  }

  Widget _buildMenuItem({
    required IconData icon,
    required String title,
    String? trailingText,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 15,
        ),
        child: Row(
          children: [
            Icon(
              icon,
              size: 21,
              color: const Color(0xFF475569),
            ),

            const SizedBox(width: 12),

            Expanded(
              child: Text(
                title,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFF27364B),
                ),
              ),
            ),

            if (trailingText != null) ...[
              Text(
                trailingText,
                style: const TextStyle(
                  fontSize: 12,
                  color: Color(0xFF8B95A1),
                ),
              ),
              const SizedBox(width: 4),
            ],

            const Icon(
              Icons.chevron_right_rounded,
              size: 20,
              color: Color(0xFFAAB2BD),
            ),
          ],
        ),
      ),
    );
  }

  Widget _menuDivider() {
    return const Divider(
      height: 1,
      indent: 16,
      endIndent: 16,
      color: Color(0xFFEEF1F5),
    );
  }

  // ─────────────────────────────────────────────
  // 로그아웃
  // ─────────────────────────────────────────────
  Widget _buildLogoutButton() {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: OutlinedButton(
        onPressed: () {
          // TODO: 로그인 구현 후 로그아웃 연결
        },
        style: OutlinedButton.styleFrom(
          foregroundColor: const Color(0xFFFF4D5A),
          side: const BorderSide(
            color: Color(0xFFFFCDD1),
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: const Text(
          '로그아웃',
          style: TextStyle(
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }

  Widget _buildError() {
    return const Center(
      child: Text(
        '환자 정보를 불러오지 못했습니다.',
        style: TextStyle(
          color: Color(0xFF8B95A1),
        ),
      ),
    );
  }
}