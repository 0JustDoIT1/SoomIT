"use client";

import { API_BASE_URL, staffAuthenticatedFetch } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { SkeletonBlock, SkeletonLine } from "../_components/skeleton";

type Patient = {
  id: string;
  patient_code: string;
  name: string;
  created_at: string;
};

type ExaminationFlow = {
  id: string;
  case_code: string;
  patient_code: string;
  patient_name: string;
  current_stage: string;
  case_status: string;
  updated_at: string;
};

type Appointment = {
  id: string;
  patient_code: string;
  patient_name: string;
  case_code: string | null;
  doctor_name: string | null;
  scheduled_at: string;
  appointment_status: string;
  created_by_type: string;
  created_at: string;
};

type AppointmentRequest = {
  id: string;
  appointment: string;
  patient_code: string;
  patient_name: string;
  request_type: "CHANGE" | "CANCEL";
  status: "PENDING" | "APPROVED" | "REJECTED";
  original_scheduled_at: string;
  requested_scheduled_at: string | null;
  requested_at: string;
};

type ExaminationOrder = {
  id: string;
  patient_code: string;
  patient_name: string;
  requesting_doctor_name: string;
  order_type: "XRAY" | "CT" | "PET_CT_TNM" | "PATHOLOGY_GENE" | "PDL1";
  status: "ORDERED" | "SCHEDULED" | "COMPLETED" | "CANCELLED";
  created_at: string;
};

type RequestRow = {
  id: string;
  createdAt: string;
  patientCode: string;
  patientName: string;
  doctorName: string | null;
  requestType: "NEW" | "CHANGE" | "CANCEL";
  originalScheduledAt: string | null;
  requestedScheduledAt: string | null;
  status: string;
};

const FLOW_STAGES = [
  "XRAY",
  "CT",
  "PET_CT_TNM",
  "PATHOLOGY_GENE",
  "PDL1",
  "TREATMENT",
  "PRESCRIPTION",
];

const STAGE_LABELS: Record<string, string> = {
  CONSULTATION: "진료",
  XRAY: "X-ray",
  CT: "CT",
  PET_CT_TNM: "PET-CT / TNM",
  PATHOLOGY_GENE: "병리·유전자 검사",
  PDL1: "PD-L1 검사",
  TREATMENT: "치료",
  PRESCRIPTION: "처방",
};

const ORDER_LABELS: Record<ExaminationOrder["order_type"], string> = {
  XRAY: "X-ray",
  CT: "CT",
  PET_CT_TNM: "PET-CT / TNM",
  PATHOLOGY_GENE: "병리·유전자 검사",
  PDL1: "PD-L1 검사",
};

const RECENT_ACTIVITY_LIMIT = 6;

type ActivityItem = {
  id: string;
  occurredAt: string;
  title: string;
  patientName: string;
  patientCode: string;
  category: "APPOINTMENT" | "ORDER" | "PATIENT";
};

export default function CoordinatorDashboardPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [cases, setCases] = useState<ExaminationFlow[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentRequests, setAppointmentRequests] = useState<AppointmentRequest[]>([]);
  const [examinationOrders, setExaminationOrders] = useState<ExaminationOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError("");
        const paths = [
          "/api/patients/",
          "/api/cases/",
          "/api/appointments/",
          "/api/appointments/requests/?status=PENDING",
          "/api/appointments/coordinator/examination-orders/",
        ];
        const responses = await Promise.all(
          paths.map((path) => staffAuthenticatedFetch(`${API_BASE_URL}${path}`)),
        );
        const failedResponse = responses.find((response) => !response.ok);
        if (failedResponse) {
          throw new Error(`대시보드 정보를 불러오지 못했습니다. (${failedResponse.status})`);
        }
        const [patientData, caseData, appointmentData, requestData, orderData] =
          await Promise.all(responses.map((response) => response.json()));

        if (!active) return;
        setPatients(patientData as Patient[]);
        setCases(caseData as ExaminationFlow[]);
        setAppointments(appointmentData as Appointment[]);
        setAppointmentRequests(requestData as AppointmentRequest[]);
        setExaminationOrders(orderData as ExaminationOrder[]);
      } catch (fetchError) {
        if (active) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "대시보드 조회 중 오류가 발생했습니다.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchDashboardData();
    return () => {
      active = false;
    };
  }, []);

  const pendingRequests = useMemo(() => {
    const appointmentsById = new Map(appointments.map((appointment) => [appointment.id, appointment]));
    const newRequests: RequestRow[] = appointments
      .filter((appointment) => appointment.appointment_status === "REQUESTED")
      .map((appointment) => ({
        id: `new-${appointment.id}`,
        createdAt: appointment.created_at,
        patientCode: appointment.patient_code,
        patientName: appointment.patient_name,
        doctorName: appointment.doctor_name,
        requestType: "NEW",
        originalScheduledAt: null,
        requestedScheduledAt: appointment.scheduled_at,
        status: appointment.appointment_status,
      }));
    const changeOrCancelRequests: RequestRow[] = appointmentRequests
      .filter((request) => request.status === "PENDING")
      .map((request) => {
        const appointment = appointmentsById.get(request.appointment);
        return {
          id: request.id,
          createdAt: request.requested_at,
          patientCode: request.patient_code,
          patientName: request.patient_name,
          doctorName: appointment?.doctor_name ?? null,
          requestType: request.request_type,
          originalScheduledAt: request.original_scheduled_at,
          requestedScheduledAt: request.requested_scheduled_at,
          status: request.status,
        };
      });
    return [...newRequests, ...changeOrCancelRequests].sort(
      (first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
    );
  }, [appointments, appointmentRequests]);

  const todayAppointments = useMemo(() => {
    const patientsByCode = new Map(patients.map((patient) => [patient.patient_code, patient]));
    const casesByPatient = new Map<string, ExaminationFlow>();
    for (const caseItem of [...cases].sort(
      (first, second) => new Date(second.updated_at).getTime() - new Date(first.updated_at).getTime(),
    )) {
      if (!casesByPatient.has(caseItem.patient_code)) {
        casesByPatient.set(caseItem.patient_code, caseItem);
      }
    }
    return appointments
      .filter(
        (appointment) =>
          appointment.appointment_status === "CONFIRMED" && isToday(appointment.scheduled_at),
      )
      .sort((first, second) => new Date(first.scheduled_at).getTime() - new Date(second.scheduled_at).getTime())
      .map((appointment) => ({
        appointment,
        patient: patientsByCode.get(appointment.patient_code) ?? null,
        examination: casesByPatient.get(appointment.patient_code) ?? null,
      }));
  }, [appointments, cases, patients]);

  const recentActivities = useMemo<ActivityItem[]>(() => {
    const appointmentActivities: ActivityItem[] = appointments
      .filter((appointment) => appointment.appointment_status === "REQUESTED")
      .map((appointment) => ({
        id: `appointment-${appointment.id}`,
        occurredAt: appointment.created_at,
        title: "신규 예약 요청",
        patientName: appointment.patient_name,
        patientCode: appointment.patient_code,
        category: "APPOINTMENT",
      }));
    const changeOrCancelActivities: ActivityItem[] = appointmentRequests.map((request) => ({
      id: `appointment-request-${request.id}`,
      occurredAt: request.requested_at,
      title: request.request_type === "CHANGE" ? "예약 변경 요청" : "예약 취소 요청",
      patientName: request.patient_name,
      patientCode: request.patient_code,
      category: "APPOINTMENT",
    }));
    const patientActivities: ActivityItem[] = patients.map((patient) => ({
      id: `patient-${patient.id}`,
      occurredAt: patient.created_at,
      title: "신규 환자 등록",
      patientName: patient.name,
      patientCode: patient.patient_code,
      category: "PATIENT",
    }));
    const orderActivities: ActivityItem[] = examinationOrders.map((order) => ({
      id: `order-${order.id}`,
      occurredAt: order.created_at,
      title: `${ORDER_LABELS[order.order_type]} 오더 생성`,
      patientName: order.patient_name,
      patientCode: order.patient_code,
      category: "ORDER",
    }));

    return [...appointmentActivities, ...changeOrCancelActivities, ...patientActivities, ...orderActivities]
      .sort((first, second) => new Date(second.occurredAt).getTime() - new Date(first.occurredAt).getTime())
      .slice(0, RECENT_ACTIVITY_LIMIT);
  }, [appointments, appointmentRequests, examinationOrders, patients]);

  const summary: { label: string; count: number; icon: SummaryIconName }[] = [
    {
      label: "오늘 예약",
      icon: "calendar",
      count: appointments.filter(
        (appointment) =>
          appointment.appointment_status === "CONFIRMED" && isToday(appointment.scheduled_at),
      ).length,
    },
    {
      label: "신규 예약 요청",
      icon: "calendarPlus",
      count: appointments.filter((appointment) => appointment.appointment_status === "REQUESTED").length,
    },
    {
      label: "변경 요청",
      icon: "calendarPen",
      count: appointmentRequests.filter(
        (request) => request.request_type === "CHANGE" && request.status === "PENDING",
      ).length,
    },
    {
      label: "취소 요청",
      icon: "calendarX",
      count: appointmentRequests.filter(
        (request) => request.request_type === "CANCEL" && request.status === "PENDING",
      ).length,
    },
    { label: "신규 환자", icon: "userPlus", count: patients.filter((patient) => isToday(patient.created_at)).length },
  ];

  if (error) {
    return <div role="alert" className="rounded-xl border border-rose-100 bg-white px-6 py-5 text-sm text-rose-700">{error}</div>;
  }

  return (
    <div className="space-y-5">
      <div className="space-y-4 rounded-md border border-[#DDE5EE] bg-[#F8FAFC] p-4">
      <h2 className="text-sm font-semibold text-[#24364B]">오늘 업무</h2>
      <section aria-label="상단 업무 요약" className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-5">
          {loading ? Array.from({ length: 5 }, (_, index) => (
            <div key={`summary-skeleton-${index}`} className="flex min-w-0 items-center gap-3 px-3 py-3 sm:gap-3.5 sm:px-4">
              <SkeletonBlock className="h-10 w-10 flex-none" />
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonLine className="w-20" />
                <SkeletonBlock className="h-7 w-10" />
              </div>
            </div>
          )) : summary.map((item) => (
            <div key={item.label} className="flex min-w-0 items-center gap-3 px-3 py-3 transition-colors duration-200 hover:bg-[#FDF1F5] sm:gap-3.5 sm:px-4">
              <span className="flex h-10 w-10 flex-none items-center justify-center" aria-hidden="true">
                <SummaryIcon name={item.icon} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-500">{item.label}</p>
                <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${item.count > 0 && item.label !== "오늘 예약" && item.label !== "신규 환자" ? "text-pink-500" : "text-slate-700"}`}>{item.count}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div aria-hidden="true" className="my-5 border-t border-[#E5EAF0]" />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 2xl:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(240px,1fr)]">
      <section className="min-w-0 min-h-[500px] overflow-hidden rounded-lg border border-[#E1E5EB] bg-white shadow-sm">
        <div className="flex h-10 items-center justify-between gap-3 border-b border-[#E1E5EB] bg-[#EEF1F7] px-4">
          <h2 className="text-base font-semibold text-slate-900">처리 필요한 예약 요청</h2>
          {loading ? <SkeletonBlock className="h-5 w-10" /> : <CountBadge count={pendingRequests.length} />}
        </div>
          {loading ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[570px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>{["환자", "유형", "담당의", "요청/예약 시간", "상태"].map((label) => <th key={label} className="px-3 py-2.5">{label}</th>)}</tr>
                </thead>
                <tbody>{Array.from({ length: 5 }, (_, row) => (
                  <tr key={row} className="border-b border-slate-100">
                    {[0, 1, 2, 3, 4].map((cell) => <td key={cell} className="px-3 py-3"><SkeletonLine className={cell === 3 ? "w-32" : cell === 0 ? "w-24" : "w-16"} /></td>)}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : pendingRequests.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[570px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-3 py-2.5">환자</th>
                    <th className="px-3 py-2.5">유형</th>
                    <th className="px-3 py-2.5">담당의</th>
                    <th className="px-3 py-2.5">요청/예약 시간</th>
                    <th className="px-3 py-2.5">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingRequests.map((request) => (
                    <tr
                      key={request.id}
                      className="text-slate-700 transition hover:bg-[#F5F7FA]"
                    >
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-slate-800">{request.patientName}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{request.patientCode}</p>
                      </td>
                      <td className="px-3 py-2"><RequestTypeBadge type={request.requestType} /></td>
                      <td className="px-3 py-2.5 text-sm text-slate-600">{request.doctorName || "미지정"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                        {request.originalScheduledAt && <span className="block text-xs text-slate-500">기존 {formatDateTime(request.originalScheduledAt)}</span>}
                        <span className="block text-sm text-slate-700">{request.requestedScheduledAt ? formatDateTime(request.requestedScheduledAt) : "—"}</span>
                        <span className="mt-0.5 block text-[11px] text-slate-400">접수 {formatDateTime(request.createdAt)}</span>
                      </td>
                      <td className="px-3 py-2.5"><ApprovalBadge /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState>처리할 예약 요청이 없습니다.</EmptyState>
          )}
          <div className="border-t border-slate-100 px-4 py-2.5 text-right">
            <button type="button" onClick={() => router.push("/coordinator/appointments")} className="text-xs font-medium text-pink-500 hover:text-pink-600">
              전체 요청 보기 <span aria-hidden="true">→</span>
            </button>
          </div>
      </section>

      <section className="min-w-0 min-h-[500px] overflow-hidden rounded-lg border border-[#E1E5EB] bg-white shadow-sm">
        <div className="flex h-10 items-center justify-between gap-3 border-b border-[#E1E5EB] bg-[#EEF1F7] px-4">
          <h2 className="text-base font-semibold text-slate-800">검사 오더 현황</h2>
          {loading ? <SkeletonBlock className="h-5 w-10" /> : <CountBadge count={examinationOrders.length} />}
        </div>
          {loading ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>{["환자", "검사 종류", "담당의", "오더 생성일"].map((label) => <th key={label} className="px-3 py-2.5">{label}</th>)}</tr>
                </thead>
                <tbody>{Array.from({ length: 7 }, (_, row) => (
                  <tr key={row} className="border-b border-slate-100">
                    {[0, 1, 2, 3].map((cell) => <td key={cell} className="px-3 py-3"><SkeletonLine className={cell === 0 ? "w-24" : cell === 3 ? "w-28" : "w-16"} /></td>)}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : examinationOrders.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-3 py-2.5">환자</th>
                    <th className="px-3 py-2.5">검사 종류</th>
                    <th className="px-3 py-2.5">담당의</th>
                    <th className="px-3 py-2.5">오더 생성일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {examinationOrders.slice(0, 7).map((order) => (
                    <tr key={order.id} className="text-slate-700 transition hover:bg-[#EEF1F7]/70">
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-slate-800">{order.patient_name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{order.patient_code}</p>
                      </td>
                      <td className="px-3 py-2"><OrderTypeLabel type={order.order_type} /></td>
                      <td className="px-3 py-2.5 text-sm text-slate-500">{order.requesting_doctor_name}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-slate-500">{formatDateTime(order.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState>표시할 검사 오더가 없습니다.</EmptyState>
          )}
          {examinationOrders.length > 7 && (
            <div className="border-t border-slate-100 px-4 py-2 text-right text-xs text-slate-500">
              최근 7건 표시 · 전체 {examinationOrders.length}건
            </div>
          )}
      </section>
      <section className="min-w-0 overflow-hidden rounded-lg border border-[#E1E5EB] bg-white shadow-sm lg:col-span-2 2xl:col-span-1">
        <div className="flex h-10 items-center justify-between gap-3 border-b border-[#E1E5EB] bg-[#F2F3F5] px-4">
          <h2 className="text-base font-medium text-slate-600">최근 활동</h2>
          {loading ? <SkeletonBlock className="h-5 w-10" /> : <CountBadge count={recentActivities.length} muted />}
        </div>
        {loading ? (
          <ol className="divide-y divide-slate-100/80">
            {Array.from({ length: RECENT_ACTIVITY_LIMIT }, (_, index) => (
              <li key={index} className="space-y-2 px-3 py-3">
                <SkeletonLine className="w-20" />
                <SkeletonLine className="w-3/4" />
                <SkeletonLine className="w-1/2" />
              </li>
            ))}
          </ol>
        ) : recentActivities.length ? (
          <ol className="divide-y divide-slate-100/80">
            {recentActivities.map((activity) => (
              <li key={activity.id} className="px-3 py-2">
                <time dateTime={activity.occurredAt} className="text-[11px] tabular-nums text-slate-400">
                  {formatDateTime(activity.occurredAt)}
                </time>
                <p className="mt-0.5 text-sm font-medium text-slate-600">
                  {activity.title}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{activity.patientName} · {activity.patientCode}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="px-4 py-5 text-sm text-slate-500">최근 활동이 없습니다.</p>
        )}
      </section>
      </div>
      </div>

      <section>
        <SectionHeading title="오늘 진료 진행 현황" count={todayAppointments.length} loading={loading} />
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="divide-y divide-slate-100">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="grid grid-cols-1 items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(150px,1.2fr)_100px_minmax(120px,1fr)_minmax(160px,1.5fr)] sm:px-5">
                  <div className="space-y-2"><SkeletonLine className="w-28" /><SkeletonLine className="w-20" /></div>
                  <SkeletonLine className="w-12" />
                  <SkeletonLine className="w-24" />
                  <SkeletonBlock className="h-5 w-full" />
                </div>
              ))}
            </div>
          ) : todayAppointments.length ? (
            <div className="divide-y divide-slate-100">
              {todayAppointments.map(({ appointment, patient, examination }) => (
                <button
                  key={appointment.id}
                  type="button"
                  onClick={() => router.push("/coordinator/appointments")}
                  className="grid w-full grid-cols-1 items-center gap-3 px-4 py-3 text-left transition hover:bg-[#F5F7FA] sm:grid-cols-[minmax(150px,1.2fr)_100px_minmax(120px,1fr)_minmax(160px,1.5fr)] sm:px-5"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-800">{patient?.name ?? appointment.patient_name}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{patient?.patient_code ?? appointment.patient_code}</span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-slate-700">{formatTime(appointment.scheduled_at)}</span>
                  <span className="text-sm text-slate-600">{appointment.doctor_name || "담당의 미정"}</span>
                  <FlowProgress stage={examination?.current_stage ?? null} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState>오늘 확정된 진료 예약이 없습니다.</EmptyState>
          )}
        </div>
      </section>
    </div>
  );
}

type SummaryIconName = "calendar" | "calendarPlus" | "calendarPen" | "calendarX" | "userPlus";

function SummaryIcon({ name }: { name: SummaryIconName }) {
  const common = { width: 40, height: 40, className: "block h-10 w-10 flex-none", fill: "none", stroke: "#D96B91", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", focusable: false };
  return <svg {...common}>
    {name === "calendar" && <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17" /></>}
    {name === "calendarPlus" && <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17M12 12.5v5M9.5 15h5" /></>}
    {name === "calendarPen" && <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17M10.5 16.5l4.8-4.8 1.8 1.8-4.8 4.8-2.3.5z" /></>}
    {name === "calendarX" && <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17m-9 4 5 5m0-5-5 5" /></>}
    {name === "userPlus" && <><path d="M15.5 20v-1.5a4 4 0 0 0-4-4h-4a4 4 0 0 0-4 4V20" /><circle cx="9.5" cy="7.5" r="4" /><path d="M19 8v6m-3-3h6" /></>}
  </svg>;
}
function SectionHeading({ title, count, loading = false }: { title: string; count: number; loading?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      {loading ? <SkeletonBlock className="h-6 w-10 rounded-full" /> : <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-600">{count}</span>}
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-slate-500">{children}</p>;
}

function CountBadge({ count, muted = false }: { count: number; muted?: boolean }) {
  return (
    <span className={`inline-flex h-5 items-center rounded-md border px-2 text-[11px] font-medium tabular-nums ${muted ? "border-slate-200/80 bg-white/70 text-slate-500" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
      {count}건
    </span>
  );
}

function RequestTypeBadge({ type }: { type: RequestRow["requestType"] }) {
  const labels: Record<RequestRow["requestType"], string> = {
    NEW: "신규 예약",
    CHANGE: "예약 변경",
    CANCEL: "예약 취소",
  };
  const tone: Record<RequestRow["requestType"], string> = {
    NEW: "border-pink-400 text-pink-600",
    CHANGE: "border-[#B8C1D2] text-[#536784]",
    CANCEL: "border-[#D7D9DE] text-[#6B7280]",
  };
  return <span className={`inline-flex whitespace-nowrap border-l-2 py-0.5 pl-2 text-xs font-medium ${tone[type]}`}>{labels[type]}</span>;
}

function ApprovalBadge() {
  return <span className="inline-flex whitespace-nowrap rounded-sm border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600"><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-pink-400" aria-hidden="true" />승인 대기</span>;
}

function OrderTypeLabel({ type }: { type: ExaminationOrder["order_type"] }) {
  return <span className="inline-flex border-l-2 border-slate-300 pl-2 text-sm font-medium text-slate-700">{ORDER_LABELS[type]}</span>;
}

function FlowProgress({ stage }: { stage: string | null }) {
  if (!stage) {
    return <span className="text-xs text-slate-500">Case 단계 정보 없음</span>;
  }
  const currentIndex = FLOW_STAGES.indexOf(stage);
  return (
    <span className="flex min-w-0 items-center gap-2" aria-label={`현재 진료 단계: ${STAGE_LABELS[stage] ?? stage}`}>
      <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
        {FLOW_STAGES.map((flowStage, index) => (
          <span
            key={flowStage}
            className={`h-1.5 w-3 rounded-full ${index === currentIndex ? "bg-pink-400" : "bg-slate-200"}`}
          />
        ))}
      </span>
      <span className="truncate text-xs font-semibold text-slate-700">{STAGE_LABELS[stage] ?? stage}</span>
    </span>
  );
}

function isToday(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}.${day} ${hour}:${minute}`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}
