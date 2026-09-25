class AirQualityGuidance {
  const AirQualityGuidance({
    required this.finalGrade,
    required this.title,
    required this.message,
  });

  final String finalGrade;
  final String title;
  final String message;

  factory AirQualityGuidance.fromJson(Map<String, dynamic> json) {
    return AirQualityGuidance(
      finalGrade: json['final_grade'] as String,
      title: json['title'] as String,
      message: json['message'] as String,
    );
  }
}
