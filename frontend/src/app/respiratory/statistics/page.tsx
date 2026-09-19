"use client";

import { useEffect, useState } from "react";

import { useRespiratoryAuth } from "../_components/respiratory-auth-provider";
import { API_BASE_URL } from "../_lib/respiratory-api";
import { buildDashboardReviewQueue, type DashboardCase, type DashboardCaseSnapshot, type DashboardConsultation } from "../dashboard/dashboard-work-queues";

const STAGES = ["XRAY", "CT", "PET_CT_TNM", "PATHOLOGY_GENE", "PDL1", "TREATMENT", "PRESCRIPTION"] as const;
const STAGE_LABELS: Record<(typeof STAGES)[number], string> = { XRAY: "흉부 X선", CT: "흉부 CT", PET_CT_TNM: "PET-CT / TNM", PATHOLOGY_GENE: "조직·유전자", PDL1: "PD-L1", TREATMENT: "치료결정", PRESCRIPTION: "처방" };
const STAGE_COLORS: Record<(typeof STAGES)[number], string> = { XRAY: "#0f766e", CT: "#0284c7", PET_CT_TNM: "#4f46e5", PATHOLOGY_GENE: "#9333ea", PDL1: "#db2777", TREATMENT: "#ea580c", PRESCRIPTION: "#65a30d" };

type NotificationResponse = { unread_count?: number };

function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && "results" in value && Array.isArray(value.results)) return value.results as T[];
  return [];
}

export default function RespiratoryStatisticsPage() {
  const { authorizedFetch } = useRespiratoryAuth();
  const [cases, setCases] = useState<DashboardCase[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, DashboardCaseSnapshot>>({});
  const [consultations, setConsultations] = useState<DashboardConsultation[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const [caseResponse, notificationResponse, consultationResponse] = await Promise.all([
          authorizedFetch(`${API_BASE_URL}/api/doctor/cases/`, { signal: controller.signal }),
          authorizedFetch(`${API_BASE_URL}/api/notifications/me/?limit=100`, { signal: controller.signal }),
          authorizedFetch(`${API_BASE_URL}/api/doctor/cases/consultations/me/`, { signal: controller.signal }),
        ]);
        if (!caseResponse.ok || !notificationResponse.ok || !consultationResponse.ok) throw new Error("업무 통계를 불러오지 못했습니다.");
        const loadedCases = asList<DashboardCase>(await caseResponse.json());
        const notificationData = await notificationResponse.json() as NotificationResponse;
        const loadedConsultations = asList<DashboardConsultation>(await consultationResponse.json());
        const snapshotEntries = await Promise.all(loadedCases.filter((item) => item.case_status === "ACTIVE").map(async (item) => {
          const [clinicalResponse, aiResponse, orderResponse] = await Promise.all([
            authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${item.id}/clinical-results/`, { signal: controller.signal }),
            authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${item.id}/ai-results/`, { signal: controller.signal }),
            authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${item.id}/orders/`, { signal: controller.signal }),
          ]);
          if (!clinicalResponse.ok || !aiResponse.ok || !orderResponse.ok) return null;
          return [item.id, { clinicalResults: asList(await clinicalResponse.json()), aiResults: asList(await aiResponse.json()), orders: asList(await orderResponse.json()) } as DashboardCaseSnapshot] as const;
        }));
        if (controller.signal.aborted) return;
        setCases(loadedCases); setConsultations(loadedConsultations); setUnreadCount(Number(notificationData.unread_count) || 0);
        setSnapshots(Object.fromEntries(snapshotEntries.filter((entry): entry is NonNullable<typeof entry> => entry !== null)));
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "업무 통계를 불러오지 못했습니다.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [authorizedFetch]);

  const activeCases = cases.filter((item) => item.case_status === "ACTIVE");
  const reviewQueue = buildDashboardReviewQueue(cases, snapshots, consultations);
  const stageCounts = Object.fromEntries(STAGES.map((stage) => [stage, activeCases.filter((item) => item.current_stage === stage).length])) as Record<(typeof STAGES)[number], number>;
  const maxStageCount = Math.max(1, ...Object.values(stageCounts));
  const totalActiveCases = activeCases.length;
  let donutOffset = 0;
  const donutGradient = totalActiveCases ? `conic-gradient(${STAGES.filter((stage) => stageCounts[stage] > 0).map((stage) => { const next = donutOffset + (stageCounts[stage] / totalActiveCases) * 360; const item = `${STAGE_COLORS[stage]} ${donutOffset}deg ${next}deg`; donutOffset = next; return item; }).join(", ")})` : "conic-gradient(#e2e8f0 0deg 360deg)";
  const workStatuses = [
    { label: "오더 진행", value: Object.values(snapshots).flatMap((snapshot) => snapshot.orders).filter((order) => ["ORDERED", "SCHEDULED"].includes(order.status)).length, detail: "ORDERED / SCHEDULED", tone: "bg-sky-500" },
    { label: "AI 분석 완료", value: Object.values(snapshots).flatMap((snapshot) => snapshot.aiResults).filter((result) => result.status === "SUCCEEDED").length, detail: "SUCCEEDED", tone: "bg-violet-500" },
    { label: "확정 대기", value: Object.values(snapshots).flatMap((snapshot) => snapshot.clinicalResults).filter((result) => result.result_status === "DRAFT").length, detail: "ClinicalResult DRAFT", tone: "bg-amber-500" },
    { label: "협진 대기", value: consultations.filter((item) => ["REQUESTED", "ACKNOWLEDGED"].includes(item.status)).length, detail: "요청·확인 상태", tone: "bg-rose-500" },
  ];
  const maxWorkStatus = Math.max(1, ...workStatuses.map((item) => item.value));

  return <div className="h-full overflow-auto bg-slate-50 px-5 py-5 xl:px-7"><div className="mx-auto max-w-[1440px]">
    <header className="mb-5"><p className="text-xs font-semibold text-teal-700">호흡기내과</p><h1 className="mt-1 text-xl font-semibold text-slate-900">업무 통계</h1><p className="mt-1 text-sm text-slate-500">현재 Case와 결과·오더·협진 상태를 Frontend에서 집계합니다.</p></header>
    {loading ? <StateCard text="업무 통계를 불러오는 중입니다." /> : error ? <StateCard text={error} error /> : <>
      <section className="grid gap-3 sm:grid-cols-3"><Metric label="진행 중 Case" value={activeCases.length} /><Metric label="검토 대기" value={reviewQueue.length} /><Metric label="새 알림" value={unreadCount} /></section>
      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]"><div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-base font-semibold text-slate-900">단계별 Case 분포</h2><p className="mt-1 text-xs text-slate-500">현재 ACTIVE Case의 workflow stage 기준</p><div className="mt-4 space-y-3">{STAGES.map((stage) => <div key={stage} className="grid grid-cols-[112px_minmax(0,1fr)_38px] items-center gap-3"><span className="truncate text-sm font-medium text-slate-700">{STAGE_LABELS[stage]}</span><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${(stageCounts[stage] / maxStageCount) * 100}%`, backgroundColor: STAGE_COLORS[stage] }} /></div><strong className="text-right text-sm text-slate-900">{stageCounts[stage]}건</strong></div>)}</div></div><div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-base font-semibold text-slate-900">현재 Case 구성</h2><p className="mt-1 text-xs text-slate-500">단계별 ACTIVE Case 비중</p>{totalActiveCases ? <div className="mt-4 flex items-center gap-5"><div className="relative h-32 w-32 shrink-0 rounded-full" style={{ background: donutGradient }}><div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-white"><strong className="text-xl text-slate-900">{totalActiveCases}</strong><span className="text-[11px] text-slate-500">ACTIVE</span></div></div><div className="min-w-0 space-y-1.5">{STAGES.filter((stage) => stageCounts[stage] > 0).map((stage) => <div key={stage} className="flex items-center gap-2 text-xs"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: STAGE_COLORS[stage] }} /><span className="min-w-0 flex-1 truncate text-slate-600">{STAGE_LABELS[stage]}</span><strong className="text-slate-800">{stageCounts[stage]}건</strong></div>)}</div></div> : <p className="mt-4 flex h-32 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">표시할 ACTIVE Case가 없습니다.</p>}</div></section>
      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-base font-semibold text-slate-900">업무 상태</h2><div className="mt-4 grid gap-x-8 gap-y-4 lg:grid-cols-2">{workStatuses.map((item) => <div key={item.label} className="grid grid-cols-[100px_minmax(0,1fr)_42px] items-center gap-3"><div><p className="text-sm font-medium text-slate-700">{item.label}</p><p className="mt-0.5 text-[11px] text-slate-400">{item.detail}</p></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${item.tone}`} style={{ width: `${(item.value / maxWorkStatus) * 100}%` }} /></div><strong className="text-right text-sm text-slate-900">{item.value}건</strong></div>)}</div></section>
    </>}
  </div></div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}<span className="ml-1 text-sm font-medium text-slate-400">건</span></p></div>; }
function StateCard({ text, error = false }: { text: string; error?: boolean }) { return <div className={`rounded-xl border p-8 text-center text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-500"}`}>{text}</div>; }
