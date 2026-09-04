class PatientProfile {
  final String id;
  final String patientCode;
  final String name;
  final DateTime? birthDate;

  final String sex;
  final String sexLabel;

  final String? phoneNumber;
  final String? address;
  final String? hospitalName;

  final String appLinkStatus;

  const PatientProfile({
    required this.id,
    required this.patientCode,
    required this.name,
    required this.birthDate,
    required this.sex,
    required this.sexLabel,
    required this.phoneNumber,
    required this.address,
    required this.hospitalName,
    required this.appLinkStatus,
  });

  factory PatientProfile.fromJson(
    Map<String, dynamic> json,
  ) {
    return PatientProfile(
      id: json['id'] as String,
      patientCode: json['patient_code'] as String,
      name: json['name'] as String,

      birthDate: json['birth_date'] != null
          ? DateTime.parse(json['birth_date'] as String)
          : null,

      sex: json['sex'] as String,
      sexLabel: json['sex_label'] as String,

      phoneNumber: json['phone_number'] as String?,
      address: json['address'] as String?,
      hospitalName: json['hospital_name'] as String?,

      appLinkStatus: json['app_link_status'] as String,
    );
  }
}