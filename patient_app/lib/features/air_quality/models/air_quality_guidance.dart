class AirQualityGuidance {
  const AirQualityGuidance({
    required this.pm10,
    required this.pm25,
    required this.pm10Grade,
    required this.pm25Grade,
    required this.finalGrade,
    required this.title,
    required this.message,
    required this.stationName,
    required this.dataTime,
    required this.region,
    this.alertType,
  });

  final double? pm10;
  final double? pm25;

  final String pm10Grade;
  final String pm25Grade;
  final String finalGrade;

  final String title;
  final String message;

  final String stationName;
  final String dataTime;
  final String region;

  final String? alertType;

  factory AirQualityGuidance.fromJson(Map<String, dynamic> json) {
    return AirQualityGuidance(
      pm10: _toDouble(json['pm10']),
      pm25: _toDouble(json['pm25']),
      pm10Grade: json['pm10_grade']?.toString() ?? '',
      pm25Grade: json['pm25_grade']?.toString() ?? '',
      finalGrade: json['final_grade']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      message: json['message']?.toString() ?? '',
      stationName: json['station_name']?.toString() ?? '',
      dataTime: json['data_time']?.toString() ?? '',
      region: json['region']?.toString() ?? '',
      alertType: json['alert_type']?.toString(),
    );
  }

  static double? _toDouble(dynamic value) {
    if (value == null) {
      return null;
    }

    if (value is num) {
      return value.toDouble();
    }

    return double.tryParse(value.toString());
  }
}
