import '../models/exam_result.dart';

final List<ExamResult> mockExamResults = [
  // ─────────────────────────────────────────
  // 흉부 X-ray
  // ─────────────────────────────────────────
  ExamResult(
    id: 'mock-xray-001',
    examType: 'XRAY',
    examName: '흉부 X-ray',
    resultStatus: 'CONFIRMED',
    resultStatusLabel: '확정',
    resultDate: DateTime(2026, 9, 8, 10, 30),
    resultSummary: '흉부 X-ray 검사 결과가 확인되었습니다.',

    hospitalName: '숨잇병원',
    departmentName: '영상의학과',
    doctorName: '김태윤 교수',

    resultSections: const [
      ExamResultSection(
        type: 'XRAY_ASSESSMENT',
        label: '판독 결과',
        summary: '특이 소견이 관찰되지 않았습니다.',
      ),
      ExamResultSection(
        type: 'DOCTOR_OPINION',
        label: '의료진 소견',
        summary: '현재 검사 결과를 바탕으로 정기적인 추적 관찰을 권장합니다.',
      ),
      ExamResultSection(
        type: 'NEXT_PLAN',
        label: '다음 계획',
        summary: '증상 변화가 있으면 예약된 진료 전에 의료진과 상담해주세요.',
      ),
    ],
  ),

  // ─────────────────────────────────────────
  // 흉부 CT
  // ─────────────────────────────────────────
  ExamResult(
    id: 'mock-ct-001',
    examType: 'CT',
    examName: '흉부 CT',
    resultStatus: 'CONFIRMED',
    resultStatusLabel: '확정',
    resultDate: DateTime(2026, 9, 10, 14, 20),
    resultSummary: '폐 결절이 확인되어 의료진의 추가 확인이 필요한 결과입니다.',

    hospitalName: '숨잇병원',
    departmentName: '영상의학과',
    doctorName: '김태윤 교수',

    resultSections: const [
      ExamResultSection(
        type: 'CT_ASSESSMENT',
        label: '종합 판독',
        summary: '폐 결절이 확인되어 의료진의 추가 확인이 필요합니다.',
      ),
      ExamResultSection(
        type: 'CT_NODULE',
        label: '결절 정보',
        summary: '우상엽에서 결절 1개가 관찰되었습니다. 최대 크기는 약 8mm입니다.',
      ),
      ExamResultSection(
        type: 'DOCTOR_OPINION',
        label: '의료진 소견',
        summary: '현재 영상 소견을 바탕으로 크기 변화 여부를 확인하기 위한 추적 관찰이 필요합니다.',
      ),
      ExamResultSection(
        type: 'NEXT_PLAN',
        label: '다음 계획',
        summary: '담당 의료진 판단에 따라 추적 CT 또는 추가 검사를 진행할 수 있습니다.',
      ),
    ],
  ),

  // ─────────────────────────────────────────
  // PET-CT / 병기 검사
  // ─────────────────────────────────────────
  ExamResult(
    id: 'mock-pet-001',
    examType: 'PET_CT_TNM',
    examName: 'PET-CT / 병기 검사',
    resultStatus: 'CONFIRMED',
    resultStatusLabel: '확정',
    resultDate: DateTime(2026, 9, 12, 11, 0),
    resultSummary: '병기 평가를 위한 검사 결과가 확인되었습니다.',

    hospitalName: '숨잇병원',
    departmentName: '핵의학과',
    doctorName: '김태윤 교수',

    resultSections: const [
      ExamResultSection(
        type: 'TNM',
        label: '병기 평가',
        summary: '영상 검사 결과를 기반으로 병기 평가가 진행되었습니다.',
      ),
      ExamResultSection(
        type: 'PET_CT',
        label: 'PET-CT 소견',
        summary: '세부 결과는 담당 의료진의 최종 판단과 함께 확인해주세요.',
      ),
      ExamResultSection(
        type: 'DOCTOR_OPINION',
        label: '의료진 소견',
        summary: '검사 결과를 종합하여 다음 진료 시 치료 계획을 함께 설명드릴 예정입니다.',
      ),
      ExamResultSection(
        type: 'NEXT_PLAN',
        label: '다음 계획',
        summary: '예약된 진료에서 검사 결과를 확인하고 이후 계획을 결정합니다.',
      ),
    ],
  ),

  // ─────────────────────────────────────────
  // 조직·유전자 검사
  // ─────────────────────────────────────────
  ExamResult(
    id: 'mock-pathology-001',
    examType: 'PATHOLOGY_GENE',
    examName: '조직·유전자 검사',
    resultStatus: 'CONFIRMED',
    resultStatusLabel: '확정',
    resultDate: DateTime(2026, 9, 15, 9, 40),
    resultSummary: '조직병리 및 유전자 검사 결과가 확인되었습니다.',

    hospitalName: '숨잇병원',
    departmentName: '병리과',
    doctorName: '김태윤 교수',

    resultSections: const [
      ExamResultSection(
        type: 'PATHOLOGY',
        label: '조직병리 결과',
        summary: '채취된 검체에 대한 병리 판독이 완료되었습니다.',
      ),
      ExamResultSection(
        type: 'EGFR',
        label: 'EGFR',
        summary: 'EGFR 유전자 검사 결과가 등록되었습니다.',
      ),
      ExamResultSection(
        type: 'ALK',
        label: 'ALK',
        summary: 'ALK 유전자 검사 결과가 등록되었습니다.',
      ),
      ExamResultSection(
        type: 'DOCTOR_OPINION',
        label: '의료진 소견',
        summary: '병리 및 유전자 결과는 진료 시 치료 방향과 함께 설명드릴 예정입니다.',
      ),
      ExamResultSection(
        type: 'NEXT_PLAN',
        label: '다음 계획',
        summary: '담당 의료진과 결과를 확인한 뒤 필요한 후속 진료를 진행합니다.',
      ),
    ],
  ),

  // ─────────────────────────────────────────
  // PD-L1 검사
  // ─────────────────────────────────────────
  ExamResult(
    id: 'mock-pdl1-001',
    examType: 'PDL1',
    examName: 'PD-L1 검사',
    resultStatus: 'CONFIRMED',
    resultStatusLabel: '확정',
    resultDate: DateTime(2026, 9, 17, 15, 10),
    resultSummary: 'PD-L1 검사 결과가 확인되었습니다.',

    hospitalName: '숨잇병원',
    departmentName: '병리과',
    doctorName: '김태윤 교수',

    resultSections: const [
      ExamResultSection(
        type: 'PDL1',
        label: 'PD-L1 결과',
        summary: 'PD-L1 발현 검사 결과가 등록되었습니다.',
      ),
      ExamResultSection(
        type: 'DOCTOR_OPINION',
        label: '의료진 소견',
        summary: '검사 결과는 다른 임상 정보와 함께 종합적으로 확인해야 합니다.',
      ),
      ExamResultSection(
        type: 'NEXT_PLAN',
        label: '다음 계획',
        summary: '다음 진료에서 검사 결과를 설명받고 이후 치료 계획을 상담해주세요.',
      ),
    ],
  ),
];
