"use client";

import { useEffect, useRef, useState } from "react";

type MedicalOpinionResponse = {
  opinion: string;
  source_results: { id: string; stage: string; confirmed_at: string | null }[];
};

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function MedicalOpinionPanel({
  caseId,
  confirmedResultCount,
  apiBaseUrl,
  authorizedFetch,
}: {
  caseId: string;
  confirmedResultCount: number;
  apiBaseUrl: string;
  authorizedFetch: AuthorizedFetch;
}) {
  const [result, setResult] = useState<MedicalOpinionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    requestRef.current?.abort();
    return () => requestRef.current?.abort();
  }, [caseId]);

  const generate = async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");

    try {
      const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/medical-opinion/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: "확정된 임상 결과만 근거로 의료진 검토용 종합 소견 초안을 간결하게 작성해주세요." }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "종합 소견 초안을 생성하지 못했습니다.");
      if (!data.opinion || !Array.isArray(data.source_results)) throw new Error("종합 소견 응답 형식을 확인할 수 없습니다.");
      if (!controller.signal.aborted) setResult(data as MedicalOpinionResponse);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "종합 소견 초안을 생성하지 못했습니다.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const disabled = confirmedResultCount === 0 || loading;

  return (
    <section className="rounded-lg border border-violet-100 bg-white p-4" aria-labelledby="medical-opinion-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold text-violet-600">AI 종합 분석</p>
          <h2 id="medical-opinion-title" className="mt-0.5 text-sm font-bold text-slate-900">의료진 검토용 종합 소견 초안</h2>
          <p className="mt-1 text-xs text-slate-500">현재 Case의 확정된 임상 결과만 전송하며, 생성 내용은 자동 저장되거나 확정되지 않습니다.</p>
        </div>
        <button type="button" onClick={generate} disabled={disabled} className="shrink-0 rounded-md bg-violet-600 px-4 py-2 text-xs font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400">
          {loading ? "생성 중" : result ? "다시 생성" : "소견 초안 생성"}
        </button>
      </div>

      {confirmedResultCount === 0 && <p className="mt-3 rounded-md bg-slate-50 px-3 py-3 text-xs text-slate-500">확정된 임상 결과가 없어 소견 초안을 생성할 수 없습니다.</p>}
      {error && <p role="alert" className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-700">{error}</p>}
      {result && (
        <div className="mt-3 rounded-md border border-violet-100 bg-violet-50/30 p-4">
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{result.opinion}</p>
          <p className="mt-3 text-[10px] text-slate-500">근거로 사용된 확정 결과 {result.source_results.length}건 · 의료진 검토 전 초안</p>
        </div>
      )}
    </section>
  );
}
