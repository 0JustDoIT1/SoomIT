"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StateMessage } from "@/components/workspace/state-message";
import { StatusBadge } from "@/components/workspace/status-badge";
import { FailureDetailDrawer, type FailureDetailField } from "@/components/workspace/failure-detail-drawer";
import {
  fetchSystemMonitoring,
  SystemAdminApiError,
  type RecentErrorRow,
  type SystemMonitoringSnapshot,
} from "../_lib/system-admin-api";
import { getSystemAdminAccessToken } from "../_lib/system-admin-session";

const NUMBER_FORMAT = new Intl.NumberFormat("ko-KR");
const TABS = ["error", "audit", "deploy"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { error: "Error Log", audit: "Audit Log", deploy: "Deploy" };

function formatSeconds(value: number | null): string {
  if (value === null || value === undefined) return "측정 데이터 없음";
  if (value < 60) return `${Math.round(value)}초`;
  return `${(value / 60).toFixed(1)}분`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "없음";
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Kpi({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "blue" | "amber" | "emerald" | "red" }) {
  const toneStyles: Record<string, string> = {
    slate: "text-slate-900",
    blue: "text-blue-700",
    amber: "text-amber-700",
    emerald: "text-emerald-700",
    red: "text-red-700",
  };
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="truncate text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold ${toneStyles[tone]}`}>{NUMBER_FORMAT.format(value)}</p>
    </div>
  );
}

function Section({ title, description, children, right }: { title: string; description?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        </div>
        {right}
      </div>
      <div className="mt-4 min-w-0">{children}</div>
    </section>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
}

function ServiceStatusList({ items }: { items: Array<{ name: string; status: string; detail: string }> }) {
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item) => (
        <li key={item.name} className="flex items-center justify-between py-2">
          <span className="text-sm font-medium text-slate-800">{item.name}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{item.detail}</span>
            <StatusBadge status={item.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function failureFields(row: RecentErrorRow): FailureDetailField[] {
  return [
    { label: "Request ID", value: row.id },
    { label: "Case ID", value: row.case_id },
    { label: "Hospital", value: row.hospital_name },
    { label: "Service", value: row.service },
    { label: "Status", value: "FAILED" },
    { label: "Queued At", value: formatDateTime(row.queued_at) },
    { label: "Started At", value: formatDateTime(row.started_at) },
    { label: "Failed At", value: formatDateTime(row.at) },
    { label: "Elapsed", value: formatSeconds(row.elapsed_seconds) },
    { label: "Retry Count", value: row.retry_count },
    { label: "Cloud Run Service", value: row.cloud_run_service },
  ];
}

export default function SystemAdminDashboardPage() {
  const [snapshot, setSnapshot] = useState<SystemMonitoringSnapshot | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("error");
  const [selectedError, setSelectedError] = useState<RecentErrorRow | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const token = getSystemAdminAccessToken();
      if (!token) return;
      try {
        const data = await fetchSystemMonitoring(token, controller.signal);
        setSnapshot(data);
        setState("ready");
      } catch (caught) {
        if (controller.signal.aborted || (caught instanceof Error && caught.name === "AbortError")) return;
        const status = caught instanceof SystemAdminApiError ? caught.status : null;
        setError(
          status === 401
            ? "인증이 만료되었습니다. 다시 로그인해주세요."
            : status === 403
              ? "시스템 관리자 권한이 없습니다."
              : caught instanceof Error
                ? caught.message
                : "플랫폼 현황을 불러오지 못했습니다."
        );
        setState("error");
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  if (state === "loading") {
    return <StateMessage variant="loading" title="플랫폼 운영 현황을 불러오는 중입니다." />;
  }
  if (state === "error" || !snapshot) {
    return <StateMessage variant="error" title="플랫폼 현황을 조회할 수 없습니다." description={error} />;
  }

  const { kpi, hospitals_overview, ai_queue_by_type, ai_service_status, infra_status, cloud_run_status, cloud_run_note, recent_errors, audit_log, deploy_versions, model_versions } = snapshot;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-blue-700">Platform Control</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">플랫폼 대시보드</h1>
        <p className="mt-1 text-sm text-slate-500">SoomIT 전체 병원 및 AI 서비스 운영 상태입니다.</p>
      </div>

      {/* A. 플랫폼 요약 KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="전체 병원 수" value={kpi.total_hospitals} />
        <Kpi label="활성 사용자" value={kpi.active_users_total} tone="blue" />
        <Kpi label="오늘 AI 요청" value={kpi.ai_requests_today} />
        <Kpi label="실행 중 작업" value={kpi.ai_running_now} tone="blue" />
        <Kpi label="오늘 실패 요청" value={kpi.ai_failed_today} tone="red" />
      </div>

      {/* B. System Health (Core Infra + AI Services + Cloud Run 통합) */}
      <Section title="System Health" description="핵심 인프라, AI 서비스, Cloud Run 상태를 한 화면에서 확인합니다.">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div>
            <p className="text-xs font-semibold text-slate-500">Core</p>
            <div className="mt-2"><ServiceStatusList items={infra_status} /></div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">AI Services</p>
            <div className="mt-2"><ServiceStatusList items={ai_service_status} /></div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">Cloud Run</p>
            <div className="mt-2">
              {cloud_run_status.length === 0 ? <EmptyRow>{cloud_run_note}</EmptyRow> : <ServiceStatusList items={cloud_run_status} />}
            </div>
          </div>
        </div>
      </Section>

      {/* C. 전체 AI Queue */}
      <Section title="전체 AI Queue" description="AI 유형별 오늘 처리 현황입니다.">
        {ai_queue_by_type.every((row) => row.queue_depth + row.running + row.failed === 0) ? (
          <EmptyRow>오늘 접수된 AI 요청이 없습니다.</EmptyRow>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ai_queue_by_type.map((row) => (
              <div key={row.analysis_type} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-800">{row.analysis_type_display}</span>
                  <span className="text-xs text-slate-500">평균 {formatSeconds(row.avg_duration_seconds)}</span>
                </div>
                <div className="mt-1 flex gap-3 text-xs text-slate-500">
                  <span>Queue {row.queue_depth}</span>
                  <span>실행중 {row.running}</span>
                  <span className={row.failed > 0 ? "font-semibold text-red-600" : ""}>실패 {row.failed}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* D. 병원 / 모델 현황 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section
          title="전체 병원 현황"
          description="병원별 활성 사용자·오늘 요청량·실패 건수입니다."
          right={<Link href="/system-admin/hospitals" className="shrink-0 text-xs font-semibold text-blue-700">병원 관리로 이동 →</Link>}
        >
          {hospitals_overview.length === 0 ? (
            <EmptyRow>등록된 병원이 없습니다.</EmptyRow>
          ) : (
            <div className="max-h-80 overflow-y-auto overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2 font-medium">병원명</th>
                    <th className="py-2 font-medium">활성 사용자</th>
                    <th className="py-2 font-medium">오늘 요청</th>
                    <th className="py-2 font-medium">실패</th>
                    <th className="py-2 font-medium">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {hospitals_overview.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2.5 font-medium text-slate-800">{row.name} <span className="text-xs text-slate-400">({row.code})</span></td>
                      <td className="py-2.5 text-slate-600">{row.active_users}</td>
                      <td className="py-2.5 text-slate-600">{row.recent_requests}</td>
                      <td className="py-2.5 text-slate-600">{row.failed_count}</td>
                      <td className="py-2.5"><StatusBadge status={row.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="모델 버전 현황" description="현재 등록된 AI 모델 버전입니다.">
          {model_versions.length === 0 ? (
            <EmptyRow>등록된 모델 버전이 없습니다.</EmptyRow>
          ) : (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto text-sm">
              {model_versions.map((row) => (
                <li key={row.id} className="flex items-center justify-between py-2">
                  <span className="min-w-0 truncate text-slate-700">
                    <span className="font-medium text-slate-900">{row.model_name}</span> v{row.version} · {row.analysis_type_display}
                  </span>
                  <span className="shrink-0 pl-3 text-xs text-slate-400">{row.applied_scope}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* E. Error / Audit / Deploy 탭 */}
      <Section
        title="Error / Audit / Deploy"
        description="오류 로그를 클릭하면 상세 원인을 확인할 수 있습니다."
        right={
          <div className="flex shrink-0 gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 text-xs">
            {TABS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTab(option)}
                className={`rounded-full px-3 py-1 font-medium transition ${
                  tab === option ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {TAB_LABEL[option]}
              </button>
            ))}
          </div>
        }
      >
        {tab === "error" && (
          recent_errors.length === 0 ? (
            <EmptyRow>최근 오류가 없습니다.</EmptyRow>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2 font-medium">시간</th>
                    <th className="py-2 font-medium">병원</th>
                    <th className="py-2 font-medium">서비스</th>
                    <th className="py-2 font-medium">메시지 요약</th>
                    <th className="py-2 font-medium">Case ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recent_errors.map((row) => (
                    <tr key={row.id} onClick={() => setSelectedError(row)} className="cursor-pointer bg-red-50/40 hover:bg-red-50">
                      <td className="py-2.5 text-slate-500">{formatDateTime(row.at)}</td>
                      <td className="py-2.5 text-slate-600">{row.hospital_name}</td>
                      <td className="py-2.5 text-slate-600">{row.service}</td>
                      <td className="max-w-[280px] truncate py-2.5 text-slate-500" title={row.message_summary}>{row.message_summary}</td>
                      <td className="py-2.5 font-mono text-xs text-slate-400">{row.case_id.slice(0, 8)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab === "audit" && (
          audit_log.length === 0 ? (
            <EmptyRow>최근 관리 이벤트가 없습니다.</EmptyRow>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {audit_log.map((row) => (
                <li key={row.id} className="flex items-center justify-between py-2">
                  <span className="min-w-0 truncate text-slate-700">
                    <span className="font-medium text-slate-900">{row.actor_name}</span> · {row.action_type_display} · {row.target_table}
                  </span>
                  <span className="shrink-0 pl-3 text-xs text-slate-400">{formatDateTime(row.created_at)}</span>
                </li>
              ))}
            </ul>
          )
        )}

        {tab === "deploy" && (
          <ul className="divide-y divide-slate-100 text-sm">
            {deploy_versions.map((row) => (
              <li key={row.name} className="flex items-center justify-between py-2.5">
                <span className="font-medium text-slate-800">{row.name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-500" title={row.full_commit_sha ?? undefined}>{row.commit_sha}</span>
                  <span className="text-xs text-slate-400">{formatDateTime(row.deployed_at)}</span>
                  <StatusBadge status={row.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <FailureDetailDrawer
        open={selectedError !== null}
        onClose={() => setSelectedError(null)}
        title={selectedError ? `${selectedError.hospital_name} · ${selectedError.service}` : ""}
        subtitle={selectedError ? `Case ID: ${selectedError.case_id}` : undefined}
        fields={selectedError ? failureFields(selectedError) : []}
        message={selectedError?.error_message ?? null}
      />
    </div>
  );
}
