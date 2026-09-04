"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Patient = {
  id: string;
  patient_code: string;
  name: string;
  created_at: string;
};

type CaseItem = {
  id: string;
  case_code: string;
  patient_code: string;
  patient_name: string;
  current_stage: string;
  case_status: string;
  created_at: string;
  updated_at: string;
};

type Appointment = {
  id: string;
  patient_code: string;
  patient_name: string;
  case_code: string | null;
  scheduled_at: string;
  appointment_status: string;
  created_by_type: string;
  created_at: string;
};

export default function CoordinatorDashboardPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError("");

        const [patientsResponse, casesResponse, appointmentsResponse] = await Promise.all([
          fetch("http://127.0.0.1:8000/api/patients/"),
          fetch("http://127.0.0.1:8000/api/cases/"),
          fetch("http://127.0.0.1:8000/api/appointments/"),
        ]);

        if (!patientsResponse.ok || !casesResponse.ok || !appointmentsResponse.ok) throw new Error("대시보드 정보를 불러오지 못했습니다.");

        const [patientData, caseData, appointmentData] = await Promise.all([
          patientsResponse.json(),
          casesResponse.json(),
          appointmentsResponse.json(),
        ]);

        setPatients(patientData);
        setCases(caseData);
        setAppointments(appointmentData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "대시보드 조회 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const todayAppointments = useMemo(() => appointments.filter((item) => isToday(item.scheduled_at)), [appointments]);
  const requestedCount = useMemo(() => appointments.filter((item) => item.appointment_status === "REQUESTED").length, [appointments]);
  const confirmedCount = useMemo(() => appointments.filter((item) => item.appointment_status === "CONFIRMED").length, [appointments]);
  const cancelledCount = useMemo(() => appointments.filter((item) => item.appointment_status === "CANCELLED").length, [appointments]);

  const recentAppointments = useMemo(() => [...appointments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5), [appointments]);
  const recentCases = useMemo(() => [...cases].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 5), [cases]);
  const recentPatients = useMemo(() => [...patients].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5), [patients]);

  if (loading) return <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">대시보드 정보를 불러오는 중입니다.</div>;

  if (error) return <div className="rounded-2xl bg-red-50 p-6 text-sm text-red-600">{error}</div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">대시보드</h1>
        <p className="mt-2 text-sm text-slate-500">원무과 주요 업무 현황을 확인합니다.</p>
      </div>

     <div className="relative">
      <div className="flex gap-8">
        <IndexStatCard title="오늘 예약" value={todayAppointments.length} fill="#F2F9FF" />
        <IndexStatCard title="예약 요청" value={requestedCount} fill="#FFF9E8" />
        <IndexStatCard title="예약 확정" value={confirmedCount} fill="#F0FBF6" />
        <IndexStatCard title="예약 취소" value={cancelledCount} fill="#FFF2F7" />
      </div>

      <div className="mt-1 h-px w-[690px] bg-pink-100" />
    </div>

      <div className="mt-6 grid grid-cols-2 gap-5">
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-800">최근 예약</h2>
              <p className="mt-1 text-xs text-slate-400">최근 등록된 예약을 확인합니다.</p>
            </div>
            <button type="button" onClick={() => router.push("/coordinator/appointments")} className="text-sm font-medium text-pink-500 hover:text-pink-600">전체 보기</button>
          </div>

          <div className="divide-y divide-slate-100">
            {recentAppointments.map((appointment) => (
              <button key={appointment.id} type="button" onClick={() => router.push("/coordinator/appointments")} className="flex w-full items-center justify-between py-4 text-left hover:bg-slate-50">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{appointment.patient_name}</p>
                  <p className="mt-1 text-xs text-slate-400">{appointment.patient_code} · {formatDateTime(appointment.scheduled_at)}</p>
                </div>
                <StatusBadge label={getAppointmentStatusLabel(appointment.appointment_status)} />
              </button>
            ))}
            {recentAppointments.length === 0 && <EmptyMessage text="등록된 예약이 없습니다." />}
          </div>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-800">최근 Case 변경</h2>
              <p className="mt-1 text-xs text-slate-400">최근 변경된 Case를 확인합니다.</p>
            </div>
            <button type="button" onClick={() => router.push("/coordinator/cases")} className="text-sm font-medium text-pink-500 hover:text-pink-600">전체 보기</button>
          </div>

          <div className="divide-y divide-slate-100">
            {recentCases.map((caseItem) => (
              <button key={caseItem.id} type="button" onClick={() => router.push(`/coordinator/cases/${caseItem.id}`)} className="flex w-full items-center justify-between py-4 text-left hover:bg-slate-50">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{caseItem.case_code}</p>
                  <p className="mt-1 text-xs text-slate-400">{caseItem.patient_name} · {caseItem.patient_code}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-pink-500">{getStageLabel(caseItem.current_stage)}</p>
                  <p className="mt-1 text-xs text-slate-400">{getCaseStatusLabel(caseItem.case_status)}</p>
                </div>
              </button>
            ))}
            {recentCases.length === 0 && <EmptyMessage text="등록된 Case가 없습니다." />}
          </div>
        </section>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-5">
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-800">최근 등록 환자</h2>
              <p className="mt-1 text-xs text-slate-400">최근 등록된 환자입니다.</p>
            </div>
            <button type="button" onClick={() => router.push("/coordinator/patients")} className="text-sm font-medium text-pink-500 hover:text-pink-600">전체 보기</button>
          </div>

          <div className="divide-y divide-slate-100">
            {recentPatients.map((patient) => (
              <button key={patient.id} type="button" onClick={() => router.push("/coordinator/patients")} className="flex w-full items-center justify-between py-4 text-left hover:bg-slate-50">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{patient.name}</p>
                  <p className="mt-1 text-xs text-slate-400">{patient.patient_code}</p>
                </div>
                <p className="text-xs text-slate-400">{formatDate(patient.created_at)}</p>
              </button>
            ))}
            {recentPatients.length === 0 && <EmptyMessage text="등록된 환자가 없습니다." />}
          </div>
        </section>

        <section className="rounded-2xl bg-pink-50/70 p-5">
          <h2 className="font-bold text-slate-800">업무 현황</h2>
          <p className="mt-1 text-xs text-slate-400">현재 시스템에 등록된 업무 데이터입니다.</p>

          <div className="mt-5 space-y-3">
            <DashboardRow label="전체 환자" value={`${patients.length}명`} />
            <DashboardRow label="진행 중 Case" value={`${cases.filter((item) => item.case_status === "ACTIVE").length}건`} />
            <DashboardRow label="전체 예약" value={`${appointments.length}건`} />
            <DashboardRow label="확인 필요 예약" value={`${requestedCount}건`} />
          </div>
        </section>
      </div>
    </div>
  );
}

function IndexStatCard({ title, value, fill }: { title: string; value: number; fill: string }) {
  return (
    <div className="relative h-[66px] w-[145px] shrink-0">
      <svg viewBox="0 0 145 66" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <path
          d="M10 1H40Q48 1 48 9V18H135Q144 18 144 27V56Q144 65 135 65H10Q1 65 1 56V10Q1 1 10 1Z"
          fill={fill}
          stroke="#F7A8C4"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="absolute inset-x-3 bottom-[13px] flex items-center justify-between">
        <span className="text-[13px] font-semibold text-slate-700">{title}</span>
        <div className="flex items-end gap-1">
          <span className="text-[18px] font-bold leading-none text-slate-900">{value}</span>
          <span className="text-[11px] text-slate-400">건</span>
        </div>
      </div>
    </div>
  );
}



function StatusBadge({ label }: { label: string }) {
  return <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-medium text-pink-600">{label}</span>;
}

function DashboardRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-700">{value}</span>
    </div>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return <div className="py-8 text-center text-sm text-slate-400">{text}</div>;
}

function isToday(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function getAppointmentStatusLabel(status: string) {
  if (status === "REQUESTED") return "예약 요청";
  if (status === "CONFIRMED") return "예약 확정";
  if (status === "CANCELLED") return "예약 취소";
  return status;
}

function getStageLabel(stage: string) {
  if (stage === "XRAY") return "X-ray";
  if (stage === "CT") return "CT";
  if (stage === "PATHOLOGY") return "병리";
  if (stage === "STAGING") return "TNM 병기";
  if (stage === "GENE") return "유전자 검사";
  if (stage === "TREATMENT") return "치료 의사결정";
  if (stage === "PRESCRIPTION") return "처방";
  return stage;
}

function getCaseStatusLabel(status: string) {
  if (status === "ACTIVE") return "진행중";
  if (status === "REFERRED_OUT") return "전원";
  if (status === "CLOSED") return "종결";
  return status;
}