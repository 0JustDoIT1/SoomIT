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
  static const _naverGreen = Color(0xFF03C75A);
  static const _naverBlue = Color(0xFF0475F4);

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

  Future<void> _selectPharmacy(NearbyPharmacy pharmacy) async {
    await _moveTo(NLatLng(pharmacy.latitude, pharmacy.longitude));

    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => _PharmacyDetails(pharmacy: pharmacy),
    );
  }

  @override
  Widget build(BuildContext context) {
    final position = _position;
    final initialPosition = position == null
        ? _initialPosition
        : NLatLng(position.latitude, position.longitude);

    return Scaffold(
      appBar: AppBar(
        title: const Text('내 주변 약국 찾기'),
        actions: [
          IconButton(
            tooltip: '현재 위치로 다시 조회',
            onPressed: _isLoading ? null : _loadNearbyPharmacies,
            icon: const Icon(Icons.my_location_rounded),
          ),
        ],
      ),
      body: Stack(
        children: [
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
          Positioned(
            left: 16,
            right: 16,
            top: 16,
            child: _StatusCard(
              isLoading: _isLoading,
              errorMessage: _errorMessage,
              pharmacyCount: _pharmacies.length,
              onRetry: _loadNearbyPharmacies,
            ),
          ),
          if (!_isLoading && _errorMessage == null && _pharmacies.isNotEmpty)
            DraggableScrollableSheet(
              initialChildSize: 0.2,
              minChildSize: 0.13,
              maxChildSize: 0.55,
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
    );
  }
}

class _PharmacyMarkerIcon extends StatelessWidget {
  const _PharmacyMarkerIcon();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: _NearbyPharmacyScreenState._naverGreen,
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
      child: const Icon(Icons.local_pharmacy, color: Colors.white, size: 23),
    );
  }
}

class _CurrentLocationMarkerIcon extends StatelessWidget {
  const _CurrentLocationMarkerIcon();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        border: Border.all(
          color: _NearbyPharmacyScreenState._naverBlue,
          width: 4,
        ),
        boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 5)],
      ),
      padding: const EdgeInsets.all(5),
      child: const DecoratedBox(
        decoration: BoxDecoration(
          color: _NearbyPharmacyScreenState._naverBlue,
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}

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
    return Material(
      elevation: 5,
      borderRadius: BorderRadius.circular(16),
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
        child: isLoading
            ? const Row(
                children: [
                  SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2.5),
                  ),
                  SizedBox(width: 12),
                  Text('현재 위치 주변 약국을 찾고 있어요.'),
                ],
              )
            : errorMessage != null
            ? Row(
                children: [
                  const Icon(Icons.info_outline, color: Color(0xFFE56B6F)),
                  const SizedBox(width: 10),
                  Expanded(child: Text(errorMessage!)),
                  TextButton(onPressed: onRetry, child: const Text('재시도')),
                ],
              )
            : Row(
                children: [
                  const Icon(Icons.local_pharmacy, color: Color(0xFF17A673)),
                  const SizedBox(width: 10),
                  Text('가까운 약국 $pharmacyCount곳을 찾았습니다.'),
                ],
              ),
      ),
    );
  }
}

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
    return Material(
      color: Colors.white,
      elevation: 12,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      child: ListView.separated(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
        itemCount: pharmacies.length + 1,
        separatorBuilder: (_, _) => const Divider(height: 1),
        itemBuilder: (context, index) {
          if (index == 0) {
            return Center(
              child: Container(
                width: 42,
                height: 4,
                margin: const EdgeInsets.only(bottom: 8),
                decoration: BoxDecoration(
                  color: const Color(0xFFD6DCE4),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            );
          }

          final pharmacy = pharmacies[index - 1];
          return ListTile(
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 2,
              vertical: 4,
            ),
            leading: const CircleAvatar(
              backgroundColor: Color(0xFFE8F8F2),
              child: Icon(Icons.local_pharmacy, color: Color(0xFF17A673)),
            ),
            title: Text(
              pharmacy.name,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            subtitle: Text(
              '${pharmacy.distanceKm.toStringAsFixed(1)}km · ${pharmacy.address}',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => onSelected(pharmacy),
          );
        },
      ),
    );
  }
}

class _PharmacyDetails extends StatelessWidget {
  const _PharmacyDetails({required this.pharmacy});

  final NearbyPharmacy pharmacy;

  Future<void> _openNaverMap(BuildContext context) async {
    final appUri = Uri(
      scheme: 'nmap',
      host: 'place',
      queryParameters: {
        'lat': pharmacy.latitude.toString(),
        'lng': pharmacy.longitude.toString(),
        'name': pharmacy.name,
        'appname': 'com.soomit.patient',
      },
    );

    try {
      if (await canLaunchUrl(appUri) &&
          await launchUrl(appUri, mode: LaunchMode.externalApplication)) {
        return;
      }
    } catch (_) {
      // 네이버지도 앱이 없거나 URL 스킴 실행이 차단되면 웹 지도로 이동한다.
    }

    final searchQuery = '${pharmacy.name} ${pharmacy.address}';
    final webUri = Uri.https('map.naver.com', '/p/search/$searchQuery');

    var opened = false;
    try {
      opened = await launchUrl(webUri, mode: LaunchMode.externalApplication);
    } catch (_) {
      opened = false;
    }

    if (!opened && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('네이버지도 앱이나 브라우저를 열 수 없습니다.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final phoneNumber = pharmacy.phoneNumber?.trim();

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 4, 24, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              pharmacy.name,
              style: const TextStyle(
                color: Color(0xFF172033),
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              '현재 위치에서 ${pharmacy.distanceKm.toStringAsFixed(1)}km',
              style: const TextStyle(
                color: Color(0xFF17A673),
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 20),
            _DetailRow(
              icon: Icons.location_on_outlined,
              value: pharmacy.address,
            ),
            const SizedBox(height: 14),
            _DetailRow(
              icon: Icons.phone_outlined,
              value: phoneNumber == null || phoneNumber.isEmpty
                  ? '전화번호 정보 없음'
                  : phoneNumber,
            ),
            const SizedBox(height: 22),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () => _openNaverMap(context),
                icon: const Icon(Icons.map_outlined),
                label: const Text('네이버지도에서 보기'),
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF03C75A),
                  foregroundColor: Colors.white,
                  minimumSize: const Size.fromHeight(50),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.icon, required this.value});

  final IconData icon;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: const Color(0xFF748198), size: 22),
        const SizedBox(width: 12),
        Expanded(child: Text(value)),
      ],
    );
  }
}
