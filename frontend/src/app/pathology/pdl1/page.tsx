"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PathologyAuthPanel } from "../_components/pathology-auth-panel";
import { usePathologyAuth } from "../_components/pathology-auth-provider";
import { PathologyStateMessage } from "../_components/pathology-state-message";
import {
  casePdl1AiResultsApiUrl, casePdl1AnalysisRunApiUrl,
  readPathologyAiAnalyses, readPathologyAiAnalysis, readWorkItems,
  statusLabel, statusStyle, type PathologyAiAnalysis, type WorkItem,
  WORK_ITEMS_API_URL,
} from "../_lib/pathology-api";

function dateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function PathologyPdL1Page() {
  const { authorizedFetch, isConnected, markConnected } = usePathologyAuth();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<PathologyAiAnalysis[]>([]);
  const [featureFile, setFeatureFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(isConnected);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? items[0] ?? null, [items, selectedId]);

  const loadItems = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await authorizedFetch(WORK_ITEMS_API_URL);
      const next = (await readWorkItems(response)).filter((item) => item.task_type === "PD_L1_REVIEW");
      setItems(next);
      setSelectedId((current) => next.some((item) => item.id === current) ? current : (next[0]?.id ?? null));
      markConnected();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "PD-L1 작업을 불러오지 못했습니다.");
    } finally { setLoading(false); }
  }, [authorizedFetch, markConnected]);

  const loadResults = useCallback(async (caseId: string) => {
    const response = await authorizedFetch(casePdl1AiResultsApiUrl(caseId));
    setAnalyses(await readPathologyAiAnalyses(response));
  }, [authorizedFetch]);

  useEffect(() => {
    if (isConnected) void Promise.resolve().then(loadItems);
  }, [isConnected, loadItems]);
  useEffect(() => {
    if (selected) void Promise.resolve().then(() => loadResults(selected.case_id)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "결과 조회에 실패했습니다."));
  }, [loadResults, selected]);

  async function runAnalysis() {
    if (!selected || !featureFile) return;
    setRunning(true); setError("");
    const form = new FormData();
    form.append("feature_file", featureFile);
    if (selected.wsi_id) form.append("wsi_id", selected.wsi_id);
    try {
      const response = await authorizedFetch(casePdl1AnalysisRunApiUrl(selected.case_id), { method: "POST", body: form });
      const created = await readPathologyAiAnalysis(response);
      setAnalyses((current) => [created, ...current]); setFeatureFile(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "PD-L1 분석 실행에 실패했습니다.");
      await loadResults(selected.case_id).catch(() => undefined);
    } finally { setRunning(false); }
  }

  const latest = analyses[0] ?? null;
  const result = latest?.result_detail?.pdl1 ?? null;
  return <div>
    <div className="flex items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-slate-950">PD-L1 분석</h1><p className="mt-2 text-sm text-slate-500">Virchow2 feature를 이용한 AMD-MIL 3등급 결과를 확인합니다.</p></div>
      <button type="button" onClick={loadItems} disabled={loading} className="rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{loading ? "불러오는 중..." : "새로고침"}</button>
    </div>
    <PathologyAuthPanel loading={loading} onConnect={loadItems} />
    {error && <PathologyStateMessage variant="error" title={error} className="mt-6" />}
    <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(520px,1fr)_minmax(420px,0.8fr)]">
      <section className="min-w-0 overflow-hidden border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4"><h2 className="text-sm font-semibold">PD-L1 검토 작업</h2></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr>{["환자", "Case", "검체", "WSI", "상태", "생성일"].map((label) => <th key={label} className="whitespace-nowrap px-4 py-3">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{items.map((item) => <tr key={item.id} onClick={() => { setSelectedId(item.id); setAnalyses([]); setFeatureFile(null); }} className={`cursor-pointer hover:bg-blue-50 ${selected?.id === item.id ? "bg-blue-50" : ""}`}>
            <td className="min-w-36 px-4 py-3"><p className="font-semibold">{item.patient_name}</p><p className="text-xs text-slate-500">{item.patient_code}</p></td>
            <td className="whitespace-nowrap px-4 py-3">{item.case_code}</td><td className="whitespace-nowrap px-4 py-3">{item.specimen_code ?? "-"}</td><td className="whitespace-nowrap px-4 py-3">{item.slide_code ?? "-"}</td>
            <td className="whitespace-nowrap px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(item.status)}`}>{statusLabel[item.status] ?? item.status}</span></td><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{dateTime(item.created_at)}</td>
          </tr>)}{!loading && items.length === 0 && <tr><td colSpan={6} className="px-5 py-16 text-center text-slate-500">등록된 PD-L1 검토 작업이 없습니다.</td></tr>}</tbody>
        </table></div>
      </section>
      <div className="space-y-5">
        <section className="border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="text-sm font-semibold">Feature 분석 실행</h2></div><div className="space-y-4 p-5">
          {selected ? <><p className="text-sm text-slate-600">{selected.case_code} · {selected.slide_code ?? "연결된 WSI 없음"}</p><input type="file" accept=".pt,application/octet-stream" onChange={(event) => setFeatureFile(event.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2"/><button type="button" disabled={!featureFile || running} onClick={runAnalysis} className="w-full rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{running ? "분석 중..." : "PD-L1 분석 실행"}</button><p className="text-xs leading-5 text-slate-500">WSI 원본이 아니라 Virchow2에서 추출한 `[N, 2560]` `.pt` feature만 사용합니다.</p></> : <p className="py-6 text-center text-sm text-slate-500">먼저 검토 작업을 선택해 주세요.</p>}
        </div></section>
        <section className="border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="text-sm font-semibold">최신 분석 결과</h2></div>
          {result && latest ? <dl className="grid grid-cols-[130px_1fr] gap-3 p-5 text-sm"><dt className="text-slate-500">TPS 구간</dt><dd className="font-semibold">{result.predicted_tps_range_label}</dd><dt className="text-slate-500">예측 클래스</dt><dd>{result.predicted_class}</dd><dt className="text-slate-500">Confidence</dt><dd>{(Number(result.confidence) * 100).toFixed(2)}%</dd><dt className="text-slate-500">모델</dt><dd>{latest.model_name} {latest.model_version_name}</dd><dt className="text-slate-500">완료일</dt><dd>{dateTime(latest.completed_at)}</dd></dl> : latest?.status === "FAILED" ? <p className="p-5 text-sm text-red-700">분석 실패: {latest.error_message ?? "원인 미상"}</p> : <p className="px-5 py-12 text-center text-sm text-slate-500">저장된 PD-L1 분석 결과가 없습니다.</p>}
        </section>
      </div>
    </div>
  </div>;
}
