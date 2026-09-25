import 'package:flutter/material.dart';
import 'package:flutter_naver_map/flutter_naver_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

import 'models/nearby_pharmacy.dart';
import 'services/nearby_pharmacy_service.dart';

class NearbyPharmacyScreen extends StatefulWidget {
  const NearbyPharmacyScreen({super.key});

  @override
  State<NearbyPharmacyScreen> createState() => _NearbyPharmacyScreenState();
}

class _NearbyPharmacyScreenState extends State<NearbyPharmacyScreen> {
  static const _initialPosition = NLatLng(37.5665, 126.9780);

  static const _strongBlue = Color(0xFF2F8DFE);
  static const _mint = Color(0xFF20C997);
  static const _textPrimary = Color(0xFF172033);
  static const _textSecondary = Color(0xFF748198);
  static const _background = Color(0xFFF5FAFF);

  final NearbyPharmacyService _service = NearbyPharmacyService();

  NaverMapController? _mapController;
  Position? _position;

  List<NearbyPharmacy> _pharmacies = const [];

  String? _errorMessage;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadNearbyPharmacies();
  }

  // =========================================================
  // 주변 약국 조회
  // =========================================================

  Future<void> _loadNearbyPharmacies() async {
    if (mounted) {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });
    }

    try {
      final position = await _determinePosition();

      final pharmacies = await _service.findNearby(
        latitude: position.latitude,
        longitude: position.longitude,
      );

      if (!mounted) return;

      setState(() {
        _position = position;
        _pharmacies = pharmacies;
        _isLoading = false;
      });

      await _renderMap();
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
      throw const NearbyPharmacyException('휴대폰의 위치 서비스를 켜주세요.');
    }

    var permission = await Geolocator.checkPermission();

    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    if (permission == LocationPermission.denied) {
      throw const NearbyPharmacyException('현재 위치를 사용하려면 위치 권한이 필요합니다.');
    }

    if (permission == LocationPermission.deniedForever) {
      throw const NearbyPharmacyException('설정에서 위치 권한을 허용한 뒤 다시 시도해주세요.');
    }

    return Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 15),
      ),
    );
  }

  // =========================================================
  // 지도
  // =========================================================

  Future<void> _renderMap() async {
    final controller = _mapController;
    final position = _position;

    if (controller == null || position == null) return;

    await controller.clearOverlays(type: NOverlayType.marker);

    if (!mounted) return;

    final icons = await Future.wait([
      NOverlayImage.fromWidget(
        context: context,
        size: const Size(44, 44),
        widget: const _PharmacyMarkerIcon(),
      ),
      NOverlayImage.fromWidget(
        context: context,
        size: const Size(30, 30),
        widget: const _CurrentLocationMarkerIcon(),
      ),
    ]);

    if (!mounted) return;

    final pharmacyIcon = icons[0];
    final currentLocationIcon = icons[1];

    final currentPosition = NLatLng(position.latitude, position.longitude);

    final currentMarker = NMarker(
      id: 'current_location',
      position: currentPosition,
      caption: const NOverlayCaption(text: '현재 위치'),
      icon: currentLocationIcon,
      size: const Size(30, 30),
    );

    final markers = <NAddableOverlay>{currentMarker};

    for (final pharmacy in _pharmacies) {
      final marker = NMarker(
        id: pharmacy.id,
        position: NLatLng(pharmacy.latitude, pharmacy.longitude),
        icon: pharmacyIcon,
        size: const Size(44, 44),
        caption: NOverlayCaption(text: pharmacy.name),
        subCaption: NOverlayCaption(
          text: '${pharmacy.distanceKm.toStringAsFixed(1)}km',
        ),
      );

      marker.setOnTapListener((_) => _selectPharmacy(pharmacy));

      markers.add(marker);
    }

    await controller.addOverlayAll(markers);

    await _moveTo(currentPosition, zoom: 14.5);
  }

  Future<void> _moveTo(NLatLng target, {double zoom = 16}) async {
    final update = NCameraUpdate.scrollAndZoomTo(target: target, zoom: zoom)
      ..setAnimation(
        animation: NCameraAnimation.easing,
        duration: const Duration(milliseconds: 500),
      );

    await _mapController?.updateCamera(update);
  }

  // =========================================================
  // 약국 위치 지도에서 보기
  // =========================================================

  Future<void> _viewPharmacyOnMap(NearbyPharmacy pharmacy) async {
    await _moveTo(NLatLng(pharmacy.latitude, pharmacy.longitude), zoom: 18);
  }

  // =========================================================
  // 약국 선택
  // =========================================================

  Future<void> _selectPharmacy(NearbyPharmacy pharmacy) async {
    await _moveTo(NLatLng(pharmacy.latitude, pharmacy.longitude), zoom: 17);

    if (!mounted) return;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return _PharmacyDetails(
          pharmacy: pharmacy,
          currentPosition: _position,

          // 지도보기
          onViewMap: () async {
            Navigator.of(sheetContext).pop();

            // 바텀시트 닫히는 시간
            await Future<void>.delayed(const Duration(milliseconds: 180));

            await _viewPharmacyOnMap(pharmacy);
          },
        );
      },
    );
  }

  // =========================================================
  // 화면
  // =========================================================

  @override
  Widget build(BuildContext context) {
    final position = _position;

    final initialPosition = position == null
        ? _initialPosition
        : NLatLng(position.latitude, position.longitude);

    return Scaffold(
      backgroundColor: _background,
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
        centerTitle: true,
        title: const Text(
          '내 주변 약국 찾기',
          style: TextStyle(
            color: _textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        actions: [
          IconButton(
            tooltip: '현재 위치로 다시 조회',
            onPressed: _isLoading ? null : _loadNearbyPharmacies,
            icon: const Icon(Icons.my_location_rounded, color: _strongBlue),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: Column(
        children: [
          // =================================================
          // 위치 안내
          // =================================================
          Container(
            width: double.infinity,
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(18, 4, 18, 13),
            child: Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: const Color(0xFFEAF5FF),
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: const Icon(
                    Icons.location_on_rounded,
                    color: _strongBlue,
                    size: 19,
                  ),
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '현재 위치 기준',
                        style: TextStyle(
                          color: _textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      SizedBox(height: 2),
                      Text(
                        '반경 5km 이내 가까운 약국을 찾아드려요.',
                        style: TextStyle(
                          color: _textSecondary,
                          fontSize: 11.5,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          Expanded(
            child: Stack(
              children: [
                // ===========================================
                // 네이버 지도
                // ===========================================
                NaverMap(
                  options: NaverMapViewOptions(
                    initialCameraPosition: NCameraPosition(
                      target: initialPosition,
                      zoom: 13,
                    ),
                    locationButtonEnable: false,
                    zoomGesturesEnable: true,
                    scrollGesturesEnable: true,
                  ),
                  onMapReady: (controller) async {
                    _mapController = controller;

                    await _renderMap();
                  },
                ),

                // ===========================================
                // 상태 카드
                // ===========================================
                Positioned(
                  left: 16,
                  right: 16,
                  top: 15,
                  child: _StatusCard(
                    isLoading: _isLoading,
                    errorMessage: _errorMessage,
                    pharmacyCount: _pharmacies.length,
                    onRetry: _loadNearbyPharmacies,
                  ),
                ),

                // ===========================================
                // 약국 목록
                // ===========================================
                if (!_isLoading &&
                    _errorMessage == null &&
                    _pharmacies.isNotEmpty)
                  DraggableScrollableSheet(
                    initialChildSize: 0.28,
                    minChildSize: 0.15,
                    maxChildSize: 0.66,
                    builder: (context, controller) {
                      return _PharmacyList(
                        pharmacies: _pharmacies,
                        controller: controller,
                        onSelected: _selectPharmacy,
                      );
                    },
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ===========================================================
// 약국 마커
// ===========================================================

class _PharmacyMarkerIcon extends StatelessWidget {
  const _PharmacyMarkerIcon();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: _NearbyPharmacyScreenState._mint,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 3),
        boxShadow: const [
          BoxShadow(
            color: Color(0x33000000),
            blurRadius: 6,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: const Icon(
        Icons.local_pharmacy_rounded,
        color: Colors.white,
        size: 23,
      ),
    );
  }
}

// ===========================================================
// 현재 위치 마커
// ===========================================================

class _CurrentLocationMarkerIcon extends StatelessWidget {
  const _CurrentLocationMarkerIcon();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        border: Border.all(
          color: _NearbyPharmacyScreenState._strongBlue,
          width: 4,
        ),
        boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 5)],
      ),
      padding: const EdgeInsets.all(5),
      child: const DecoratedBox(
        decoration: BoxDecoration(
          color: _NearbyPharmacyScreenState._strongBlue,
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}

// ===========================================================
// 상태 카드
// ===========================================================

class _StatusCard extends StatelessWidget {
  const _StatusCard({
    required this.isLoading,
    required this.errorMessage,
    required this.pharmacyCount,
    required this.onRetry,
  });

  final bool isLoading;
  final String? errorMessage;
  final int pharmacyCount;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(17),
        border: Border.all(color: const Color(0xFFE5EDF5)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1A172033),
            blurRadius: 14,
            offset: Offset(0, 5),
          ),
        ],
      ),
      child: isLoading
          ? const Row(
              children: [
                SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.4,
                    color: _NearbyPharmacyScreenState._strongBlue,
                  ),
                ),
                SizedBox(width: 11),
                Expanded(
                  child: Text(
                    '현재 위치 주변 약국을 찾고 있어요.',
                    style: TextStyle(
                      color: _NearbyPharmacyScreenState._textSecondary,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            )
          : errorMessage != null
          ? Row(
              children: [
                const Icon(
                  Icons.info_outline_rounded,
                  color: Color(0xFFE56B6F),
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: Text(
                    errorMessage!,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      color: _NearbyPharmacyScreenState._textSecondary,
                    ),
                  ),
                ),
                TextButton(onPressed: onRetry, child: const Text('재시도')),
              ],
            )
          : Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: const Color(0xFFE8F8F2),
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: const Icon(
                    Icons.local_pharmacy_rounded,
                    color: _NearbyPharmacyScreenState._mint,
                    size: 19,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    '가까운 약국 $pharmacyCount곳을 찾았어요.',
                    style: const TextStyle(
                      color: _NearbyPharmacyScreenState._textPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

// ===========================================================
// 약국 목록
// ===========================================================

class _PharmacyList extends StatelessWidget {
  const _PharmacyList({
    required this.pharmacies,
    required this.controller,
    required this.onSelected,
  });

  final List<NearbyPharmacy> pharmacies;
  final ScrollController controller;
  final ValueChanged<NearbyPharmacy> onSelected;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(27)),
        boxShadow: [
          BoxShadow(
            color: Color(0x1F172033),
            blurRadius: 20,
            offset: Offset(0, -3),
          ),
        ],
      ),
      child: ListView.separated(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(17, 10, 17, 28),
        itemCount: pharmacies.length + 1,
        separatorBuilder: (_, _) {
          return const Divider(height: 1, color: Color(0xFFEEF3F7));
        },
        itemBuilder: (context, index) {
          if (index == 0) {
            return Column(
              children: [
                Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 11),
                  decoration: BoxDecoration(
                    color: const Color(0xFFD7E0E8),
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.only(bottom: 11),
                  child: Row(
                    children: [
                      Text(
                        '가까운 약국',
                        style: TextStyle(
                          color: _NearbyPharmacyScreenState._textPrimary,
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            );
          }

          final pharmacy = pharmacies[index - 1];

          return InkWell(
            onTap: () => onSelected(pharmacy),
            borderRadius: BorderRadius.circular(16),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 13),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 47,
                    height: 47,
                    decoration: BoxDecoration(
                      color: const Color(0xFFE9F9F2),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(
                      Icons.local_pharmacy_rounded,
                      color: _NearbyPharmacyScreenState._mint,
                      size: 24,
                    ),
                  ),

                  const SizedBox(width: 12),

                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                pharmacy.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color:
                                      _NearbyPharmacyScreenState._textPrimary,
                                  fontSize: 14.5,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),

                            const SizedBox(width: 7),

                            Text(
                              '${pharmacy.distanceKm.toStringAsFixed(1)}km',
                              style: const TextStyle(
                                color: _NearbyPharmacyScreenState._strongBlue,
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),

                        const SizedBox(height: 6),

                        Text(
                          pharmacy.address,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: _NearbyPharmacyScreenState._textSecondary,
                            fontSize: 11.5,
                            height: 1.4,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),

                  const Padding(
                    padding: EdgeInsets.only(top: 13),
                    child: Icon(
                      Icons.chevron_right_rounded,
                      color: Color(0xFF9AA8B8),
                      size: 21,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// ===========================================================
// 약국 상세 바텀시트
// ===========================================================

class _PharmacyDetails extends StatelessWidget {
  const _PharmacyDetails({
    required this.pharmacy,
    required this.currentPosition,
    required this.onViewMap,
  });

  final NearbyPharmacy pharmacy;
  final Position? currentPosition;

  /// 현재 앱 안의 지도에서 해당 약국으로 이동
  final Future<void> Function() onViewMap;

  // =========================================================
  // 전화하기
  // =========================================================

  Future<void> _callPharmacy(BuildContext context) async {
    final phoneNumber = pharmacy.phoneNumber?.trim();

    if (phoneNumber == null || phoneNumber.isEmpty) {
      _showMessage(context, '등록된 전화번호가 없습니다.');
      return;
    }

    final clean = phoneNumber.replaceAll(RegExp(r'[^0-9+]'), '');

    final uri = Uri(scheme: 'tel', path: clean);

    try {
      final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);

      if (!opened && context.mounted) {
        _showMessage(context, '전화 앱을 열 수 없습니다.');
      }
    } catch (_) {
      if (context.mounted) {
        _showMessage(context, '전화 앱을 열 수 없습니다.');
      }
    }
  }

  // =========================================================
  // 길찾기
  // =========================================================

  Future<void> _openDirections(BuildContext context) async {
    final position = currentPosition;

    if (position == null) {
      _showMessage(context, '현재 위치를 확인할 수 없습니다.');
      return;
    }

    // 네이버 지도 앱
    final appUri = Uri(
      scheme: 'nmap',
      host: 'route',
      path: '/car',
      queryParameters: {
        'slat': position.latitude.toString(),
        'slng': position.longitude.toString(),
        'sname': '현재 위치',
        'dlat': pharmacy.latitude.toString(),
        'dlng': pharmacy.longitude.toString(),
        'dname': pharmacy.name,
        'appname': 'com.soomit.patient',
      },
    );

    try {
      if (await canLaunchUrl(appUri)) {
        final opened = await launchUrl(
          appUri,
          mode: LaunchMode.externalApplication,
        );

        if (opened) return;
      }
    } catch (_) {
      // 네이버지도 앱이 없으면 웹 길찾기 사용
    }

    // 웹 길찾기
    final start =
        '${position.longitude},'
        '${position.latitude},'
        '${Uri.encodeComponent('현재 위치')},,PLACE_POI';

    final destination =
        '${pharmacy.longitude},'
        '${pharmacy.latitude},'
        '${Uri.encodeComponent(pharmacy.name)},,PLACE_POI';

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

      if (!opened && context.mounted) {
        _showMessage(context, '길찾기를 실행할 수 없습니다.');
      }
    } catch (_) {
      if (context.mounted) {
        _showMessage(context, '길찾기를 실행할 수 없습니다.');
      }
    }
  }

  void _showMessage(BuildContext context, String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final phoneNumber = pharmacy.phoneNumber?.trim();

    return SafeArea(
      child: Container(
        margin: const EdgeInsets.only(top: 70),
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 28),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 42,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 20),
                  decoration: BoxDecoration(
                    color: const Color(0xFFD6DEE7),
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              ),

              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: const Color(0xFFE9F9F2),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Icon(
                      Icons.local_pharmacy_rounded,
                      color: _NearbyPharmacyScreenState._mint,
                      size: 27,
                    ),
                  ),

                  const SizedBox(width: 13),

                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          pharmacy.name,
                          style: const TextStyle(
                            color: _NearbyPharmacyScreenState._textPrimary,
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.4,
                          ),
                        ),

                        const SizedBox(height: 5),

                        Text(
                          '현재 위치에서 '
                          '${pharmacy.distanceKm.toStringAsFixed(1)}km',
                          style: const TextStyle(
                            color: _NearbyPharmacyScreenState._mint,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 22),

              // =================================================
              // 전화 / 앱 내부 지도 / 길찾기
              // =================================================
              Row(
                children: [
                  Expanded(
                    child: _ActionButton(
                      icon: Icons.phone_outlined,
                      label: '전화하기',
                      color: const Color(0xFF20A46B),
                      background: const Color(0xFFEAF8F1),
                      onTap: () {
                        _callPharmacy(context);
                      },
                    ),
                  ),

                  const SizedBox(width: 9),

                  Expanded(
                    child: _ActionButton(
                      icon: Icons.map_outlined,
                      label: '지도보기',
                      color: _NearbyPharmacyScreenState._strongBlue,
                      background: const Color(0xFFEAF5FF),
                      onTap: () {
                        onViewMap();
                      },
                    ),
                  ),

                  const SizedBox(width: 9),

                  Expanded(
                    child: _ActionButton(
                      icon: Icons.navigation_outlined,
                      label: '길찾기',
                      color: const Color(0xFFE85A78),
                      background: const Color(0xFFFFEDF2),
                      onTap: () {
                        _openDirections(context);
                      },
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 25),

              const Text(
                '약국 정보',
                style: TextStyle(
                  color: _NearbyPharmacyScreenState._textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                ),
              ),

              const SizedBox(height: 14),

              _DetailRow(
                icon: Icons.location_on_outlined,
                title: '주소',
                value: pharmacy.address,
              ),

              const SizedBox(height: 16),

              _DetailRow(
                icon: Icons.phone_outlined,
                title: '전화번호',
                value: phoneNumber == null || phoneNumber.isEmpty
                    ? '전화번호 정보 없음'
                    : phoneNumber,
              ),

              const SizedBox(height: 10),
            ],
          ),
        ),
      ),
    );
  }
}

// ===========================================================
// 빠른 실행 버튼
// ===========================================================

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.background,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final Color color;
  final Color background;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: background,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: color, size: 23),

              const SizedBox(height: 6),

              Text(
                label,
                style: const TextStyle(
                  color: _NearbyPharmacyScreenState._textPrimary,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ===========================================================
// 정보 행
// ===========================================================

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.title,
    required this.value,
  });

  final IconData icon;
  final String title;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            color: const Color(0xFFF0F6FB),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(
            icon,
            color: _NearbyPharmacyScreenState._textSecondary,
            size: 20,
          ),
        ),

        const SizedBox(width: 12),

        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  color: Color(0xFF7E8B9D),
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),

              const SizedBox(height: 4),

              Text(
                value,
                style: const TextStyle(
                  color: _NearbyPharmacyScreenState._textPrimary,
                  fontSize: 13,
                  height: 1.4,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
