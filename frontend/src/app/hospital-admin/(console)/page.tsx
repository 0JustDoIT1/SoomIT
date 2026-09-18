"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StateMessage } from "@/components/workspace/state-message";
import { StatusBadge } from "@/components/workspace/status-badge";
import { FailureDetailDrawer, type FailureDetailField } from "@/components/workspace/failure-detail-drawer";
import {
  fetchHospitalMonitoring,
  HospitalAdminApiError,
  type FailedRequestRow,
  type HospitalMonitoringSnapshot,
} from "../_lib/hospital-admin-api";
import { getHospitalAdminAccessToken } from "../_lib/hospital-admin-session";

const NUMBER_FORMAT = new Intl.NumberFormat("ko-KR");
const QUEUE_STATUSES = ["PENDING", "RUNNING", "SUCCEEDED", "FAILED"] as const;

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

function failureFields(row: FailedRequestRow): FailureDetailField[] {
  return [
    { label: "Request ID", value: row.id },
    { label: "Case", value: row.case_code },
    { label: "AI 유형", value: row.analysis_type_display },
    { label: "Status", value: "FAILED" },
    { label: "Queued At", value: formatDateTime(row.queued_at) },
    { label: "Started At", value: formatDateTime(row.started_at) },
    { label: "Failed At", value: formatDateTime(row.failed_at) },
    { label: "Elapsed", value: formatSeconds(row.elapsed_seconds) },
    { label: "Retry Count", value: row.retry_count },
    { label: "Cloud Run Service", value: row.cloud_run_service },
  ];
}

export default function HospitalAdminDashboardPage() {
  const [snapshot, setSnapshot] = useState<HospitalMonitoringSnapshot | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [selectedFailure, setSelectedFailure] = useState<FailedRequestRow | null>(null);
  const [requestFilter, setRequestFilter] = useState<"ALL" | "FAILED">("ALL");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const token = getHospitalAdminAccessToken();
      if (!token) return;
      try {
        const data = await fetchHospitalMonitoring(token, controller.signal);
        setSnapshot(data);
        setState("ready");
      } catch (caught) {
        if (controller.signal.aborted || (caught instanceof Error && caught.name === "AbortError")) return;
        const status = caught instanceof HospitalAdminApiError ? caught.status : null;
        setError(
          status === 401
            ? "인증이 만료되었습니다. 다시 로그인해주세요."
            : status === 403
              ? "병원 관리자 권한이 없습니다."
              : caught instanceof Error
                ? caught.message
                : "운영 현황을 불러오지 못했습니다."
        );
        setState("error");
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  const filteredRequests = useMemo(() => {
    if (!snapshot) return [];
    if (requestFilter === "ALL") return snapshot.recent_ai_requests;
    return snapshot.recent_ai_requests.filter((row) => row.status === "FAILED");
  }, [snapshot, requestFilter]);

  if (state === "loading") {
    return <StateMessage variant="loading" title="병원 운영 현황을 불러오는 중입니다." />;
  }
  if (state === "error" || !snapshot) {
    return <StateMessage variant="error" title="운영 현황을 조회할 수 없습니다." description={error} />;
  }

  const { hospital, kpi, ai_queue_summary, exam_summary, failed_requests, activity_log, staff_overview, staff, integrations, performance, recent_events } = snapshot;

  return (
    <div className="max-w-[1760px] space-y-5">
      <div>
        <p className="text-sm font-semibold text-blue-700">Hospital Operations</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">운영 대시보드</h1>
        <p className="mt-1 text-sm text-slate-500">{hospital.name} ({hospital.code}) 기준 실시간 운영 현황입니다.</p>
      </div>

      {/* A. 운영 요약 KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="AI 대기" value={kpi.ai_queued} tone="amber" />
        <Kpi label="AI 실행 중" value={kpi.ai_running} tone="blue" />
        <Kpi label="오늘 AI 성공" value={kpi.ai_succeeded_today} tone="emerald" />
        <Kpi label="오늘 AI 실패" value={kpi.ai_failed_today} tone="red" />
        <Kpi label="오늘 검사" value={kpi.exams_today} />
        <Kpi label="활성 의료진" value={kpi.active_staff} />
      </div>

      {/* B. AI 운영 현황 (Queue + Requests + Failed + Performance 통합) */}
      <Section
        title="AI 운영 현황"
        description="오늘 상태 분포, 평균 처리시간, 최근 요청을 한 화면에서 확인합니다. 실패 행을 클릭하면 상세 원인을 볼 수 있습니다."
        right={
          <div className="flex shrink-0 gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 text-xs">
            {(["ALL", "FAILED"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRequestFilter(option)}
                className={`rounded-full px-3 py-1 font-medium transition ${
                  requestFilter === option ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {option === "ALL" ? "전체" : "실패만"}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {QUEUE_STATUSES.map((key) => (
            <div key={key} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
              <StatusBadge status={key} />
              <p className="mt-2 text-xl font-bold text-slate-900">{NUMBER_FORMAT.format(ai_queue_summary[key] ?? 0)}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
          <span>AI 평균 처리시간 <span className="font-semibold text-slate-900">{formatSeconds(performance.ai_avg_duration_seconds)}</span></span>
          <span>평균 대기시간 <span className="font-semibold text-slate-900">{formatSeconds(performance.ai_avg_wait_seconds)}</span></span>
          <span>샘플 {performance.sample_size}건 (최근 완료 요청 기준)</span>
        </div>

        <div className="mt-4 overflow-x-auto">
          {filteredRequests.length === 0 ? (
            <EmptyRow>{requestFilter === "FAILED" ? "실패한 요청이 없습니다." : "최근 AI 요청이 없습니다."}</EmptyRow>
          ) : (
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 font-medium">Case</th>
                  <th className="py-2 font-medium">환자</th>
                  <th className="py-2 font-medium">AI 유형</th>
                  <th className="py-2 font-medium">요청 시각</th>
                  <th className="py-2 font-medium">상태</th>
                  <th className="py-2 font-medium">대기시간</th>
                  <th className="py-2 font-medium">처리시간</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequests.map((row) => {
                  const failure = row.status === "FAILED" ? failed_requests.find((item) => item.id === row.id) : undefined;
                  return (
                    <tr
                      key={row.id}
                      onClick={failure ? () => setSelectedFailure(failure) : undefined}
                      className={failure ? "cursor-pointer bg-red-50/40 hover:bg-red-50" : undefined}
                    >
                      <td className="py-2.5 font-medium text-slate-800">{row.case_code}</td>
                      <td className="py-2.5 text-slate-600">{row.patient_name}</td>
                      <td className="py-2.5 text-slate-600">{row.analysis_type_display}</td>
                      <td className="py-2.5 text-slate-500">{formatDateTime(row.requested_at)}</td>
                      <td className="py-2.5"><StatusBadge status={row.status} /></td>
                      <td className="py-2.5 text-slate-500">{formatSeconds(row.wait_seconds)}</td>
                      <td className="py-2.5 text-slate-500">{formatSeconds(row.duration_seconds)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Section>

      {/* C. 검사/사용자 현황 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title="검사 처리 현황" description="검사 유형별 진행 중/완료 건수입니다 (오늘 접수 기준).">
          {exam_summary.length === 0 ? (
            <EmptyRow>오늘 접수된 검사가 없습니다.</EmptyRow>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {exam_summary.map((row) => (
                <div key={row.order_type} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-800">{row.order_type_display}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>요청 {row.ordered}</span>
                    <span>예약 {row.scheduled}</span>
                    <span className="font-semibold text-emerald-600">완료 {row.completed}</span>
                    <span>취소 {row.cancelled}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="병원 사용자 현황"
          description="활성 계정 및 소속 부서 현황입니다."
          right={<Link href="/hospital-admin/staff" className="shrink-0 text-xs font-semibold text-blue-700">직원 관리로 이동 →</Link>}
        >
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
              <p className="text-[11px] text-slate-500">전체 사용자</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{NUMBER_FORMAT.format(staff_overview.total_staff)}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
              <p className="text-[11px] text-slate-500">활성 사용자</p>
              <p className="mt-1 text-lg font-bold text-emerald-700">{NUMBER_FORMAT.format(staff_overview.active_staff)}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
              <p className="text-[11px] text-slate-500">부서 수</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{NUMBER_FORMAT.format(staff_overview.department_count)}</p>
            </div>
          </div>
          {staff.length === 0 ? (
            <EmptyRow>등록된 활성 사용자가 없습니다.</EmptyRow>
          ) : (
            <ul className="mt-3 max-h-56 divide-y divide-slate-100 overflow-y-auto">
              {staff.map((row) => (
                <li key={row.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="min-w-0 truncate text-slate-800">{row.name}</span>
                  <span className="shrink-0 pl-3 text-xs text-slate-500">{row.department_name} · {row.role_display_name}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* D. 최근 활동 / 연동 상태 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title="최근 활동" description="병원 내 주요 이벤트 및 시스템 이벤트입니다.">
          {activity_log.length === 0 && recent_events.length === 0 ? (
            <EmptyRow>최근 활동이 없습니다.</EmptyRow>
          ) : (
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
              {activity_log.map((row) => (
                <li key={`activity-${row.id}`} className="flex items-center justify-between py-2 text-sm">
                  <span className="min-w-0 truncate text-slate-700">
                    <span className="font-medium text-slate-900">{row.actor_name}</span>
                    {" · "}{row.action_type_display}{" · "}{row.target_table}
                  </span>
                  <span className="shrink-0 pl-3 text-xs text-slate-400">{formatDateTime(row.created_at)}</span>
                </li>
              ))}
              {recent_events.map((event, index) => (
                <li key={`event-${event.label}-${event.at}-${index}`} className="flex items-center justify-between py-2 text-sm">
                  <span className="min-w-0 truncate text-slate-700">
                    <span className="font-medium text-slate-900">{event.label}</span> · {event.detail}
                  </span>
                  <span className="shrink-0 pl-3 text-xs text-slate-400">{formatDateTime(event.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="연동 상태" description="병원 운영과 직접 관련된 서비스 상태입니다.">
          <ul className="divide-y divide-slate-100">
            {integrations.map((item) => (
              <li key={item.name} className="flex items-center justify-between py-2.5">
                <span className="text-sm font-medium text-slate-800">{item.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{item.detail}</span>
                  <StatusBadge status={item.status} />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <FailureDetailDrawer
        open={selectedFailure !== null}
        onClose={() => setSelectedFailure(null)}
        title={selectedFailure ? `${selectedFailure.case_code} · ${selectedFailure.analysis_type_display}` : ""}
        subtitle={selectedFailure ? `Case ID: ${selectedFailure.case_id}` : undefined}
        fields={selectedFailure ? failureFields(selectedFailure) : []}
        message={selectedFailure?.error_message ?? null}
      />
    </div>
  );
}
