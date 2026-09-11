"use client";

import { useEffect, useMemo, useState } from "react";
import { StateMessage } from "@/components/workspace/state-message";
import {
  fetchPathologyAnalyses,
  fetchPathologyWorkstation,
  runPdl1Analysis,
  type PathologyWorkstationItem,
} from "./_lib/pathology-workstation-api";
import type { PathologyAiAnalysis } from "./_lib/pathology-api";

type Tab = "worklist" | "ai" | "completed";
const geneTargets = [
  { symbol: "KRAS", label: "KRAS" },
  { symbol: "TP53", label: "TP53" },
  { symbol: "EGFR", label: "EGFR" },
  { symbol: "KEAP1", label: "KEAP1" },
  { symbol: "STK11", label: "STK11" },
  { symbol: "BRAF", label: "BRAF" },
  { symbol: "MET", label: "MET" },
  { symbol: "ERBB2", label: "HER2 (ERBB2)" },
];

function PatientSummary({ item }: { item: PathologyWorkstationItem }) {
  const rows = [
    ["환자코드", item.patient.patient_code],
    ["성별 / 생년월일", `${item.patient.sex} / ${item.patient.birth_date}`],
    ["Case", item.case.case_code],
    ["검체번호", item.specimen?.specimen_code ?? "-"],
    ["현재 검사", item.current_exam_or_task],
    ["현재 상태", item.workflow_status_label],
    ["의뢰 의사", item.requesting_doctor?.name ?? "-"],
    ["WSI / Slide", item.latest_wsi?.slide_code ?? "-"],
  ];
  return (
    <section className="min-h-0 overflow-y-auto bg-slate-50">
      <div className="border-b border-slate-200 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">선택 환자 · 검체</p>
        <h2 className="mt-1 text-base font-bold text-slate-900">{item.patient.name}</h2>
      </div>
      <dl className="divide-y divide-slate-200 px-4 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[112px_minmax(0,1fr)] py-2">
            <dt className="text-slate-500">{label}</dt>
            <dd className="break-words font-medium text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function WorkArea({ item }: { item: PathologyWorkstationItem }) {
  const [pathologyAnalyses, setPathologyAnalyses] = useState<PathologyAiAnalysis[]>([]);
  const [pdl1Analyses, setPdl1Analyses] = useState<PathologyAiAnalysis[]>([]);
  const [featureFile, setFeatureFile] = useState<File | null>(null);
  const [runningPdl1, setRunningPdl1] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetchPathologyAnalyses(item.case_id, "pathology", controller.signal),
      fetchPathologyAnalyses(item.case_id, "pdl1", controller.signal),
    ])
      .then(([pathology, pdl1]) => {
        setPathologyAnalyses(pathology);
        setPdl1Analyses(pdl1);
        setError("");
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "AI 결과를 불러오지 못했습니다.");
        }
      });
    return () => controller.abort();
  }, [item.case_id]);

  const pathology = pathologyAnalyses[0] ?? null;
  const pdl1 = pdl1Analyses[0] ?? null;
  const pathologyResult = pathology?.result_detail?.pathology;
  const pdl1Result = pdl1?.result_detail?.pdl1;
  const geneResults = item.latest_gene_analysis?.result_detail?.genes ?? [];

  async function handlePdl1Run() {
    if (!featureFile) return;
    setRunningPdl1(true);
    setError("");
    setMessage("");
    try {
      const result = await runPdl1Analysis(item.case_id, featureFile, item.latest_wsi?.id);
      setPdl1Analyses((current) => [result, ...current]);
      setFeatureFile(null);
      setMessage("PD-L1 분석이 완료되었습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "PD-L1 분석을 실행하지 못했습니다.");
    } finally {
      setRunningPdl1(false);
    }
  }

  return (
    <main className="min-h-0 overflow-y-auto bg-white">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">병리 분석 Workstation</p>
        <h2 className="mt-1 text-lg font-bold text-slate-900">조직영상 및 AI 분석</h2>
        <p className="mt-1 text-xs text-slate-500">{item.patient.name} · {item.specimen?.specimen_code ?? "검체 미연결"}</p>
      </header>
      <div className="divide-y divide-slate-200 px-5">
        <section className="py-5">
          <h3 className="text-sm font-bold"><span className="mr-2 text-xs text-blue-700">01</span>조직영상 / WSI</h3>
          {item.latest_wsi ? (
            <>
              <div className="mt-3 flex min-h-72 flex-col items-center justify-center border border-slate-300 bg-slate-950 text-slate-200">
                <p className="font-semibold">WSI 연결됨</p>
                <p className="mt-2 text-xs">{item.latest_wsi.slide_code} · {item.latest_wsi.original_filename}</p>
                <p className="mt-1 text-xs text-slate-400">기존 WSI Viewer에서 Orthanc 연결 상태를 확인할 수 있습니다.</p>
              </div>
              <p className="mt-3 text-xs text-slate-600">염색 {item.latest_wsi.stain} · 형식 {item.latest_wsi.file_format} · 상태 {item.latest_wsi.image_status}</p>
            </>
          ) : <StateMessage variant="empty" title="조직영상 연결 대기" description="검체에 연결된 WSI가 없습니다." className="mt-3 min-h-60" />}
        </section>

        <section className="py-5">
          <div className="flex items-center justify-between">
            <div><h3 className="text-sm font-bold"><span className="mr-2 text-xs text-blue-700">02</span>LUAD/LUSC 분석</h3><p className="mt-1 text-xs text-slate-500">현재 상태: {pathology?.status_label ?? "결과 없음"}</p></div>
            <button disabled className="rounded-md bg-slate-300 px-3 py-2 text-xs font-semibold text-white">분석 실행</button>
          </div>
          <p className="mt-2 text-xs text-slate-500">모델 실행 API 연결 후 사용할 수 있습니다.</p>
          {pathologyResult ? (
            <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-200 pt-4 text-xs sm:grid-cols-5">
              {[
                ["악성 판정", pathologyResult.malignancy_assessment_label],
                ["악성 확률", pathologyResult.malignancy_probability],
                ["조직형", pathologyResult.predicted_histologic_type],
                ["아형", pathologyResult.predicted_subtype],
                ["아형 신뢰도", pathologyResult.subtype_confidence],
              ].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-bold">{value ?? "-"}</dd></div>)}
            </dl>
          ) : <p className="mt-4 border-t border-slate-200 pt-4 text-xs text-slate-500">저장된 LUAD/LUSC 결과가 없습니다.</p>}
          <div className="mt-4 border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">AI Heatmap · 연결 예정</div>
        </section>

        <section className="py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><h3 className="text-sm font-bold"><span className="mr-2 text-xs text-blue-700">03</span>PD-L1 분석</h3><p className="mt-1 text-xs text-slate-500">현재 상태: {pdl1?.status_label ?? "결과 없음"}</p></div>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold">.pt feature 선택<input type="file" accept=".pt" className="sr-only" onChange={(event) => setFeatureFile(event.target.files?.[0] ?? null)} /></label>
              <button type="button" disabled={!featureFile || runningPdl1} onClick={handlePdl1Run} className="rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300">{runningPdl1 ? "분석 중" : "PD-L1 분석 실행"}</button>
            </div>
          </div>
          {featureFile ? <p className="mt-2 text-xs text-slate-500">선택 파일: {featureFile.name}</p> : null}
          {pdl1Result ? (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <dl className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                <div><dt className="text-slate-500">TPS 예측 구간</dt><dd className="mt-1 text-lg font-bold">{pdl1Result.predicted_tps_range_label}</dd></div>
                <div><dt className="text-slate-500">Confidence</dt><dd className="mt-1 text-lg font-bold">{(Number(pdl1Result.confidence) * 100).toFixed(1)}%</dd></div>
                <div className="col-span-2"><dt className="text-slate-500">모델</dt><dd className="mt-1 font-semibold">{pdl1?.model_name} · {pdl1?.model_version_name}</dd></div>
              </dl>
              <div className="mt-3 flex gap-3 text-xs text-slate-600">{Object.entries(pdl1Result.probabilities).map(([key, value]) => <span key={key}>{key}: {(value * 100).toFixed(1)}%</span>)}</div>
            </div>
          ) : <p className="mt-4 border-t border-slate-200 pt-4 text-xs text-slate-500">저장된 PD-L1 결과가 없습니다.</p>}
          {message ? <p className="mt-3 border-l-2 border-blue-600 bg-blue-50 px-3 py-2 text-xs text-blue-800">{message}</p> : null}
          {error ? <p className="mt-3 border-l-2 border-red-500 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
        </section>

        <section className="py-5">
          <div className="flex justify-between"><div><h3 className="text-sm font-bold"><span className="mr-2 text-xs text-blue-700">04</span>유전자 분석</h3><p className="mt-1 text-xs text-slate-500">분석 실행 API 연결 대기</p></div><button disabled className="rounded-md bg-slate-300 px-3 py-2 text-xs font-semibold text-white">분석 실행</button></div>
          <div className="mt-4 grid grid-cols-2 border-l border-t border-slate-200 sm:grid-cols-4">{geneTargets.map((gene) => {
            const result = geneResults.find((entry) => entry.gene_symbol === gene.symbol);
            return <div key={gene.symbol} className="border-b border-r border-slate-200 px-3 py-3"><p className="text-xs font-bold">{gene.label}</p><p className="mt-1 text-xs font-semibold text-slate-700">{result?.predicted_status_label ?? "결과 없음"}</p><p className="mt-1 text-[11px] text-slate-500">{result?.predicted_probability ?? "-"}</p></div>;
          })}</div>
        </section>

        <section className="py-5">
          <h3 className="text-sm font-bold"><span className="mr-2 text-xs text-blue-700">05</span>의사 판독 상태</h3>
          <p className="mt-3 text-sm font-semibold">{item.workflow_status === "REVIEW_COMPLETED" ? "판독 완료" : item.workflow_status === "REVIEW_PENDING" ? "판독 대기" : "판독 전"}</p>
          <p className="mt-2 text-xs text-slate-500">병리사는 결과를 조회하며 최종 판독·확정은 의사가 수행합니다.</p>
        </section>
      </div>
    </main>
  );
}

export default function PathologyDashboardPage() {
  const [items, setItems] = useState<PathologyWorkstationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("worklist");
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetchPathologyWorkstation(controller.signal)
      .then((data) => { setItems(data); setSelectedId(data[0]?.id ?? null); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "병리 Worklist를 불러오지 못했습니다."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const visible = useMemo(
    () => items.filter((item) => tab === "completed"
      ? item.workflow_status === "REVIEW_COMPLETED"
      : tab === "ai"
        ? ["AI_READY", "AI_RUNNING", "AI_COMPLETED"].includes(item.workflow_status)
        : filter === "ALL" || item.task_type === filter),
    [filter, items, tab],
  );
  const selected = items.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="min-w-0">
      <nav className="overflow-x-auto border-b border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-[1760px] px-4 sm:px-6"><div className="flex min-w-max gap-7">{([["worklist", "Worklist"], ["ai", "AI 작업"], ["completed", "완료 기록"]] as const).map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`border-b-2 py-3 text-sm font-semibold ${tab === id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"}`}>{label}</button>)}</div></div>
      </nav>
      <div className="mx-auto w-full max-w-[1760px] px-4 py-3 sm:px-6 sm:py-4">
        <div className="grid overflow-hidden border border-slate-200 bg-white xl:h-[calc(100vh-141px)] xl:min-h-[620px] xl:grid-cols-[minmax(420px,32fr)_minmax(0,68fr)] xl:divide-x xl:divide-slate-200">
          <div className="grid min-h-0 grid-rows-[minmax(0,62fr)_minmax(0,38fr)] divide-y divide-slate-200">
            <section className="flex min-h-0 flex-col">
              <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3"><h1 className="mr-auto text-sm font-bold">병리 Worklist</h1>{tab === "worklist" ? <select value={filter} onChange={(event) => setFilter(event.target.value)} className="border border-slate-300 bg-white px-2 py-1.5 text-xs"><option value="ALL">전체</option><option value="WSI_UPLOAD">조직검사</option><option value="PATHOLOGY_ANALYSIS">AI 분석</option><option value="DIAGNOSTIC_REVIEW">판독</option></select> : null}</div>
              {loading ? <StateMessage variant="loading" title="Worklist를 불러오는 중입니다." className="m-4" /> : error ? <StateMessage variant="error" title={error} className="m-4" /> : <div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[420px] text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="px-3 py-2.5">환자명</th><th className="px-3 py-2.5">환자코드</th><th className="px-3 py-2.5">검사</th><th className="px-3 py-2.5">상태</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id} tabIndex={0} onClick={() => setSelectedId(item.id)} onKeyDown={(event) => { if (event.key === "Enter") setSelectedId(item.id); }} className={`cursor-pointer border-b border-l-[3px] border-slate-100 ${selectedId === item.id ? "border-l-blue-600 bg-blue-50" : "border-l-transparent"}`}><td className="px-3 py-2.5 font-semibold">{item.patient.name}</td><td className="px-3 py-2.5 text-slate-600">{item.patient.patient_code}</td><td className="px-3 py-2.5">{item.current_exam_or_task}</td><td className="px-3 py-2.5"><span className="whitespace-nowrap font-semibold">{item.workflow_status_label}</span></td></tr>)}</tbody></table>{visible.length === 0 ? <StateMessage variant="empty" title="표시할 병리 작업이 없습니다." className="m-4" /> : null}</div>}
            </section>
            {selected ? <PatientSummary item={selected} /> : <StateMessage variant="empty" title="환자를 선택하세요." className="m-4" />}
          </div>
          {selected ? <WorkArea key={selected.id} item={selected} /> : <StateMessage variant="empty" title="병리 작업을 선택하세요." className="m-6 self-start" />}
        </div>
      </div>
    </div>
  );
}
