"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useRespiratoryAuth } from "../_components/respiratory-auth-provider";
import { API_BASE_URL } from "../_lib/respiratory-api";
import { requestCaseNavigation } from "../_lib/case-navigation-guard";

type Notification = { id: string; notification_type: string; title: string; message: string; case_id: string | null; case_code: string | null; created_at: string; read_at: string | null };
type NotificationResponse = { unread_count: number; results: Notification[] };
type Filter = "ALL" | "UNREAD" | "ORDER" | "RESULT" | "CONSULTATION" | "OTHER";
const FILTER_LABELS: Record<Filter, string> = { ALL: "전체", UNREAD: "읽지 않음", ORDER: "오더", RESULT: "결과", CONSULTATION: "협진", OTHER: "기타" };

function categoryOf(type: string): Exclude<Filter, "ALL" | "UNREAD"> { if (type.includes("ORDER") || type.includes("EXAMINATION")) return "ORDER"; if (type.includes("RESULT") || type.includes("ANALYSIS") || type.includes("REVIEW")) return "RESULT"; if (type.includes("CONSULTATION")) return "CONSULTATION"; return "OTHER"; }

export default function RespiratoryNotificationsPage() {
  const router = useRouter();
  const { authorizedFetch } = useRespiratoryAuth();
  const [data, setData] = useState<NotificationResponse>({ unread_count: 0, results: [] });
  const [filter, setFilter] = useState<Filter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { const controller = new AbortController(); const load = async () => { try { const response = await authorizedFetch(`${API_BASE_URL}/api/notifications/me/?limit=100`, { signal: controller.signal }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error("알림을 불러오지 못했습니다."); setData({ unread_count: Number(payload.unread_count) || 0, results: Array.isArray(payload.results) ? payload.results : [] }); } catch (loadError) { if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setError(loadError instanceof Error ? loadError.message : "알림을 불러오지 못했습니다."); } finally { if (!controller.signal.aborted) setLoading(false); } }; void load(); return () => controller.abort(); }, [authorizedFetch]);

  const categoryCounts = useMemo(() => data.results.reduce<Record<string, number>>((counts, item) => { const category = categoryOf(item.notification_type); counts[category] = (counts[category] || 0) + 1; return counts; }, {}), [data.results]);
  const filters = (["ALL", "UNREAD", "ORDER", "RESULT", "CONSULTATION", "OTHER"] as Filter[]).filter((value) => value === "ALL" || value === "UNREAD" || Boolean(categoryCounts[value]));
  const visible = data.results.filter((item) => filter === "ALL" || (filter === "UNREAD" ? !item.read_at : categoryOf(item.notification_type) === filter));

  async function openNotification(item: Notification) {
    if (!item.read_at) {
      try { const response = await authorizedFetch(`${API_BASE_URL}/api/notifications/me/${item.id}/read/`, { method: "PATCH" }); if (response.ok) setData((current) => ({ unread_count: Math.max(0, current.unread_count - 1), results: current.results.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry) })); } catch { /* Navigation remains available if the read receipt fails. */ }
    }
    if (item.case_id && requestCaseNavigation(item.case_id)) { window.localStorage.setItem("respiratory-last-case-id", item.case_id); router.push(`/respiratory/cases/${item.case_id}`); }
  }

  return <div className="h-full overflow-auto bg-slate-50 px-5 py-5 xl:px-7"><div className="mx-auto max-w-[1200px]">
    <header className="mb-5"><p className="text-xs font-semibold text-teal-700">호흡기내과</p><div className="mt-1 flex items-center gap-3"><h1 className="text-xl font-semibold text-slate-900">알림</h1>{data.unread_count > 0 && <span className="rounded-full bg-rose-500 px-2 py-1 text-xs font-semibold text-white">새 알림 {data.unread_count}</span>}</div><p className="mt-1 text-sm text-slate-500">오더·결과·협진 등 실제 발생한 알림을 확인합니다.</p></header>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3">{filters.map((value) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-lg px-3 py-2 text-sm font-medium ${filter === value ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600"}`}>{FILTER_LABELS[value]}{value === "UNREAD" && data.unread_count > 0 ? ` ${data.unread_count}` : ""}</button>)}</div>
      {loading ? <State text="알림을 불러오는 중입니다." /> : error ? <State text={error} error /> : <div className="divide-y divide-slate-100">{visible.map((item) => <button key={item.id} type="button" onClick={() => void openNotification(item)} className={`flex w-full items-start gap-3 px-4 py-4 text-left transition hover:bg-teal-50/50 ${item.read_at ? "bg-white" : "bg-blue-50/40"}`}><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.read_at ? "bg-slate-200" : "bg-teal-500"}`} /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-900">{item.title}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{FILTER_LABELS[categoryOf(item.notification_type)]}</span></span><span className="mt-1 block text-sm leading-6 text-slate-600">{item.message}</span><span className="mt-1 block text-xs text-slate-400">{item.case_code || "공통 알림"} · {new Date(item.created_at).toLocaleString("ko-KR")}</span></span>{item.case_id && <span className="shrink-0 text-xs font-semibold text-teal-700">Case 열기</span>}</button>)}{!visible.length && <State text="해당 알림이 없습니다." />}</div>}
    </section>
  </div></div>;
}

function State({ text, error = false }: { text: string; error?: boolean }) { return <p className={`px-5 py-12 text-center text-sm ${error ? "text-rose-700" : "text-slate-400"}`}>{text}</p>; }
