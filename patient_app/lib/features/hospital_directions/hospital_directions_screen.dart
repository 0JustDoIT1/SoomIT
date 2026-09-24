import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

import 'models/hospital_destination.dart';
import 'services/hospital_directions_service.dart';

class HospitalDirectionsScreen extends StatefulWidget {
  const HospitalDirectionsScreen({super.key});

  @override
  State<HospitalDirectionsScreen> createState() =>
      _HospitalDirectionsScreenState();
}

class _HospitalDirectionsScreenState extends State<HospitalDirectionsScreen> {
  static const _naverGreen = Color(0xFF03C75A);
  static const _testHomeAddress = '대전광역시 서구 둔산로 100';
  static const _testHomeLatitude = 36.3504119;
  static const _testHomeLongitude = 127.3845475;

  final _service = HospitalDirectionsService();

  List<HospitalDestination> _hospitals = const [];
  HospitalDestination? _selectedHospital;
  String? _errorMessage;
  bool _isLoading = true;
  bool _isOpeningRoute = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      final hospitals = await _service.getHospitals();

      if (!mounted) return;
      setState(() {
        _hospitals = hospitals;
        _selectedHospital = hospitals.firstOrNull;
        _isLoading = false;
        if (hospitals.isEmpty) {
          _errorMessage = '위치가 등록된 병원이 없습니다.';
        }
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _errorMessage = error.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<Position> _determinePosition() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw const HospitalDirectionsException('휴대폰의 위치 서비스를 켜주세요.');
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied) {
      throw const HospitalDirectionsException('현재 위치를 사용하려면 위치 권한이 필요합니다.');
    }
    if (permission == LocationPermission.deniedForever) {
      throw const HospitalDirectionsException('설정에서 위치 권한을 허용한 뒤 다시 시도해주세요.');
    }

    return Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 15),
      ),
    );
  }

  Future<void> _routeFromCurrentLocation() async {
    final hospital = _selectedHospital;
    if (hospital == null || _isOpeningRoute) return;

    setState(() => _isOpeningRoute = true);
    try {
      final position = await _determinePosition();
      await _openNaverDirections(
        startName: '현재 위치',
        startLatitude: position.latitude,
        startLongitude: position.longitude,
        hospital: hospital,
      );
    } catch (error) {
      if (mounted) {
        _showMessage(error.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _isOpeningRoute = false);
    }
  }

  Future<void> _routeFromHome() async {
    final hospital = _selectedHospital;
    if (hospital == null || _isOpeningRoute) return;

    setState(() => _isOpeningRoute = true);
    try {
      await _openNaverDirections(
        startName: '테스트 집주소',
        startLatitude: _testHomeLatitude,
        startLongitude: _testHomeLongitude,
        hospital: hospital,
      );
    } finally {
      if (mounted) setState(() => _isOpeningRoute = false);
    }
  }

  Future<void> _openNaverDirections({
    required String startName,
    required double startLatitude,
    required double startLongitude,
    required HospitalDestination hospital,
  }) async {
    final appUri = Uri(
      scheme: 'nmap',
      host: 'route',
      path: '/public',
      queryParameters: {
        'slat': startLatitude.toString(),
        'slng': startLongitude.toString(),
        'sname': startName,
        'dlat': hospital.latitude.toString(),
        'dlng': hospital.longitude.toString(),
        'dname': hospital.name,
        'appname': 'com.soomit.patient',
      },
    );

    try {
      if (await canLaunchUrl(appUri) &&
          await launchUrl(appUri, mode: LaunchMode.externalApplication)) {
        return;
      }
    } catch (_) {
      // 네이버지도 앱을 실행할 수 없으면 웹 길찾기로 이동한다.
    }

    final start = [
      startLongitude,
      startLatitude,
      Uri.encodeComponent(startName),
      '',
      'PLACE_POI',
    ].join(',');
    final destination = [
      hospital.longitude,
      hospital.latitude,
      Uri.encodeComponent(hospital.name),
      '',
      'PLACE_POI',
    ].join(',');
    final webUri = Uri.parse(
      'https://map.naver.com/p/directions/$start/$destination/-/transit',
    );

    try {
      if (await launchUrl(webUri, mode: LaunchMode.externalApplication)) return;
    } catch (_) {
      // 아래 안내 메시지로 처리한다.
    }

    if (mounted) _showMessage('네이버지도 앱이나 브라우저를 열 수 없습니다.');
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('병원 길찾기')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
          ? _ErrorView(message: _errorMessage!, onRetry: _loadData)
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                const Text(
                  '도착할 병원',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<HospitalDestination>(
                  initialValue: _selectedHospital,
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.local_hospital_rounded),
                  ),
                  items: _hospitals
                      .map(
                        (hospital) => DropdownMenuItem(
                          value: hospital,
                          child: Text(hospital.name),
                        ),
                      )
                      .toList(),
                  onChanged: (hospital) {
                    setState(() => _selectedHospital = hospital);
                  },
                ),
                if (_selectedHospital?.address.isNotEmpty == true) ...[
                  const SizedBox(height: 10),
                  Text(
                    _selectedHospital!.address,
                    style: const TextStyle(color: Color(0xFF748198)),
                  ),
                ],
                const SizedBox(height: 28),
                _DirectionCard(
                  icon: Icons.my_location_rounded,
                  title: '현재 위치에서 길찾기',
                  description: '기기의 현재 GPS 위치에서 병원까지 안내합니다.',
                  onPressed: _isOpeningRoute ? null : _routeFromCurrentLocation,
                ),
                const SizedBox(height: 14),
                _DirectionCard(
                  icon: Icons.home_rounded,
                  title: '내 집주소에서 길찾기',
                  description: '테스트 주소: $_testHomeAddress',
                  onPressed: _isOpeningRoute ? null : _routeFromHome,
                ),
                if (_isOpeningRoute) ...[
                  const SizedBox(height: 24),
                  const Center(
                    child: CircularProgressIndicator(color: _naverGreen),
                  ),
                ],
                const SizedBox(height: 20),
                const Text(
                  '현재는 임의의 테스트 집주소를 사용합니다. 로그인 연동 후에는 환자 프로필에 저장된 집주소와 등록 병원을 사용해야 합니다.',
                  style: TextStyle(
                    color: Color(0xFF748198),
                    fontSize: 13,
                    height: 1.5,
                  ),
                ),
              ],
            ),
    );
  }
}

class _DirectionCard extends StatelessWidget {
  const _DirectionCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.onPressed,
  });

  final IconData icon;
  final String title;
  final String description;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: const Color(0xFFF0FBF5),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: Color(0xFFC9F1D9)),
      ),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            children: [
              CircleAvatar(
                backgroundColor: Colors.white,
                child: Icon(
                  icon,
                  color: _HospitalDirectionsScreenState._naverGreen,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: Color(0xFF172033),
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Color(0xFF748198),
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 42, color: Color(0xFFE56B6F)),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            TextButton(onPressed: onRetry, child: const Text('다시 시도')),
          ],
        ),
      ),
    );
  }
}
