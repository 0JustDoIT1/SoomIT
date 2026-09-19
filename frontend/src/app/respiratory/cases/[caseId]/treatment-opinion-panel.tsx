"use client";

import { useRef, useState } from "react";
import { showToast } from "@/components/ui/toast/toast";
import type { AuthorizedFetch, TreatmentOpinionResponse } from "./treatment-prescription-types";

export function TreatmentOpinionPanel({ caseId, apiBaseUrl, authorizedFetch }: { caseId: string; apiBaseUrl: string; authorizedFetch: AuthorizedFetch }) {
  const [data, setData] = useState<TreatmentOpinionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generatingRef = useRef(false);

  const generate = async () => {
    if (generatingRef.current) return;
    const toastId = `case-treatment-ai-${caseId}`;
    generatingRef.current = true;
    setLoading(true);
    setError("");
    showToast.info("AI 분석이 시작되었습니다.", { id: toastId });
    try {
      const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/treatment-opinion/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || body.status || "Treatment opinion request failed.");
      setData(body);
      showToast.success("AI 분석이 완료되었습니다.", { id: toastId });
    } catch (caught) {
      console.error(caught);
      setError("AI 치료 소견을 생성하지 못했습니다.");
      showToast.error("AI 분석에 실패했습니다.", { id: toastId });
    } finally {
      generatingRef.current = false;
      setLoading(false);
    }
  };

  return <section className="rounded-lg border border-violet-100 bg-white p-4"><div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold text-violet-600">MEDGEMMA</p><h3 className="text-sm font-bold">의료진 검토용 AI 치료 소견 초안</h3></div><button type="button" onClick={generate} disabled={loading} className="rounded bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300">{loading ? "생성 중" : data ? "다시 생성" : "AI 치료 소견 생성"}</button></div>{error && <p role="alert" className="mt-3 text-xs text-rose-600">{error}</p>}{data && <div className="mt-3 space-y-2 text-xs"><p>상태: {data.status} · Safety: {data.safety_status ?? "-"}</p><p className="whitespace-pre-wrap rounded bg-violet-50 p-3">{data.opinion ?? "소견 없음"}</p><p className="text-slate-500">review_required: {String(data.review_required)}</p></div>}</section>;
}
