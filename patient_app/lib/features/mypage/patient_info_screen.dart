import 'package:flutter/material.dart';

import '../home/models/patient_profile.dart';
import '../home/services/profile_service.dart';

class PatientInfoScreen extends StatefulWidget {
  const PatientInfoScreen({super.key});

  @override
  State<PatientInfoScreen> createState() => _PatientInfoScreenState();
}

class _PatientInfoScreenState extends State<PatientInfoScreen> {
  final ProfileService _profileService = ProfileService();

  late Future<PatientProfile> _profileFuture;

  @override
  void initState() {
    super.initState();
    _profileFuture = _profileService.getProfile();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F6F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        centerTitle: true,
        title: const Text(
          '환자 정보',
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
      body: FutureBuilder<PatientProfile>(
        future: _profileFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState ==
              ConnectionState.waiting) {
            return const Center(
              child: CircularProgressIndicator(),
            );
          }

          if (snapshot.hasError) {
            return const Center(
              child: Text(
                '환자 정보를 불러오지 못했습니다.',
                style: TextStyle(
                  color: Color(0xFF8B95A1),
                ),
              ),
            );
          }

          final profile = snapshot.data;

          if (profile == null) {
            return const Center(
              child: Text(
                '환자 정보가 없습니다.',
              ),
            );
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildProfileHeader(profile),

                const SizedBox(height: 20),

                _buildInfoCard(
                  children: [
                    _buildInfoRow(
                      label: '환자번호',
                      value: profile.patientCode,
                    ),
                    _divider(),
                    _buildInfoRow(
                      label: '이름',
                      value: profile.name,
                    ),
                    _divider(),
                    _buildInfoRow(
                      label: '생년월일',
                      value: _formatBirthDate(
                        profile.birthDate,
                      ),
                    ),
                    _divider(),
                    _buildInfoRow(
                      label: '성별',
                      value: profile.sexLabel,
                    ),
                  ],
                ),

                const SizedBox(height: 14),

                _buildInfoCard(
                  children: [
                    _buildInfoRow(
                      label: '전화번호',
                      value: profile.phoneNumber ?? '-',
                    ),
                    _divider(),
                    _buildInfoRow(
                      label: '주소',
                      value: profile.address ?? '-',
                    ),
                    _divider(),
                    _buildInfoRow(
                      label: '등록 병원',
                      value: profile.hospitalName ?? '-',
                    ),
                  ],
                ),

                const SizedBox(height: 14),

                _buildInfoCard(
                  children: [
                    _buildInfoRow(
                      label: '앱 연결 상태',
                      value: _getLinkStatusLabel(
                        profile.appLinkStatus,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildProfileHeader(
    PatientProfile profile,
  ) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          Container(
            width: 62,
            height: 62,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: Color(0xFFEAF2FF),
            ),
            child: const Icon(
              Icons.person_rounded,
              size: 38,
              color: Color(0xFF3B82F6),
            ),
          ),

          const SizedBox(width: 16),

          Expanded(
            child: Column(
              crossAxisAlignment:
                  CrossAxisAlignment.start,
              children: [
                Text(
                  profile.name,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF191F28),
                  ),
                ),

                const SizedBox(height: 5),

                Text(
                  profile.patientCode,
                  style: const TextStyle(
                    fontSize: 13,
                    color: Color(0xFF8B95A1),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoCard({
    required List<Widget> children,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: 18,
        vertical: 4,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: children,
      ),
    );
  }

  Widget _buildInfoRow({
    required String label,
    required String value,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        vertical: 15,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
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

          const SizedBox(width: 12),

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

  String _getLinkStatusLabel(
    String status,
  ) {
    switch (status) {
      case 'LINKED':
        return '연결됨';

      case 'PENDING_REVIEW':
        return '확인 대기';

      case 'REJECTED':
        return '연결 거부';

      case 'UNLINKED':
      default:
        return '미연결';
    }
  }
}