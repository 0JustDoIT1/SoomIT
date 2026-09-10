'use client';
import CaseSelectionRequired from '../CaseSelectionRequired';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRespiratoryAuth } from '../_components/respiratory-auth-provider';
import { API_BASE_URL } from '../_lib/respiratory-api';

type ClinicalResult = {
  id: string;
  exam_type: string;
  exam_name: string;
  result_status: string;
  result_status_label: string;
  result_date: string | null;
  result_detail: {
    xray?: {
      assessment: string;
      assessment_label: string;
      finding_summary: string | null;
      recommended_action: string;
    };
    ct?: {
      overall_assessment: string;
      overall_assessment_label: string;
      overall_malignancy_risk: string | number | null;
      finding_summary: string | null;
    };
    pathology?: {
      malignancy_status: string;
      malignancy_status_label: string;
      histologic_type: string | null;
      subtype: string | null;
      diagnosis_summary: string | null;
    };
    tnm?: {
      t_category: string | null;
      n_category: string | null;
      m_category: string | null;
      stage_group: string | null;
      evidence: string | null;
      note: string | null;
    };
    gene?: {
      interpretation: string | null;
      additional_test_recommended: boolean;
      findings: {
        gene_symbol: string;
        assessment: string;
        assessment_label: string;
        note: string | null;
      }[];
    };
    pdl1?: {
      tps_percent: number | string | null;
      interpretation: string | null;
      note: string | null;
    };
  };
};

export default function RespiratoryResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
          불러오는 중입니다.
        </div>
      }
    >
      <RespiratoryResultsContent />
    </Suspense>
  );
}

function RespiratoryResultsContent() {
  const searchParams = useSearchParams();
  const caseId = searchParams.get('caseId');
  const { authorizedFetch } = useRespiratoryAuth();

  const [results, setResults] = useState<ClinicalResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!caseId) return;
    const controller = new AbortController();

    const fetchResults = async () => {
      try {
        setLoading(true);
        setError('');

        const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/clinical-results/`, { signal: controller.signal });

        if (!response.ok) {
          throw new Error('검사 결과를 불러오지 못했습니다.');
        }

        const data = await response.json();
        if (!controller.signal.aborted) setResults(data);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error
            ? err.message
            : '검사 결과 조회 중 오류가 발생했습니다.'
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchResults();
    return () => controller.abort();
  }, [authorizedFetch, caseId]);

  const resultMap = useMemo(() => {
    const map = new Map<string, ClinicalResult>();

    for (const result of results) {
      map.set(result.exam_type, result);
    }

    return map;
  }, [results]);

  if (!caseId) {
    return (
      <CaseSelectionRequired
        title="검사 결과"
        description="검사 결과를 확인할 환자를 먼저 선택해주세요."
      />
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
        검사 결과를 불러오는 중입니다.
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 p-6 text-sm text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">검사 결과</h1>

        <p className="mt-2 text-sm text-slate-500">
          의료진이 확정한 임상 검사 결과를 단계별로 확인합니다.
        </p>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <ResultStageCard title="X-ray" result={resultMap.get('XRAY')} />
        <ResultStageCard title="CT" result={resultMap.get('CT')} />
        <ResultStageCard title="병리" result={resultMap.get('PATHOLOGY')} />
        <ResultStageCard title="TNM" result={resultMap.get('STAGING')} />
        <ResultStageCard title="유전자" result={resultMap.get('GENE')} />
      </div>

      <div className="mt-6 space-y-5">
        {results.map((result) => (
          <ResultSection key={result.id} result={result} />
        ))}

        {results.length === 0 && (
          <div className="rounded-2xl border border-emerald-100 bg-white py-16 text-center text-sm text-slate-400 shadow-sm">
            확정된 검사 결과가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

function ResultStageCard({
  title,
  result,
}: {
  title: string;
  result?: ClinicalResult;
}) {
  const confirmed = Boolean(result);

  return (
    <div
      className={`rounded-2xl border p-4 ${
        confirmed
          ? 'border-emerald-200 bg-emerald-50/70'
          : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-700">{title}</p>

        <span
          className={`h-2.5 w-2.5 rounded-full ${
            confirmed ? 'bg-emerald-400' : 'bg-slate-300'
          }`}
        />
      </div>

      <p
        className={`mt-3 text-xs font-medium ${
          confirmed ? 'text-emerald-600' : 'text-slate-400'
        }`}
      >
        {confirmed ? '확정 완료' : '결과 없음'}
      </p>
    </div>
  );
}

function ResultSection({ result }: { result: ClinicalResult }) {
  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">
            {result.exam_name}
          </h2>

          <p className="mt-1 text-xs text-slate-400">의료진 확정 결과</p>
        </div>

        <div className="text-right">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            {result.result_status_label || result.result_status}
          </span>

          {result.result_date && (
            <p className="mt-2 text-xs text-slate-400">
              {formatDateTime(result.result_date)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5">
        <ClinicalDetail result={result} />
      </div>
    </section>
  );
}

function ClinicalDetail({ result }: { result: ClinicalResult }) {
  const detail = result.result_detail ?? {};

  if (result.exam_type === 'XRAY' && detail.xray) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Info label="판정" value={detail.xray.assessment_label} />
        <Info label="권고 조치" value={detail.xray.recommended_action} />
        <Info label="주요 소견" value={detail.xray.finding_summary} wide />
      </div>
    );
  }

  if (result.exam_type === 'CT' && detail.ct) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Info label="종합 판정" value={detail.ct.overall_assessment_label} />
        <Info label="악성 위험도" value={detail.ct.overall_malignancy_risk} />
        <Info label="주요 소견" value={detail.ct.finding_summary} wide />
      </div>
    );
  }

  if (result.exam_type === 'PATHOLOGY' && detail.pathology) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Info
          label="악성 여부"
          value={detail.pathology.malignancy_status_label}
        />
        <Info label="조직형" value={detail.pathology.histologic_type} />
        <Info label="세부 아형" value={detail.pathology.subtype} />
        <Info label="진단 요약" value={detail.pathology.diagnosis_summary} />
      </div>
    );
  }

  if (result.exam_type === 'STAGING' && detail.tnm) {
    return (
      <div className="grid grid-cols-4 gap-3">
        <Info label="T" value={detail.tnm.t_category} />
        <Info label="N" value={detail.tnm.n_category} />
        <Info label="M" value={detail.tnm.m_category} />
        <Info label="Stage" value={detail.tnm.stage_group} />

        <Info label="판단 근거" value={detail.tnm.evidence} wide />

        <Info label="비고" value={detail.tnm.note} wide />
      </div>
    );
  }

  if (result.exam_type === 'GENE') {
    return (
      <div className="space-y-4">
        {detail.gene && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Info label="해석" value={detail.gene.interpretation} />

              <Info
                label="추가 검사 권고"
                value={
                  detail.gene.additional_test_recommended ? '필요' : '없음'
                }
              />
            </div>

            <div className="rounded-xl bg-emerald-50/40 p-4">
              <p className="mb-3 text-xs font-semibold text-slate-500">
                유전자 결과
              </p>

              <div className="space-y-2">
                {detail.gene.findings.map((finding, index) => (
                  <div
                    key={`${finding.gene_symbol}-${index}`}
                    className="flex items-center justify-between rounded-lg bg-white px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-700">
                        {finding.gene_symbol}
                      </p>

                      {finding.note && (
                        <p className="mt-1 text-xs text-slate-400">
                          {finding.note}
                        </p>
                      )}
                    </div>

                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                      {finding.assessment_label}
                    </span>
                  </div>
                ))}

                {detail.gene.findings.length === 0 && (
                  <p className="text-sm text-slate-400">
                    등록된 유전자 결과가 없습니다.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {detail.pdl1 && (
          <div className="grid grid-cols-3 gap-3">
            <Info
              label="PD-L1 TPS"
              value={
                detail.pdl1.tps_percent !== null
                  ? `${detail.pdl1.tps_percent}%`
                  : null
              }
            />

            <Info label="PD-L1 해석" value={detail.pdl1.interpretation} />

            <Info label="비고" value={detail.pdl1.note} />
          </div>
        )}
      </div>
    );
  }

  return <p className="text-sm text-slate-400">상세 결과 데이터가 없습니다.</p>;
}

function Info({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: unknown;
  wide?: boolean;
}) {
  return (
    <div
      className={`rounded-xl bg-emerald-50/40 px-4 py-3 ${
        wide ? 'col-span-full' : ''
      }`}
    >
      <p className="text-xs text-slate-400">{label}</p>

      <p className="mt-1 break-words text-sm font-semibold text-slate-700">
        {value === null || value === undefined || value === ''
          ? '-'
          : String(value)}
      </p>
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
