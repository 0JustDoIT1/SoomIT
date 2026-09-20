import '../models/exam_result.dart';

final List<ExamResult> mockExamResults = [
  // =========================================================
  // 1. X-ray
  // =========================================================
  ExamResult(
    id: 'mock-xray-001',
    examType: 'XRAY',
    examName: '흉부 X-ray',
    resultStatus: 'CONFIRMED',
    resultStatusLabel: '확정',
    resultDate: DateTime(
      2026,
      9,
      8,
      10,
      30,
    ),
    resultSummary: 'X-ray 판정 결과가 확인되었습니다.',
    hospitalName: '숨잇병원',
    departmentName: '영상의학과',
    doctorName: '김태윤',
    resultSections: const [
      ExamResultSection(
        type: 'XRAY_ASSESSMENT',
        label: '최종 판정',
        summary: '음성',
      ),
    ],
  ),

  // =========================================================
  // 2. CT
  // =========================================================
  ExamResult(
    id: 'mock-ct-001',
    examType: 'CT',
    examName: '흉부 CT',
    resultStatus: 'CONFIRMED',
    resultStatusLabel: '확정',
    resultDate: DateTime(
      2026,
      9,
      10,
      14,
      20,
    ),
    resultSummary: 'CT 검사에서 결절이 확인되었습니다.',
    hospitalName: '숨잇병원',
    departmentName: '영상의학과',
    doctorName: '김태윤',
    resultSections: const [
      ExamResultSection(
        type: 'CT_ASSESSMENT',
        label: '종합 판정',
        summary: '결절발견',
      ),
      ExamResultSection(
        type: 'CT_MALIGNANCY_RISK',
        label: '악성 위험도',
        summary: '32.50%',
      ),
      ExamResultSection(
        type: 'CT_NODULE_LOCATION_1',
        label: '결절 위치',
        summary: '우상엽',
      ),
      ExamResultSection(
        type: 'CT_NODULE_SIZE_1',
        label: '결절 크기',
        summary: '12.40 mm',
      ),
    ],
  ),

  // =========================================================
  // 3. PET-CT
  //
  // TNM은 PET-CT 상세 결과 안에 포함
  // =========================================================
  ExamResult(
    id: 'mock-pet-001',
    examType: 'PET_CT_TNM',
    examName: 'PET-CT',
    resultStatus: 'CONFIRMED',
    resultStatusLabel: '확정',
    resultDate: DateTime(
      2026,
      9,
      12,
      11,
      0,
    ),
    resultSummary: 'PET-CT 병기 평가 결과가 확인되었습니다.',
    hospitalName: '숨잇병원',
    departmentName: '핵의학과',
    doctorName: '김태윤',
    resultSections: const [
      ExamResultSection(
        type: 'TNM_T',
        label: 'T 범주',
        summary: 'T1',
      ),
      ExamResultSection(
        type: 'TNM_N',
        label: 'N 범주',
        summary: 'N0',
      ),
      ExamResultSection(
        type: 'TNM_M',
        label: 'M 범주',
        summary: 'M0',
      ),
      ExamResultSection(
        type: 'TNM_STAGE',
        label: '최종 병기',
        summary: 'IA',
      ),
    ],
  ),

  // =========================================================
  // 4. 조직(유전자)검사
  //
  // 조직검사 + 유전자검사 + PD-L1
  // =========================================================
  ExamResult(
    id: 'mock-pathology-group-001',
    examType: 'PATHOLOGY_GENE',
    examName: '조직(유전자)검사',
    resultStatus: 'CONFIRMED',
    resultStatusLabel: '확정',
    resultDate: DateTime(
      2026,
      9,
      17,
      15,
      10,
    ),
    resultSummary:
        '조직검사, 유전자검사 및 PD-L1 결과가 확인되었습니다.',
    hospitalName: '숨잇병원',
    departmentName: '병리과',
    doctorName: '김태윤',
    resultSections: const [
      // 조직검사
      ExamResultSection(
        type: 'PATHOLOGY_MALIGNANCY',
        label: '악성 여부',
        summary: '악성',
      ),
      ExamResultSection(
        type: 'PATHOLOGY_HISTOLOGY',
        label: '조직형',
        summary: 'Adenocarcinoma',
      ),
      ExamResultSection(
        type: 'PATHOLOGY_SUBTYPE',
        label: '세부 아형',
        summary: 'LUAD',
      ),

      // 유전자검사
      ExamResultSection(
        type: 'GENE_FINDING',
        label: 'EGFR',
        summary: '양성가능성',
      ),
      ExamResultSection(
        type: 'GENE_FINDING',
        label: 'KRAS',
        summary: '음성가능성',
      ),
      ExamResultSection(
        type: 'GENE_FINDING',
        label: 'ALK',
        summary: '음성가능성',
      ),

      // PD-L1
      ExamResultSection(
        type: 'PDL1_TPS',
        label: 'TPS',
        summary: '35%',
      ),
    ],
  ),
];