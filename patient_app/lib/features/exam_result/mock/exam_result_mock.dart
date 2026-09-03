import '../models/exam_result.dart';

final List<ExamResult> mockExamResults = [
  ExamResult(
    id: 'exam-001',
    examType: 'CT',
    examName: 'CT 검사',
    scheduledAt: DateTime(2026, 9, 12, 14, 0),
    status: '검사 예정',
    department: '영상의학과',
    preparationGuide: '검사 전 4시간 금식해주세요.',
    hasResult: false,
  ),
  ExamResult(
    id: 'exam-002',
    examType: 'PET_CT',
    examName: 'PET-CT 검사',
    scheduledAt: DateTime(2026, 9, 20, 9, 30),
    status: '검사 예정',
    department: '핵의학과',
    preparationGuide: '검사 전 6시간 금식이 필요합니다.',
    hasResult: false,
  ),
  ExamResult(
    id: 'exam-003',
    examType: 'CT',
    examName: 'CT 검사',
    scheduledAt: DateTime(2026, 8, 20, 14, 0),
    status: '결과 확인 가능',
    department: '영상의학과',
    preparationGuide: '검사가 완료되었습니다.',
    hasResult: true,
    resultSummary: '의료진 확인이 완료된 검사 결과입니다.',
  ),
];