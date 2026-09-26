import 'package:flutter/material.dart';
import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

import '../home/models/patient_profile.dart';
import '../home/services/profile_service.dart';
import 'models/hospital_destination.dart';
import 'services/hospital_directions_service.dart';

class HospitalDirectionsScreen extends StatefulWidget {
  const HospitalDirectionsScreen({super.key});

  @override
  State<HospitalDirectionsScreen> createState() =>
      _HospitalDirectionsScreenState();
}

class _HospitalDirectionsScreenState extends State<HospitalDirectionsScreen> {
  static const _strongBlue = Color(0xFF2F8DFE);
  static const _mint = Color(0xFF20C997);
  static const _background = Color(0xFFF5FAFF);
  static const _textPrimary = Color(0xFF172033);
  static const _textSecondary = Color(0xFF748198);

  final HospitalDirectionsService _hospitalService =
      HospitalDirectionsService();

  final ProfileService _profileService = ProfileService();

  final Geocoding _geocoding = Geocoding();

  List<HospitalDestination> _hospitals = const [];

  HospitalDestination? _selectedHospital;
  PatientProfile? _profile;

  String? _errorMessage;

  bool _isLoading = true;
  bool _isOpeningRoute = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  // =========================================================
  // 초기 데이터
  // =========================================================

  Future<void> _loadData() async {
    if (mounted) {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });
    }

    try {
      final results = await Future.wait<dynamic>([
        _hospitalService.getHospitals(),
        _profileService.getProfile(),
      ]);

      final hospitals = results[0] as List<HospitalDestination>;

      final profile = results[1] as PatientProfile;

      HospitalDestination? linkedHospital;

      final hospitalName = profile.hospitalName?.trim();

      if (hospitalName != null && hospitalName.isNotEmpty) {
        for (final hospital in hospitals) {
          if (hospital.name.trim() == hospitalName) {
            linkedHospital = hospital;
            break;
          }
        }
      }

      if (!mounted) return;

      setState(() {
        _hospitals = hospitals;
        _profile = profile;

        _selectedHospital =
            linkedHospital ?? (hospitals.isNotEmpty ? hospitals.first : null);

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

  // =========================================================
  // 현재 위치
  // =========================================================

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

  // =========================================================
  // 현재 위치 → 병원
  // =========================================================

  Future<void> _routeFromCurrentLocation() async {
    final hospital = _selectedHospital;

    if (hospital == null || _isOpeningRoute) {
      return;
    }

    setState(() {
      _isOpeningRoute = true;
    });

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
      if (mounted) {
        setState(() {
          _isOpeningRoute = false;
        });
      }
    }
  }

  // =========================================================
  // 환자 집주소 → 병원
  // =========================================================

  Future<void> _routeFromHome() async {
    final hospital = _selectedHospital;

    final profile = _profile;

    if (hospital == null || profile == null || _isOpeningRoute) {
      return;
    }

    final address = profile.address?.trim() ?? '';

    final detail = profile.addressDetail?.trim() ?? '';

    if (address.isEmpty) {
      _showMessage('등록된 집주소가 없습니다.');
      return;
    }

    final fullAddress = [
      address,
      detail,
    ].where((value) => value.isNotEmpty).join(' ');

    setState(() {
      _isOpeningRoute = true;
    });

    try {
      // 상세주소는 좌표검색에서 제외
      // 도로명/기본 주소만 좌표 변환
      final locations = await _geocoding.locationFromAddress(address);

      if (locations.isEmpty) {
        throw const HospitalDirectionsException('집주소의 위치를 찾을 수 없습니다.');
      }

      final home = locations.first;

      await _openNaverDirections(
        startName: fullAddress,
        startLatitude: home.latitude,
        startLongitude: home.longitude,
        hospital: hospital,
      );
    } catch (error) {
      if (mounted) {
        _showMessage(error.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) {
        setState(() {
          _isOpeningRoute = false;
        });
      }
    }
  }

  // =========================================================
  // 네이버 길찾기
  // =========================================================

  Future<void> _openNaverDirections({
    required String startName,
    required double startLatitude,
    required double startLongitude,
    required HospitalDestination hospital,
  }) async {
    // ---------------------------------------------------------
    // 네이버 지도 앱
    // ---------------------------------------------------------

    final appUri = Uri(
      scheme: 'nmap',
      host: 'route',
      path: '/car',
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
      if (await canLaunchUrl(appUri)) {
        final opened = await launchUrl(
          appUri,
          mode: LaunchMode.externalApplication,
        );

        if (opened) {
          return;
        }
      }
    } catch (_) {
      // 앱이 없으면 웹으로 이동
    }

    // ---------------------------------------------------------
    // 웹 fallback
    // ---------------------------------------------------------

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
      'https://map.naver.com/p/directions/'
      '$start/'
      '$destination/'
      '-/car',
    );

    try {
      final opened = await launchUrl(
        webUri,
        mode: LaunchMode.externalApplication,
      );

      if (opened) {
        return;
      }
    } catch (_) {
      // 아래 안내 메시지
    }

    if (mounted) {
      _showMessage('네이버지도 앱이나 브라우저를 열 수 없습니다.');
    }
  }

  // =========================================================
  // 환자 집주소 표시
  // =========================================================

  String get _homeAddressText {
    final profile = _profile;

    if (profile == null) {
      return '주소 정보를 불러오는 중입니다.';
    }

    final address = profile.address?.trim() ?? '';

    final detail = profile.addressDetail?.trim() ?? '';

    if (address.isEmpty) {
      return '등록된 집주소가 없습니다.';
    }

    return [address, detail].where((value) => value.isNotEmpty).join(' ');
  }

  // =========================================================
  // 메시지
  // =========================================================

  void _showMessage(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  // =========================================================
  // 병원 선택
  // =========================================================

  Future<void> _showHospitalSelector() async {
    final selected = await showModalBottomSheet<HospitalDestination>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) {
        return SafeArea(
          child: Container(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(context).size.height * 0.68,
            ),
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
            ),
            padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 42,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 18),
                  decoration: BoxDecoration(
                    color: const Color(0xFFD6DEE7),
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),

                const Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    '병원 선택',
                    style: TextStyle(
                      color: _textPrimary,
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),

                const SizedBox(height: 10),

                Flexible(
                  child: ListView.separated(
                    shrinkWrap: true,
                    itemCount: _hospitals.length,
                    separatorBuilder: (_, _) {
                      return const Divider(height: 1, color: Color(0xFFEEF3F7));
                    },
                    itemBuilder: (context, index) {
                      final hospital = _hospitals[index];

                      final isSelected = hospital.id == _selectedHospital?.id;

                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            color: const Color(0xFFEAF5FF),
                            borderRadius: BorderRadius.circular(13),
                          ),
                          child: const Icon(
                            Icons.local_hospital_rounded,
                            color: _strongBlue,
                          ),
                        ),
                        title: Text(
                          hospital.name,
                          style: const TextStyle(
                            color: _textPrimary,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        subtitle: hospital.address.isEmpty
                            ? null
                            : Text(
                                hospital.address,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                        trailing: isSelected
                            ? const Icon(
                                Icons.check_circle_rounded,
                                color: _strongBlue,
                              )
                            : null,
                        onTap: () {
                          Navigator.of(context).pop(hospital);
                        },
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );

    if (selected != null && mounted) {
      setState(() {
        _selectedHospital = selected;
      });
    }
  }

  // =========================================================
  // 화면
  // =========================================================

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _background,

      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
        centerTitle: true,
        title: const Text(
          '병원 길찾기',
          style: TextStyle(
            color: _textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),

      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: _strongBlue))
          : _errorMessage != null
          ? _ErrorView(message: _errorMessage!, onRetry: _loadData)
          : RefreshIndicator(
              onRefresh: _loadData,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 18, 16, 30),
                children: [
                  // =====================================
                  // 등록 병원
                  // =====================================
                  const _SectionTitle(
                    icon: Icons.local_hospital_rounded,
                    title: '등록된 병원',
                  ),

                  const SizedBox(height: 11),

                  _HospitalCard(
                    hospital: _selectedHospital!,
                    hospitalCount: _hospitals.length,
                    onTap: _hospitals.length > 1 ? _showHospitalSelector : null,
                  ),

                  const SizedBox(height: 24),

                  // =====================================
                  // 출발 위치
                  // =====================================
                  const _SectionTitle(
                    icon: Icons.route_rounded,
                    title: '출발 위치',
                  ),

                  const SizedBox(height: 11),

                  _DirectionCard(
                    icon: Icons.my_location_rounded,
                    iconColor: _strongBlue,
                    iconBackground: const Color(0xFFEAF5FF),
                    title: '현재 위치에서 출발',
                    description: 'GPS 위치를 기준으로 병원까지 안내해요.',
                    onPressed: _isOpeningRoute
                        ? null
                        : _routeFromCurrentLocation,
                  ),

                  const SizedBox(height: 11),

                  _DirectionCard(
                    icon: Icons.home_rounded,
                    iconColor: _mint,
                    iconBackground: const Color(0xFFE8F8F2),
                    title: '내 집에서 출발',
                    description: _homeAddressText,
                    onPressed:
                        _isOpeningRoute ||
                            (_profile?.address?.trim().isEmpty ?? true)
                        ? null
                        : _routeFromHome,
                  ),

                  if (_isOpeningRoute) ...[
                    const SizedBox(height: 22),
                    const Center(
                      child: CircularProgressIndicator(color: _strongBlue),
                    ),
                  ],

                  const SizedBox(height: 20),

                  // =====================================
                  // 안내
                  // =====================================
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF0F7FF),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.info_outline_rounded,
                          color: _strongBlue,
                          size: 19,
                        ),

                        SizedBox(width: 9),

                        Expanded(
                          child: Text(
                            '병원은 환자 계정에 연결된 병원을 우선 표시하며, '
                            '집주소는 마이페이지에 등록된 주소를 사용합니다.',
                            style: TextStyle(
                              color: _textSecondary,
                              fontSize: 11.5,
                              height: 1.5,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

// ===========================================================
// 섹션 제목
// ===========================================================

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.icon, required this.title});

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: const Color(0xFFEAF5FF),
            borderRadius: BorderRadius.circular(11),
          ),
          child: Icon(
            icon,
            color: _HospitalDirectionsScreenState._strongBlue,
            size: 19,
          ),
        ),

        const SizedBox(width: 10),

        Text(
          title,
          style: const TextStyle(
            color: _HospitalDirectionsScreenState._textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }
}

// ===========================================================
// 병원 카드
// ===========================================================

class _HospitalCard extends StatelessWidget {
  const _HospitalCard({
    required this.hospital,
    required this.hospitalCount,
    required this.onTap,
  });

  final HospitalDestination hospital;
  final int hospitalCount;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFFE5EDF5)),
            boxShadow: const [
              BoxShadow(
                color: Color(0x0D172033),
                blurRadius: 14,
                offset: Offset(0, 5),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 54,
                height: 54,
                decoration: BoxDecoration(
                  color: const Color(0xFFEAF5FF),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(
                  Icons.local_hospital_rounded,
                  color: _HospitalDirectionsScreenState._strongBlue,
                  size: 27,
                ),
              ),

              const SizedBox(width: 13),

              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '도착 병원',
                      style: TextStyle(
                        color: _HospitalDirectionsScreenState._textSecondary,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),

                    const SizedBox(height: 3),

                    Text(
                      hospital.name,
                      style: const TextStyle(
                        color: _HospitalDirectionsScreenState._textPrimary,
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),

                    if (hospital.address.isNotEmpty) ...[
                      const SizedBox(height: 5),
                      Text(
                        hospital.address,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: _HospitalDirectionsScreenState._textSecondary,
                          fontSize: 11.5,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ],
                ),
              ),

              if (hospitalCount > 1)
                const Icon(Icons.expand_more_rounded, color: Color(0xFF91A1B7)),
            ],
          ),
        ),
      ),
    );
  }
}

// ===========================================================
// 출발 카드
// ===========================================================

class _DirectionCard extends StatelessWidget {
  const _DirectionCard({
    required this.icon,
    required this.iconColor,
    required this.iconBackground,
    required this.title,
    required this.description,
    required this.onPressed,
  });

  final IconData icon;
  final Color iconColor;
  final Color iconBackground;
  final String title;
  final String description;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(19),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(19),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(15),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(19),
            border: Border.all(color: const Color(0xFFE5EDF5)),
          ),
          child: Row(
            children: [
              Container(
                width: 47,
                height: 47,
                decoration: BoxDecoration(
                  color: iconBackground,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: iconColor, size: 23),
              ),

              const SizedBox(width: 13),

              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: _HospitalDirectionsScreenState._textPrimary,
                        fontSize: 14.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),

                    const SizedBox(height: 5),

                    Text(
                      description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: _HospitalDirectionsScreenState._textSecondary,
                        fontSize: 11.5,
                        height: 1.4,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),

              Icon(
                Icons.chevron_right_rounded,
                color: onPressed == null
                    ? const Color(0xFFD2DAE4)
                    : const Color(0xFF91A1B7),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ===========================================================
// 오류 화면
// ===========================================================

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
            const Icon(
              Icons.error_outline_rounded,
              size: 42,
              color: Color(0xFFE56B6F),
            ),

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
