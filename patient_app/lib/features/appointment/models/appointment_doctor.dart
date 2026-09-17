class AppointmentDoctor {
  final String id;
  final String name;
  final String department;

  const AppointmentDoctor({
    required this.id,
    required this.name,
    required this.department,
  });

  factory AppointmentDoctor.fromJson(Map<String, dynamic> json) {
    return AppointmentDoctor(
      id: json['id'] as String,
      name: json['name'] as String,
      department: json['department'] as String? ?? '',
    );
  }

  String get displayName {
    if (department.isEmpty) {
      return name;
    }

    return '$name · $department';
  }
}
