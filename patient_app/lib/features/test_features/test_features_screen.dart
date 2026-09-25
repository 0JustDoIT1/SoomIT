import 'package:flutter/material.dart';

import '../air_quality/widgets/air_quality_card.dart';
import '../hospital_directions/hospital_directions_screen.dart';
import '../pharmacy/nearby_pharmacy_screen.dart';

class TestFeaturesScreen extends StatelessWidget {
  const TestFeaturesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('테스트 기능')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            '로그인 없이 기능을 확인해요',
            style: TextStyle(
              color: Color(0xFF172033),
              fontSize: 22,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            '로그인 연동 전까지 주요 기능을 기기에서 테스트할 수 있습니다.',
            style: TextStyle(color: Color(0xFF748198), height: 1.5),
          ),
          const SizedBox(height: 24),
          const AirQualityCard(),
          const SizedBox(height: 20),
          Card(
            elevation: 0,
            color: const Color(0xFFF1F8FF),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
              side: const BorderSide(color: Color(0xFFD9ECFF)),
            ),
            child: InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const NearbyPharmacyScreen(),
                  ),
                );
              },
              child: const Padding(
                padding: EdgeInsets.all(20),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 28,
                      backgroundColor: Colors.white,
                      child: Icon(
                        Icons.local_pharmacy_rounded,
                        color: Color(0xFF3198F4),
                        size: 30,
                      ),
                    ),
                    SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '내 주변 약국 찾기',
                            style: TextStyle(
                              color: Color(0xFF172033),
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          SizedBox(height: 5),
                          Text(
                            '현재 기기 위치에서 가까운 약국을 지도에서 확인해요.',
                            style: TextStyle(
                              color: Color(0xFF748198),
                              height: 1.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_right_rounded, color: Color(0xFF7F91A8)),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Card(
            elevation: 0,
            color: const Color(0xFFF0FBF5),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
              side: const BorderSide(color: Color(0xFFC9F1D9)),
            ),
            child: InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const HospitalDirectionsScreen(),
                  ),
                );
              },
              child: const Padding(
                padding: EdgeInsets.all(20),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 28,
                      backgroundColor: Colors.white,
                      child: Icon(
                        Icons.directions_rounded,
                        color: Color(0xFF03C75A),
                        size: 30,
                      ),
                    ),
                    SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '병원 길찾기',
                            style: TextStyle(
                              color: Color(0xFF172033),
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          SizedBox(height: 5),
                          Text(
                            '현재 위치 또는 집주소에서 병원까지 길을 찾아요.',
                            style: TextStyle(
                              color: Color(0xFF748198),
                              height: 1.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_right_rounded, color: Color(0xFF7F91A8)),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
