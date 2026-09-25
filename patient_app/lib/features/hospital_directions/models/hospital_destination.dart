class HospitalDestination {
  const HospitalDestination({
    required this.id,
    required this.name,
    required this.address,
    required this.latitude,
    required this.longitude,
  });

  final String id;
  final String name;
  final String address;
  final double latitude;
  final double longitude;

  factory HospitalDestination.fromJson(Map<String, dynamic> json) {
    final address = json['address']?.toString().trim() ?? '';
    final addressDetail = json['address_detail']?.toString().trim() ?? '';

    return HospitalDestination(
      id: json['id'] as String,
      name: json['name'] as String,
      address: [
        address,
        addressDetail,
      ].where((value) => value.isNotEmpty).join(' '),
      latitude: double.parse(json['latitude'].toString()),
      longitude: double.parse(json['longitude'].toString()),
    );
  }
}
