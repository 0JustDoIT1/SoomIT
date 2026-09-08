"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import CaseSelectionRequired from "../CaseSelectionRequired";

type AiAnalysis = {
  id: string;
  analysis_type: string;
  analysis_type_label: string;
  status: string;
  status_label: string;
  model_name: string;
  model_version_name: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  result_detail: {
    schema_version?: string;
    result_payload?: Record<string, unknown>;
    result_files?: unknown[];

    xray?: {
      assessment: string;
      assessment_label: string;
      suspicion_score: number | string | null;
    };

    ct?: {
      overall_malignancy_risk: number | string | null;
      nodules: {
        nodule_no: number;
        detection_confidence: number | string | null;
        malignancy_risk: number | string | null;
        finding_payload: Record<string, unknown> | null;
      }[];
    };

    specimen_adequacy?: {
      adequacy_status: string;
      adequacy_status_label: string;
      tumor_cell_ratio: number | string | null;
      confidence: number | string | null;
    };

    pathology?: {
      malignancy_assessment: string;
      malignancy_assessment_label: string;
      malignancy_probability: number | string | null;
      predicted_histologic_type: string | null;
      predicted_subtype: string | null;
      subtype_confidence: number | string | null;
    };

    tnm?: {
      predicted_t: string | null;
      predicted_n: string | null;
      predicted_m: string | null;
      predicted_stage_group: string | null;
      confidence: number | string | null;
    };

    genes?: {
      gene_symbol: string;
      predicted_status: string;
      predicted_status_label: string;
      predicted_probability: number | string | null;
    }[];

    treatment?: {
      overall_opinion: string;
      recommended_plan: string;
      targeted_therapy_recommendation: string | null;
      prescription_draft: Record<string, unknown> | null;
      rationale: string | null;
      evidence: unknown;
    };
  } | null;
};

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
    };
    ct?: {
      overall_assessment: string;
      overall_assessment_label: string;
      overall_malignancy_risk: number | string | null;
    };
    pathology?: {
      malignancy_status: string;
      malignancy_status_label: string;
      histologic_type: string | null;
      subtype: string | null;
    };
    tnm?: {
      t_category: string | null;
      n_category: string | null;
      m_category: string | null;
      stage_group: string | null;
    };
    gene?: {
      findings: {
        gene_symbol: string;
        assessment: string;
        assessment_label: string;
      }[];
    };
  };
};

export default function RespiratoryAiAnalysisPage() {
  const searchParams = useSearchParams();
  const caseId = searchParams.get("caseId");

  const [analyses, setAnalyses] = useState<AiAnalysis[]>([]);
  const [clinicalResults, setClinicalResults] = useState<ClinicalResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!caseId) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");

        const loginResponse = await fetch(
          "http://127.0.0.1:8000/api/auth/staff/login/",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              hospital_code: "SUMIT001",
              username: "doctor01",
              password: "test1234",
            }),
          }
        );

        if (!loginResponse.ok) {
          throw new Error("의료진 로그인에 실패했습니다.");
        }

        const loginData = await loginResponse.json();
        const headers = {
          Authorization: `Bearer ${loginData.access}`,
        };

        const [aiResponse, clinicalResponse] = await Promise.all([
          fetch(
            `http://127.0.0.1:8000/api/doctor/cases/${caseId}/ai-results/`,
            { headers }
          ),
          fetch(
            `http://127.0.0.1:8000/api/doctor/cases/${caseId}/clinical-results/`,
            { headers }
          ),
        ]);

        if (!aiResponse.ok) {
          throw new Error("AI 분석 결과를 불러오지 못했습니다.");
        }

        if (!clinicalResponse.ok) {
          throw new Error("의료진 확정 결과를 불러오지 못했습니다.");
        }

        const aiData = await aiResponse.json();
        const clinicalData = await clinicalResponse.json();

        setAnalyses(aiData);
        setClinicalResults(clinicalData);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "AI 분석 조회 중 오류가 발생했습니다."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [caseId]);

  const clinicalMap = useMemo(() => {
    const map = new Map<string, ClinicalResult>();

    for (const result of clinicalResults) {
      map.set(result.exam_type, result);
    }

    return map;
  }, [clinicalResults]);

    if (!caseId) {
        return (
        <CaseSelectionRequired
            title="AI 분석"
            description="AI 분석 결과를 확인할 환자를 먼저 선택해주세요."
        />
        );
    }

    if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
        AI 분석 결과를 불러오는 중입니다.
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
        <h1 className="text-2xl font-bold text-slate-800">AI 분석</h1>

        <p className="mt-2 text-sm text-slate-500">
          AI 예측과 의료진 확정 결과를 함께 확인합니다.
        </p>
      </div>

      <div className="mb-6 rounded-2xl border border-amber-100 bg-amber-50/60 px-5 py-4">
        <p className="text-sm font-semibold text-amber-700">
          AI 결과는 의료진 판단을 보조하기 위한 참고 정보입니다.
        </p>

        <p className="mt-1 text-xs text-amber-600">
          최종 진단 및 치료 결정은 의료진 확정 결과를 기준으로 합니다.
        </p>
      </div>

      <div className="space-y-5">
        {analyses.map((analysis) => (
          <AiAnalysisCard
            key={analysis.id}
            analysis={analysis}
            clinicalResult={getClinicalResult(
              analysis.analysis_type,
              clinicalMap
            )}
          />
        ))}

        {analyses.length === 0 && (
          <div className="rounded-2xl border border-emerald-100 bg-white py-16 text-center text-sm text-slate-400 shadow-sm">
            등록된 AI 분석 결과가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

function AiAnalysisCard({
  analysis,
  clinicalResult,
}: {
  analysis: AiAnalysis;
  clinicalResult?: ClinicalResult;
}) {
  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">
            {analysis.analysis_type_label}
          </h2>

          <p className="mt-1 text-xs text-slate-400">
            {analysis.model_name} · v{analysis.model_version_name}
          </p>
        </div>

        <div className="text-right">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              analysis.status === "SUCCEEDED"
                ? "bg-emerald-50 text-emerald-700"
                : analysis.status === "FAILED"
                ? "bg-red-50 text-red-600"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {analysis.status_label}
          </span>

          {analysis.completed_at && (
            <p className="mt-2 text-xs text-slate-400">
              {formatDateTime(analysis.completed_at)}
            </p>
          )}
        </div>
      </div>

      {analysis.error_message && (
        <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {analysis.error_message}
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-emerald-50/50 p-5">
          <p className="text-xs font-semibold text-emerald-600">
            AI 예측
          </p>

          <div className="mt-4">
            <AiDetail analysis={analysis} />
          </div>
        </div>

        <div className="rounded-2xl bg-slate-50 p-5">
          <p className="text-xs font-semibold text-slate-500">
            의료진 확정 결과
          </p>

          <div className="mt-4">
            {clinicalResult ? (
              <ClinicalSummary result={clinicalResult} />
            ) : (
              <p className="text-sm text-slate-400">
                연결된 확정 결과가 없습니다.
              </p>
            )}
          </div>
        </div>
      </div>

      <ComparisonBadge
        analysis={analysis}
        clinicalResult={clinicalResult}
      />
    </section>
  );
}

function AiDetail({ analysis }: { analysis: AiAnalysis }) {
  const detail = analysis.result_detail;

  if (!detail) {
    return <p className="text-sm text-slate-400">AI 결과가 없습니다.</p>;
  }

  if (detail.xray) {
    return (
      <div className="space-y-3">
        <Info label="AI 판정" value={detail.xray.assessment_label} />
        <Info
          label="의심 점수"
          value={formatPercent(detail.xray.suspicion_score)}
        />
      </div>
    );
  }

  if (detail.ct) {
    return (
      <div className="space-y-3">
        <Info
          label="전체 악성 위험도"
          value={
            detail.ct.overall_malignancy_risk !== null
              ? `${detail.ct.overall_malignancy_risk}%`
              : null
          }
        />

        <Info
          label="검출 결절 수"
          value={`${detail.ct.nodules.length}개`}
        />

        {detail.ct.nodules.map((nodule) => (
          <div
            key={nodule.nodule_no}
            className="rounded-xl bg-white px-4 py-3"
          >
            <p className="text-sm font-bold text-slate-700">
              Nodule {nodule.nodule_no}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              검출 신뢰도 {formatPercent(nodule.detection_confidence)}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              악성 위험도{" "}
              {nodule.malignancy_risk !== null
                ? `${nodule.malignancy_risk}%`
                : "-"}
            </p>
          </div>
        ))}
      </div>
    );
  }

  if (detail.specimen_adequacy) {
    return (
      <div className="space-y-3">
        <Info
          label="검체 적정성"
          value={detail.specimen_adequacy.adequacy_status_label}
        />
        <Info
          label="종양세포 비율"
          value={detail.specimen_adequacy.tumor_cell_ratio}
        />
        <Info
          label="신뢰도"
          value={formatPercent(detail.specimen_adequacy.confidence)}
        />
      </div>
    );
  }

  if (detail.pathology) {
    return (
      <div className="space-y-3">
        <Info
          label="악성 예측"
          value={detail.pathology.malignancy_assessment_label}
        />
        <Info
          label="악성 확률"
          value={formatPercent(detail.pathology.malignancy_probability)}
        />
        <Info
          label="예측 조직형"
          value={detail.pathology.predicted_histologic_type}
        />
        <Info
          label="예측 아형"
          value={detail.pathology.predicted_subtype}
        />
        <Info
          label="아형 신뢰도"
          value={formatPercent(detail.pathology.subtype_confidence)}
        />
      </div>
    );
  }

  if (detail.tnm) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Info label="T" value={detail.tnm.predicted_t} />
        <Info label="N" value={detail.tnm.predicted_n} />
        <Info label="M" value={detail.tnm.predicted_m} />
        <Info
          label="Stage"
          value={detail.tnm.predicted_stage_group}
        />
        <Info
          label="신뢰도"
          value={formatPercent(detail.tnm.confidence)}
          wide
        />
      </div>
    );
  }

  if (detail.genes) {
    return (
      <div className="space-y-2">
        {detail.genes.map((gene) => (
          <div
            key={gene.gene_symbol}
            className="flex items-center justify-between rounded-xl bg-white px-4 py-3"
          >
            <div>
              <p className="text-sm font-bold text-slate-700">
                {gene.gene_symbol}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                확률 {formatPercent(gene.predicted_probability)}
              </p>
            </div>

            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              {gene.predicted_status_label}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (detail.treatment) {
    return (
      <div className="space-y-3">
        <Info
          label="AI 종합 의견"
          value={detail.treatment.overall_opinion}
        />

        <Info
          label="추천 치료 계획"
          value={detail.treatment.recommended_plan}
        />

        <Info
          label="표적치료 의견"
          value={detail.treatment.targeted_therapy_recommendation}
        />

        <Info
          label="추천 근거"
          value={detail.treatment.rationale}
        />
      </div>
    );
  }

  return (
    <p className="text-sm text-slate-400">
      표시할 AI 상세 결과가 없습니다.
    </p>
  );
}

function ClinicalSummary({ result }: { result: ClinicalResult }) {
  const detail = result.result_detail ?? {};

  if (detail.xray) {
    return (
      <Info
        label="확정 판정"
        value={detail.xray.assessment_label}
      />
    );
  }

  if (detail.ct) {
    return (
      <div className="space-y-3">
        <Info
          label="확정 판정"
          value={detail.ct.overall_assessment_label}
        />
        <Info
          label="악성 위험도"
          value={
            detail.ct.overall_malignancy_risk !== null
              ? `${detail.ct.overall_malignancy_risk}%`
              : null
          }
        />
      </div>
    );
  }

  if (detail.pathology) {
    return (
      <div className="space-y-3">
        <Info
          label="악성 여부"
          value={detail.pathology.malignancy_status_label}
        />
        <Info
          label="조직형"
          value={detail.pathology.histologic_type}
        />
        <Info
          label="세부 아형"
          value={detail.pathology.subtype}
        />
      </div>
    );
  }

  if (detail.tnm) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Info label="T" value={detail.tnm.t_category} />
        <Info label="N" value={detail.tnm.n_category} />
        <Info label="M" value={detail.tnm.m_category} />
        <Info label="Stage" value={detail.tnm.stage_group} />
      </div>
    );
  }

  if (detail.gene) {
    return (
      <div className="space-y-2">
        {detail.gene.findings.map((gene) => (
          <div
            key={gene.gene_symbol}
            className="flex items-center justify-between rounded-xl bg-white px-4 py-3"
          >
            <span className="text-sm font-bold text-slate-700">
              {gene.gene_symbol}
            </span>

            <span className="text-xs font-semibold text-slate-600">
              {gene.assessment_label}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <p className="text-sm text-slate-400">
      확정 상세 결과가 없습니다.
    </p>
  );
}

function ComparisonBadge({
  analysis,
  clinicalResult,
}: {
  analysis: AiAnalysis;
  clinicalResult?: ClinicalResult;
}) {
  const comparison = compareResult(analysis, clinicalResult);

  if (!comparison) return null;

  return (
    <div
      className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${
        comparison === "MATCH"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-amber-50 text-amber-700"
      }`}
    >
      {comparison === "MATCH"
        ? "AI 예측과 의료진 확정 결과가 일치합니다."
        : "AI 예측과 의료진 확정 결과가 다릅니다. 의료진 확정 결과를 우선합니다."}
    </div>
  );
}

function compareResult(
  analysis: AiAnalysis,
  clinicalResult?: ClinicalResult
) {
  if (!clinicalResult || !analysis.result_detail) return null;

  const ai = analysis.result_detail;
  const clinical = clinicalResult.result_detail ?? {};

  if (ai.xray && clinical.xray) {
    return ai.xray.assessment === clinical.xray.assessment
      ? "MATCH"
      : "MISMATCH";
  }

  if (ai.tnm && clinical.tnm) {
    const match =
      ai.tnm.predicted_t === clinical.tnm.t_category &&
      ai.tnm.predicted_n === clinical.tnm.n_category &&
      ai.tnm.predicted_m === clinical.tnm.m_category;

    return match ? "MATCH" : "MISMATCH";
  }

  if (ai.pathology && clinical.pathology) {
    const match =
      ai.pathology.predicted_histologic_type ===
      clinical.pathology.histologic_type;

    return match ? "MATCH" : "MISMATCH";
  }

  return null;
}

function getClinicalResult(
  analysisType: string,
  clinicalMap: Map<string, ClinicalResult>
) {
  if (analysisType === "XRAY_SCREENING") {
    return clinicalMap.get("XRAY");
  }

  if (analysisType === "CT_NODULE") {
    return clinicalMap.get("CT");
  }

  if (analysisType === "PATHOLOGY_DIAGNOSIS") {
    return clinicalMap.get("PATHOLOGY");
  }

  if (analysisType === "TNM_STAGING") {
    return clinicalMap.get("STAGING");
  }

  if (analysisType === "GENE_PREDICTION") {
    return clinicalMap.get("GENE");
  }

  return undefined;
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
      className={`rounded-xl bg-white px-4 py-3 ${
        wide ? "col-span-full" : ""
      }`}
    >
      <p className="text-xs text-slate-400">{label}</p>

      <p className="mt-1 break-words text-sm font-semibold text-slate-700">
        {value === null || value === undefined || value === ""
          ? "-"
          : String(value)}
      </p>
    </div>
  );
}

function formatPercent(value: number | string | null) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return String(value);
  }

  if (number <= 1) {
    return `${(number * 100).toFixed(1)}%`;
  }

  return `${number}%`;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
