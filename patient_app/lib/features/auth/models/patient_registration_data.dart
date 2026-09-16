class PatientRegistrationData {
  final String registrationToken;
  final String name;
  final DateTime birthDate;
  final String sex;
  final String phoneNumber;
  final String postalCode;
  final String address;
  final String addressDetail;
  final String? patientCode;

  const PatientRegistrationData({
    required this.registrationToken,
    required this.name,
    required this.birthDate,
    required this.sex,
    required this.phoneNumber,
    required this.postalCode,
    required this.address,
    required this.addressDetail,
    this.patientCode,
  });

  Map<String, dynamic> toJson() {
    final normalizedPatientCode = patientCode?.trim();

    return {
      'registration_token': registrationToken,
      'name': name.trim(),
      'birth_date': _formatDate(birthDate),
      'sex': sex,
      'phone_number': phoneNumber.trim(),
      'postal_code': postalCode.trim(),
      'address': address.trim(),
      'address_detail': addressDetail.trim(),
      if (normalizedPatientCode != null && normalizedPatientCode.isNotEmpty)
        'patient_code': normalizedPatientCode,
    };
  }

  String _formatDate(DateTime date) {
    final year = date.year.toString().padLeft(4, '0');
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');

    return '$year-$month-$day';
  }
}
