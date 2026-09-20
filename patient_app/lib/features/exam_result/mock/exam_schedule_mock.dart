import '../models/exam_schedule.dart';

final List<ExamSchedule> mockExamSchedules = [
  // ─────────────────────────────────────────
  // 검사 예정 1 - X-ray
  // ─────────────────────────────────────────
  ExamSchedule(
    id: 'mock-schedule-001',
    scheduledAt: DateTime(2026, 9, 22, 10, 30),
    examType: 'XRAY',
    examName: '흉부 X-ray',
    appointmentStatus: 'CONFIRMED',
    appointmentStatusLabel: '예약 확정',
    visitStatus: 'SCHEDULED',
    visitStatusLabel: '검사 예정',
    hospitalName: '숨잇병원',
    doctorName: '김태윤',
    preparationGuide: '검사 10분 전까지 영상의학과에 도착해주세요.',
  ),

  // ─────────────────────────────────────────
  // 검사 예정 2 - CT
  // ─────────────────────────────────────────
  ExamSchedule(
    id: 'mock-schedule-002',
    scheduledAt: DateTime(2026, 9, 24, 14, 0),
    examType: 'CT',
    examName: '흉부 CT',
    appointmentStatus: 'CONFIRMED',
    appointmentStatusLabel: '예약 확정',
    visitStatus: 'SCHEDULED',
    visitStatusLabel: '검사 예정',
    hospitalName: '숨잇병원',
    doctorName: '김태윤',
    preparationGuide: '조영제 검사가 예정된 경우 검사 전 4시간 금식해주세요.',
  ),

  // ─────────────────────────────────────────
  // 검사 완료
  // ─────────────────────────────────────────
  ExamSchedule(
    id: 'mock-schedule-003',
    scheduledAt: DateTime(2026, 9, 8, 10, 30),
    examType: 'XRAY',
    examName: '흉부 X-ray',
    appointmentStatus: 'CONFIRMED',
    appointmentStatusLabel: '예약 확정',
    visitStatus: 'COMPLETED',
    visitStatusLabel: '검사 완료',
    hospitalName: '숨잇병원',
    doctorName: '김태윤',
    preparationGuide: '검사가 완료되었습니다.',
  ),

  // ─────────────────────────────────────────
  // 예약 취소
  // ─────────────────────────────────────────
  ExamSchedule(
    id: 'mock-schedule-004',
    scheduledAt: DateTime(2026, 9, 28, 9, 30),
    examType: 'PET_CT_TNM',
    examName: 'PET-CT / 병기 검사',
    appointmentStatus: 'CANCELLED',
    appointmentStatusLabel: '예약 취소',
    visitStatus: 'CANCELLED',
    visitStatusLabel: '예약 취소',
    hospitalName: '숨잇병원',
    doctorName: '김태윤',
    preparationGuide: '검사 전 6시간 금식이 필요합니다.',
  ),

  // ─────────────────────────────────────────
  // 검사 예정 3 - 조직·유전자
  // ─────────────────────────────────────────
  ExamSchedule(
    id: 'mock-schedule-005',
    scheduledAt: DateTime(2026, 10, 2, 11, 0),
    examType: 'PATHOLOGY_GENE',
    examName: '조직·유전자 검사',
    appointmentStatus: 'CONFIRMED',
    appointmentStatusLabel: '예약 확정',
    visitStatus: 'SCHEDULED',
    visitStatusLabel: '검사 예정',
    hospitalName: '숨잇병원',
    doctorName: '김태윤',
    preparationGuide: '검사 전 담당 의료진의 안내사항을 확인해주세요.',
  ),
];
