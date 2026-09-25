"use client";

import { API_BASE_URL, staffAuthenticatedFetch } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import { showToast } from "@/components/ui/toast/toast";
import { SkeletonBlock, SkeletonLine } from "../_components/skeleton";

type Appointment = {
  id: string;
  patient_code: string;
  patient_name: string;
  case_code: string | null;
  doctor_name: string | null;
  scheduled_at: string;
  appointment_status: string;
  created_by_type: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
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
  reason: string | null;
  requested_at: string;
  processed_at: string | null;
  rejection_reason: string | null;
};

type Doctor = { id: string; name: string };

type ViewMode = "WEEK" | "MONTH";

const TIME_SLOTS = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
];

const MAX_APPOINTMENTS_PER_SLOT = 5;

const WEEK_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [appointmentRequests, setAppointmentRequests] = useState<
    AppointmentRequest[]
  >([]);
  const [selectedAppointmentRequest, setSelectedAppointmentRequest] =
    useState<AppointmentRequest | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("MONTH");

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [requestActionLoading, setRequestActionLoading] = useState(false);

  const [error, setError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [actionError, setActionError] = useState("");
  const [requestActionError, setRequestActionError] = useState("");

  const [isCancelMode, setIsCancelMode] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [isRejectMode, setIsRejectMode] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  /*
   * 예약 목록 조회
   */
  const fetchAppointments = async () => {
    try {
      setError("");

      const response = await staffAuthenticatedFetch(
        `${API_BASE_URL}/api/appointments/`
      );

      if (!response.ok) {
        throw new Error("예약 목록을 불러오지 못했습니다.");
      }

      const data = await response.json();

      setAppointments(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "예약 목록 조회 중 오류가 발생했습니다."
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchAppointmentRequests = async () => {
    try {
      setRequestError("");

      const response = await staffAuthenticatedFetch(
        `${API_BASE_URL}/api/appointments/requests/?status=PENDING`
      );

      if (!response.ok) {
        throw new Error("예약 요청 목록을 불러오지 못했습니다.");
      }

      const data = await response.json();
      setAppointmentRequests(data);
    } catch (err) {
      setRequestError(
        err instanceof Error
          ? err.message
          : "예약 요청 목록 조회 중 오류가 발생했습니다."
      );
    }
  };

  const fetchDoctors = async () => {
    const response = await staffAuthenticatedFetch(
      `${API_BASE_URL}/api/appointments/doctors/`,
    );
    if (!response.ok) throw new Error("의사 목록을 불러오지 못했습니다.");
    setDoctors(await response.json());
  };

  useEffect(() => {
    // Initial data synchronization with the existing appointments API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAppointments();
    void fetchAppointmentRequests();
    void fetchDoctors().catch((err) => setError(err instanceof Error ? err.message : "의사 목록 조회 중 오류가 발생했습니다."));
  }, []);

  /*
   * 예약 상세 조회
   */
  const fetchAppointmentDetail = async (
    appointmentId: string
  ) => {
    const response = await staffAuthenticatedFetch(
      `${API_BASE_URL}/api/appointments/${appointmentId}/`
    );

    if (!response.ok) {
      throw new Error("예약 상세 정보를 불러오지 못했습니다.");
    }

    return response.json();
  };

  const openAppointmentDetail = async (
    appointmentId: string
  ) => {
    try {
      setDetailLoading(true);
      setActionError("");
      setIsCancelMode(false);
      setCancellationReason("");

      const data = await fetchAppointmentDetail(
        appointmentId
      );

      setSelectedAppointment(data);
    } catch (err) {
      showToast.error(
        err instanceof Error
          ? err.message
          : "예약 상세 조회 중 오류가 발생했습니다."
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const closeAppointmentDetail = () => {
    if (actionLoading) return;

    setSelectedAppointment(null);
    setIsCancelMode(false);
    setCancellationReason("");
    setActionError("");
  };

  const openAppointmentRequestDetail = async (
    appointmentRequestId: string
  ) => {
    try {
      setDetailLoading(true);
      setSelectedAppointment(null);
      setRequestActionError("");
      setIsRejectMode(false);
      setRejectionReason("");

      const response = await staffAuthenticatedFetch(
        `${API_BASE_URL}/api/appointments/requests/${appointmentRequestId}/`
      );

      if (!response.ok) {
        throw new Error("예약 요청 상세 정보를 불러오지 못했습니다.");
      }

      setSelectedAppointmentRequest(await response.json());
    } catch (err) {
      showToast.error(
        err instanceof Error
          ? err.message
          : "예약 요청 상세 조회 중 오류가 발생했습니다."
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const closeAppointmentRequestDetail = () => {
    if (requestActionLoading) return;

    setSelectedAppointmentRequest(null);
    setRequestActionError("");
    setIsRejectMode(false);
    setRejectionReason("");
  };

  const handleApproveAppointmentRequest = async () => {
    if (!selectedAppointmentRequest) return;

    try {
      setRequestActionLoading(true);
      setRequestActionError("");

      const response = await staffAuthenticatedFetch(
        `${API_BASE_URL}/api/appointments/requests/${selectedAppointmentRequest.id}/approve/`,
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(response, "예약 요청 승인에 실패했습니다.")
        );
      }

      await Promise.all([
        fetchAppointments(),
        fetchAppointmentRequests(),
      ]);
      setSelectedAppointmentRequest(null);
      setIsRejectMode(false);
      setRejectionReason("");
      showToast.success(
        selectedAppointmentRequest.request_type === "CHANGE"
          ? "예약 변경 요청이 승인되었습니다."
          : "예약 취소 요청이 승인되었습니다."
      );
    } catch (err) {
      setRequestActionError(
        err instanceof Error
          ? err.message
          : "예약 요청 승인 중 오류가 발생했습니다."
      );
    } finally {
      setRequestActionLoading(false);
    }
  };

  const openRejectMode = () => {
    setRequestActionError("");
    setRejectionReason("");
    setIsRejectMode(true);
  };

  const closeRejectMode = () => {
    if (requestActionLoading) return;

    setRequestActionError("");
    setRejectionReason("");
    setIsRejectMode(false);
  };

  const handleRejectAppointmentRequest = async () => {
    if (!selectedAppointmentRequest) return;

    try {
      setRequestActionLoading(true);
      setRequestActionError("");

      const response = await staffAuthenticatedFetch(
        `${API_BASE_URL}/api/appointments/requests/${selectedAppointmentRequest.id}/reject/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rejection_reason: rejectionReason.trim() || null,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(response, "예약 요청 반려에 실패했습니다.")
        );
      }

      await fetchAppointmentRequests();
      setSelectedAppointmentRequest(null);
      setIsRejectMode(false);
      setRejectionReason("");
      showToast.success(
        selectedAppointmentRequest.request_type === "CHANGE"
          ? "예약 변경 요청이 반려되었습니다."
          : "예약 취소 요청이 반려되었습니다."
      );
    } catch (err) {
      setRequestActionError(
        err instanceof Error
          ? err.message
          : "예약 요청 반려 중 오류가 발생했습니다."
      );
    } finally {
      setRequestActionLoading(false);
    }
  };

  /*
   * 예약 확정
   */
  const handleConfirmAppointment = async () => {
    if (!selectedAppointment) return;

    try {
      setActionLoading(true);
      setActionError("");

      const response = await staffAuthenticatedFetch(
        `${API_BASE_URL}/api/appointments/${selectedAppointment.id}/confirm/`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          "예약 확정에 실패했습니다."
        );

        throw new Error(message);
      }

      await fetchAppointments();

      const updatedAppointment =
        await fetchAppointmentDetail(
          selectedAppointment.id
        );

      setSelectedAppointment(updatedAppointment);
      showToast.success("예약이 승인되었습니다.");
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "예약 확정 중 오류가 발생했습니다."
      );
    } finally {
      setActionLoading(false);
    }
  };

  const openCancelMode = () => {
    setActionError("");
    setCancellationReason("");
    setIsCancelMode(true);
  };

  const closeCancelMode = () => {
    if (actionLoading) return;

    setIsCancelMode(false);
    setCancellationReason("");
    setActionError("");
  };

  /*
   * 예약 취소
   */
  const handleCancelAppointment = async () => {
    if (!selectedAppointment) return;

    if (!cancellationReason.trim()) {
      setActionError("취소 사유를 입력해주세요.");
      return;
    }

    try {
      setActionLoading(true);
      setActionError("");

      const response = await staffAuthenticatedFetch(
        `${API_BASE_URL}/api/appointments/${selectedAppointment.id}/cancel/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cancellation_reason:
              cancellationReason.trim(),
          }),
        }
      );

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          "예약 취소에 실패했습니다."
        );

        throw new Error(message);
      }

      await fetchAppointments();

      const updatedAppointment =
        await fetchAppointmentDetail(
          selectedAppointment.id
        );

      setSelectedAppointment(updatedAppointment);
      setIsCancelMode(false);
      setCancellationReason("");
      showToast.success("예약이 취소되었습니다.");
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "예약 취소 중 오류가 발생했습니다."
      );
    } finally {
      setActionLoading(false);
    }
  };

  /*
   * 의사 목록
   *
   * 현재 별도의 호흡기내과 의사 조회 API가 없으므로
   * 예약 데이터에서 실제 확인되는 담당 의사만 사용합니다.
   */
  /*
   * 승인 대기
   */
  const requestedAppointments = useMemo(() => {
    return appointments
      .filter(
        (appointment) =>
          appointment.appointment_status ===
          "REQUESTED"
      )
      .sort(
        (a, b) =>
          new Date(a.scheduled_at).getTime() -
          new Date(b.scheduled_at).getTime()
      );
  }, [appointments]);

  /*
   * 선택된 날짜가 속한 주
   */
  const weekDates = useMemo(() => {
    const monday = getMonday(selectedDate);

    return Array.from(
      { length: 7 },
      (_, index) => addDays(monday, index)
    );
  }, [selectedDate]);

  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];

  /*
   * 월 달력
   */
  const monthCalendarDates = useMemo(() => {
    return getMonthCalendarDates(currentMonth);
  }, [currentMonth]);

  const selectedDateAppointments = useMemo(() => {
    return appointments
      .filter((appointment) => {
        return (
          appointment.appointment_status !== "CANCELLED" &&
          isSameDate(
            new Date(appointment.scheduled_at),
            selectedDate
          )
        );
      })
      .sort(
        (first, second) =>
          new Date(first.scheduled_at).getTime() -
          new Date(second.scheduled_at).getTime()
      );
  }, [appointments, selectedDate]);

  const selectedDateDoctorCounts = useMemo(() => {
    const counts = new Map<string, number>();
    selectedDateAppointments.forEach((appointment) => {
      if (!appointment.doctor_name) return;
      counts.set(appointment.doctor_name, (counts.get(appointment.doctor_name) ?? 0) + 1);
    });
    return Array.from(counts, ([doctor, count]) => ({ doctor, count }));
  }, [selectedDateAppointments]);

  const selectedDateSlotSummary = useMemo(() => {
    let availableSlots = 0;
    let fullSlots = 0;

    doctors.forEach(({ name: doctor }) => {
      TIME_SLOTS.forEach((time) => {
        if (isPastSlot(selectedDate, time)) return;
        const bookedCount = selectedDateAppointments.filter((appointment) => {
          if (appointment.doctor_name !== doctor) return false;
          return getTimeValue(new Date(appointment.scheduled_at)) === time;
        }).length;

        if (bookedCount >= MAX_APPOINTMENTS_PER_SLOT) fullSlots += 1;
        else availableSlots += 1;
      });
    });

    return { availableSlots, fullSlots };
  }, [doctors, selectedDate, selectedDateAppointments]);

  const pendingQueueCount = requestedAppointments.length + appointmentRequests.length;

  /*
   * 주 이동
   */
  const moveWeek = (offset: number) => {
    setSelectedDate((current) =>
      addDays(current, offset * 7)
    );
  };

  /*
   * 월 이동
   */
  const moveMonth = (offset: number) => {
    setCurrentMonth((current) => {
      return new Date(
        current.getFullYear(),
        current.getMonth() + offset,
        1
      );
    });
  };

  /*
   * 월간 날짜 클릭
   */
  const openDateFromMonth = (date: Date) => {
    setSelectedDate(date);
  };

  /*
   * 특정 의사 + 날짜 + 시간의 예약 찾기
   */
  const getSlotAppointments = (
    doctor: string,
    date: Date,
    time: string
  ) => {
    return appointments.filter((appointment) => {
      if (
        appointment.appointment_status ===
        "CANCELLED"
      ) {
        return false;
      }

      if (appointment.doctor_name !== doctor) {
        return false;
      }

      const appointmentDate = new Date(
        appointment.scheduled_at
      );

      return (
        isSameDate(appointmentDate, date) &&
        getTimeValue(appointmentDate) === time
      );
    });
  };

  /*
   * 특정 날짜 예약
   */
  const getAppointmentsForDate = (date: Date) => {
    return appointments.filter((appointment) => {
      if (
        appointment.appointment_status ===
        "CANCELLED"
      ) {
        return false;
      }

      return isSameDate(
        new Date(appointment.scheduled_at),
        date
      );
    });
  };

  return (
    <div>
      {/* 페이지 상단 */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">
          예약 관리
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          진료 예약 일정과 예약 요청을 관리합니다.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2.3fr)_minmax(290px,1fr)]">
        <aside className="contents xl:col-start-2 xl:row-start-1 xl:flex xl:flex-col xl:rounded-2xl xl:border xl:border-slate-200 xl:bg-white xl:p-5 xl:shadow-sm">
          <section className="order-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:order-none xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-800">처리 대기 요청</h2>
              {loading ? <SkeletonBlock className="h-4 w-8" /> : <span className="text-xs font-semibold text-pink-500">{pendingQueueCount}건</span>}
            </div>

            {loading ? (
              <div className="mt-4 divide-y divide-slate-100">
                {Array.from({ length: 3 }, (_, index) => <div key={index} className="space-y-2 py-3"><SkeletonLine className="w-28" /><SkeletonLine className="w-40" /><SkeletonLine className="w-20" /></div>)}
              </div>
            ) : (
              <div className="mt-3 divide-y divide-slate-100">
                {appointmentRequests.map((appointmentRequest) => (
                  <button
                    key={`request-${appointmentRequest.id}`}
                    type="button"
                    onClick={() => openAppointmentRequestDetail(appointmentRequest.id)}
                    className="w-full border-l-2 border-pink-200 py-3 pl-3 pr-1 text-left transition hover:bg-pink-50/40"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-800">{appointmentRequest.patient_name} · {appointmentRequest.patient_code}</p>
                      <span className="shrink-0 text-[11px] font-medium text-slate-500">승인 대기</span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-600">{getAppointmentRequestTypeLabel(appointmentRequest.request_type)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {appointmentRequest.request_type === "CHANGE"
                        ? `${formatDateTime(appointmentRequest.original_scheduled_at)} → ${formatDateTime(appointmentRequest.requested_scheduled_at ?? "")}`
                        : formatDateTime(appointmentRequest.original_scheduled_at)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">접수 {formatDateTime(appointmentRequest.requested_at)}</p>
                  </button>
                ))}
                {requestedAppointments.map((appointment) => (
                  <button
                    key={`appointment-${appointment.id}`}
                    type="button"
                    onClick={() => openAppointmentDetail(appointment.id)}
                    className="w-full border-l-2 border-pink-200 py-3 pl-3 pr-1 text-left transition hover:bg-pink-50/40"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-800">{appointment.patient_name} · {appointment.patient_code}</p>
                      <span className="shrink-0 text-[11px] font-medium text-slate-500">승인 대기</span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-600">신규 예약 요청</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(appointment.scheduled_at)}</p>
                    <p className="mt-1 text-[11px] text-slate-400">접수 {formatDateTime(appointment.created_at)}</p>
                  </button>
                ))}
                {pendingQueueCount === 0 && !requestError && (
                  <p className="py-5 text-sm text-slate-400">현재 처리할 예약 요청이 없습니다.</p>
                )}
              </div>
            )}
            {requestError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{requestError}</p>}
          </section>

          <section className="order-3 mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:order-none xl:mt-5 xl:border-0 xl:border-t xl:border-slate-100 xl:rounded-none xl:bg-transparent xl:px-0 xl:pb-0 xl:pt-5 xl:shadow-none">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-800">선택 날짜 현황</h2>
                <p className="mt-1 text-xs text-slate-400">{new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(selectedDate)}</p>
              </div>
              {loading ? <SkeletonBlock className="h-4 w-9" /> : <span className="text-xs text-slate-400">{selectedDateAppointments.length}건</span>}
            </div>
            <dl className="mt-3 divide-y divide-slate-100">
              <div className="flex items-center justify-between gap-3 py-2.5"><dt className="text-xs text-slate-500">확정 예약</dt><dd className="text-sm font-semibold tabular-nums text-slate-700">{loading ? <SkeletonLine className="w-8" /> : `${selectedDateAppointments.filter((appointment) => appointment.appointment_status === "CONFIRMED").length}건`}</dd></div>
              <div className="flex items-center justify-between gap-3 py-2.5"><dt className="text-xs text-slate-500">예약 가능 슬롯</dt><dd className="text-sm font-semibold tabular-nums text-slate-700">{loading ? <SkeletonLine className="w-8" /> : `${selectedDateSlotSummary.availableSlots}개`}</dd></div>
              <div className="flex items-center justify-between gap-3 py-2.5"><dt className="text-xs text-slate-500">정원 도달 슬롯</dt><dd className="text-sm font-semibold tabular-nums text-slate-700">{loading ? <SkeletonLine className="w-8" /> : `${selectedDateSlotSummary.fullSlots}개`}</dd></div>
            </dl>
          </section>

          <section className="order-4 mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:order-none xl:mt-5 xl:border-0 xl:border-t xl:border-slate-100 xl:rounded-none xl:bg-transparent xl:px-0 xl:pb-0 xl:pt-5 xl:shadow-none">
            <h2 className="text-sm font-bold text-slate-800">의사별 예약 현황</h2>
            {loading ? (
              <div className="mt-3 space-y-4">{Array.from({ length: 3 }, (_, index) => <div key={index} className="space-y-2"><SkeletonLine className="w-24" /><SkeletonLine className="w-36" /></div>)}</div>
            ) : selectedDateDoctorCounts.length ? (
              <ul className="mt-2 divide-y divide-slate-100">
                {selectedDateDoctorCounts.map(({ doctor, count }) => (
                  <li key={doctor} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-700">{doctor}</p><p className="mt-0.5 text-xs text-slate-400">호흡기내과</p></div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-600">{count}건</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-slate-400">선택한 날짜의 의사별 예약이 없습니다.</p>}
          </section>
        </aside>

        <main className="order-2 min-w-0 xl:col-start-1 xl:row-start-1 xl:order-none">
          {/* 2차 탭 */}
          <div className="border-b border-slate-200">
            <div className="flex h-11 items-end gap-8">
              <button
                type="button"
                onClick={() => setViewMode("MONTH")}
                className={`relative h-full px-0.5 text-sm font-semibold ${viewMode === "MONTH" ? "text-slate-900" : "text-slate-400 hover:text-slate-700"}`}
              >
                월간 예약
                {viewMode === "MONTH" && <span className="absolute bottom-0 left-0 h-[2px] w-full bg-pink-400" />}
              </button>
              <button
                type="button"
                onClick={() => setViewMode("WEEK")}
                className={`relative h-full px-0.5 text-sm font-semibold ${viewMode === "WEEK" ? "text-slate-900" : "text-slate-400 hover:text-slate-700"}`}
              >
                주간 예약
                {viewMode === "WEEK" && <span className="absolute bottom-0 left-0 h-[2px] w-full bg-pink-400" />}
              </button>
            </div>
          </div>

          {error && <div className="mt-5 rounded-2xl border border-red-100 bg-red-50/70 p-5 text-sm text-red-600">{error}</div>}

      {/* 주간 예약 */}
      {!error &&
        viewMode === "WEEK" && (
          <section className="mt-5 rounded-lg border border-[#F1D3DE] bg-white px-3 py-3">
            {/* 주 이동 */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => moveWeek(-1)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-50"
              >
                ‹
              </button>

              <div className="text-center">
                <p className="text-base font-bold text-slate-800">
                  {loading ? <SkeletonLine className="mx-auto w-44" /> : <>
                  {formatWeekRange(
                    weekStart,
                    weekEnd
                  )}
                  </>}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  날짜를 선택하면 해당 일자의 예약 가능 시간을 확인할 수 있습니다.
                </p>
              </div>

              <button
                type="button"
                onClick={() => moveWeek(1)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-50"
              >
                ›
              </button>
            </div>

            {/* 요일 선택 */}
            <div className="mt-5 overflow-hidden rounded-lg border border-pink-100 bg-white">
              <div className="grid grid-cols-7 border-b border-slate-200 bg-white">
              {weekDates.map((date, index) => {
                const active = isSameDate(
                  date,
                  selectedDate
                );

                const dayAppointments =
                  getAppointmentsForDate(date);

                return (
                  <button
                    key={date.toISOString()}
                    type="button"
                    onClick={() =>
                      setSelectedDate(date)
                    }
                    className={`relative min-w-0 px-1 py-3 text-center transition sm:px-2 ${
                      active
                        ? "bg-pink-50/70"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <p
                      className={`text-xs ${
                        active
                          ? "font-semibold text-pink-500"
                          : "text-slate-400"
                      }`}
                    >
                      {WEEK_LABELS[index]}
                    </p>

                    <p
                      className={`mt-1 text-sm font-semibold ${
                        active
                          ? "text-slate-900"
                          : "text-slate-600"
                      }`}
                    >
                      {date.getMonth() + 1}/
                      {date.getDate()}
                    </p>

                    <p className="mt-1 text-[11px] text-slate-400">
                      {loading ? <SkeletonLine className="mx-auto w-12" /> : dayAppointments.length > 0
                        ? `${dayAppointments.length}건`
                        : "예약 없음"}
                    </p>

                    {active && (
                      <span className="absolute bottom-0 left-0 h-[2px] w-full bg-pink-400" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* 시간표 */}
            <div className="mt-5 overflow-hidden border-y-2 border-slate-200 bg-white">
              <table className="w-full min-w-0 table-fixed text-left">
                <thead>
                  <tr className="border-b border-[#F3E0E7] bg-[#FFF8FB]">
                    <th className="w-14 px-1.5 py-2 text-xs font-semibold text-slate-500 sm:w-16 sm:px-2">
                      시간
                    </th>

                    {doctors.map((doctor) => (
                      <th
                        key={doctor.id}
                        className="min-w-0 border-l border-[#F7E5EB] px-1 py-2 text-center sm:px-2"
                      >
                        <p className="text-sm font-semibold text-slate-800">
                          {loading ? <SkeletonLine className="mx-auto w-16" /> : <span className="block truncate">{doctor.name}</span>}
                        </p>

                        <p className="mt-0.5 text-[11px] font-normal text-slate-400">
                          호흡기내과
                        </p>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {TIME_SLOTS.map((time) => (
                    <tr key={time}>
                      <td className="px-1.5 py-1.5 text-right text-xs font-medium text-slate-500 sm:px-2 sm:text-sm">
                        {time}
                      </td>

                      {doctors.map((doctor) => {
                        const slotAppointments =
                          getSlotAppointments(
                            doctor.name,
                            selectedDate,
                            time
                          );

                        const past = isPastSlot(
                          selectedDate,
                          time
                        );

                        if (loading) {
                          return <td key={`${doctor.id}-${time}`} className="border-l border-slate-100 px-1 py-1 sm:px-1.5"><SkeletonBlock className="min-h-[38px] w-full" /></td>;
                        }

                        if (slotAppointments.length > 0) {
                          return (
                            <td
                              key={`${doctor.id}-${time}`}
                              className="min-w-0 border-l border-slate-100 px-1 py-1 sm:px-1.5"
                            >
                              <div className="space-y-1">
                                {slotAppointments.map((appointment) => (
                                  <button
                                    key={appointment.id}
                                    type="button"
                                    onClick={() =>
                                      openAppointmentDetail(
                                        appointment.id
                                      )
                                    }
                                    className={`w-full min-w-0 rounded-md border border-l-2 px-1.5 py-2 text-left transition sm:px-2 ${getScheduleCellClass(
                                      appointment.appointment_status,
                                      past
                                    )}`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="truncate text-xs font-semibold">
                                        {appointment.patient_name}
                                      </span>

                                      <span className="shrink-0 rounded-sm bg-pink-100/70 px-1 py-0.5 text-[10px] text-pink-600">
                                        {getShortStatusLabel(
                                          appointment.appointment_status
                                        )}
                                      </span>
                                    </div>

                                    <p className="mt-1 truncate text-[10px] text-slate-500">
                                      {getAppointmentTypeLabel(
                                        appointment.created_by_type
                                      )}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            </td>
                          );
                        }

                        return (
                          <td
                            key={`${doctor.id}-${time}`}
                            className="min-w-0 border-l border-slate-100 px-1 py-1 sm:px-1.5"
                          >
                            <div className="min-h-[38px] min-w-0" aria-hidden="true" />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          </section>
        )}

      {/* 월간 예약 */}
      {!error &&
        viewMode === "MONTH" && (
          <section className="mt-5 space-y-5">
            <div className="overflow-hidden rounded-lg border border-[#D6B8C1] bg-white">
              <div className="flex items-center justify-center gap-4 border-b border-slate-200 px-4 py-3">
                <button
                  type="button"
                  onClick={() => moveMonth(-1)}
                  aria-label="이전 달"
                  className="px-2 py-1 text-lg text-slate-400 transition hover:text-slate-700"
                >
                  ‹
                </button>

                <h2 className="min-w-[120px] text-center text-base font-bold text-slate-800">
                  {loading ? <SkeletonLine className="mx-auto w-24" /> : <>
                  {currentMonth.getFullYear()}년{" "}
                  {currentMonth.getMonth() + 1}월
                  </>}
                </h2>

                <button
                  type="button"
                  onClick={() => moveMonth(1)}
                  aria-label="다음 달"
                  className="px-2 py-1 text-lg text-slate-400 transition hover:text-slate-700"
                >
                  ›
                </button>
              </div>

              <div className="grid grid-cols-7">
                {WEEK_LABELS.map((day) => (
                  <div
                    key={day}
                    className="border-b border-r border-slate-200 bg-[#E7EBF2] px-2 py-2 text-center text-[11px] font-semibold text-[#596579] last:border-r-0"
                    style={{ backgroundColor: "#E7EBF2" }}
                  >
                    {day}
                  </div>
                ))}

                {monthCalendarDates.map((date, index) => {
                  const currentMonthDate =
                    date.getMonth() === currentMonth.getMonth();
                  const today = isSameDate(date, new Date());
                  const selected = isSameDate(date, selectedDate);
                  const dayAppointments = getAppointmentsForDate(date);
                  const requestedCount = dayAppointments.filter(
                    (appointment) =>
                      appointment.appointment_status === "REQUESTED"
                  ).length;
                  const lastColumn = index % 7 === 6;

                  return (
                    <button
                      key={date.toISOString()}
                      type="button"
                      onClick={() => openDateFromMonth(date)}
                      className={`min-h-[82px] border-b border-slate-200 p-2 text-left transition hover:bg-pink-50/30 ${
                        lastColumn ? "" : "border-r"
                      } ${
                        selected
                          ? "bg-slate-100 ring-1 ring-inset ring-slate-400"
                          : today
                            ? "bg-pink-50/70"
                            : currentMonthDate
                              ? "bg-white"
                              : "bg-slate-50/60"
                      }`}
                    >
                      <span
                        className={`inline-flex h-6 min-w-6 items-center justify-center text-xs font-semibold ${
                          today
                            ? "rounded-full border border-pink-300 text-pink-500"
                            : selected
                              ? "text-slate-900"
                              : currentMonthDate
                                ? "text-slate-700"
                                : "text-slate-300"
                        }`}
                      >
                        {date.getDate()}
                      </span>

                      {loading ? <div className="mt-2 space-y-2"><SkeletonLine className="w-3/4" /><SkeletonLine className="w-1/2" /></div> : dayAppointments.length > 0 ? (
                        <div className="mt-1.5 space-y-0.5 text-[10px]">
                          <p className="text-slate-500">
                            <span className="mr-1 text-slate-300">●</span>
                            예약 {dayAppointments.length}
                          </p>
                          {requestedCount > 0 ? (
                            <p className="text-pink-500">
                              <span className="mr-1 text-pink-300">●</span>
                              승인 대기 {requestedCount}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <aside className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-bold text-slate-800">
                  {loading ? <SkeletonLine className="w-28" /> : formatDate(selectedDate)}
                </h2>
                <div className="mt-1 text-xs text-slate-400">{loading ? <SkeletonLine className="w-16" /> : `예약 ${selectedDateAppointments.length}건`}</div>
              </div>

              {loading ? <div className="divide-y divide-slate-100">{Array.from({ length: 5 }, (_, index) => <div key={index} className="space-y-2 px-4 py-3"><SkeletonLine className="w-40" /><SkeletonLine className="w-24" /><SkeletonLine className="w-32" /></div>)}</div> : selectedDateAppointments.length > 0 ? (
                <div className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">
                  {selectedDateAppointments.map((appointment) => (
                    <button
                      key={appointment.id}
                      type="button"
                      onClick={() => openAppointmentDetail(appointment.id)}
                      className="w-full px-4 py-3 text-left transition hover:bg-pink-50/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            {formatTime(appointment.scheduled_at)} ·{" "}
                            {appointment.patient_name}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {appointment.patient_code}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-[11px] font-semibold ${
                            appointment.appointment_status === "REQUESTED"
                              ? "text-pink-500"
                              : "text-slate-500"
                          }`}
                        >
                          {getAppointmentStatusLabel(
                            appointment.appointment_status
                          )}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span>{appointment.doctor_name ?? "담당 의사 미정"}</span>
                        <span>{getAppointmentTypeLabel(appointment.created_by_type)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-10 text-center text-sm text-slate-400">
                  예약이 없습니다.
                </p>
              )}
            </aside>
          </section>
        )}

        </main>
      </div>

      {/* 상세 로딩 */}
      {detailLoading && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/10">
          <div className="rounded-xl bg-white px-6 py-4 text-sm text-slate-600 shadow-lg">
            예약 정보를 불러오는 중입니다.
          </div>
        </div>
      )}

      {/* Drawer 배경 */}
      {(selectedAppointment || selectedAppointmentRequest) && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={
            selectedAppointmentRequest
              ? closeAppointmentRequestDetail
              : closeAppointmentDetail
          }
        />
      )}

      {/* 예약 상세 Drawer */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-[440px] bg-white shadow-2xl transition-transform duration-300 ${
          selectedAppointment || selectedAppointmentRequest
            ? "translate-x-0"
            : "translate-x-full"
        }`}
      >
        {selectedAppointmentRequest ? (
          <div className="flex h-full flex-col">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-pink-500">
                    예약 요청 상세
                  </p>

                  <h2 className="mt-1 text-xl font-bold text-slate-800">
                    {selectedAppointmentRequest.patient_name}
                  </h2>

                  <p className="mt-1 text-sm text-slate-400">
                    {selectedAppointmentRequest.patient_code}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeAppointmentRequestDetail}
                  className="rounded-full px-3 py-2 text-xl text-slate-400 transition hover:bg-slate-100"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {requestActionError && (
                <div className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  {requestActionError}
                </div>
              )}

              <div className="rounded-xl bg-pink-50/60 p-5">
                <h3 className="mb-4 font-semibold text-slate-700">
                  요청 정보
                </h3>

                <div className="space-y-4 text-sm">
                  <DetailRow
                    label="요청 유형"
                    value={getAppointmentRequestTypeLabel(
                      selectedAppointmentRequest.request_type
                    )}
                  />

                  <DetailRow
                    label="기존 예약일시"
                    value={formatDateTime(
                      selectedAppointmentRequest.original_scheduled_at
                    )}
                  />

                  <DetailRow
                    label="희망 예약일시"
                    value={
                      selectedAppointmentRequest.request_type === "CHANGE"
                        ? formatDateTime(
                            selectedAppointmentRequest.requested_scheduled_at
                          )
                        : "-"
                    }
                  />

                  <DetailRow
                    label="요청일시"
                    value={formatDateTime(
                      selectedAppointmentRequest.requested_at
                    )}
                  />

                  <DetailRow
                    label="요청 상태"
                    value={getAppointmentRequestStatusLabel(
                      selectedAppointmentRequest.status
                    )}
                  />

                  <DetailRow
                    label="요청 사유"
                    value={selectedAppointmentRequest.reason ?? "-"}
                  />
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-slate-100 p-5">
                <h3 className="font-semibold text-slate-700">
                  환자 정보
                </h3>

                <div className="mt-4 space-y-4 text-sm">
                  <DetailRow
                    label="환자번호"
                    value={selectedAppointmentRequest.patient_code}
                  />

                  <DetailRow
                    label="환자명"
                    value={selectedAppointmentRequest.patient_name}
                  />
                </div>
              </div>

              {selectedAppointmentRequest.status === "PENDING" &&
                isRejectMode && (
                  <div className="mt-5 rounded-xl border border-pink-100 bg-pink-50/40 p-5">
                    <h3 className="font-semibold text-slate-700">
                      예약 요청 반려
                    </h3>

                    <p className="mt-1 text-sm text-slate-400">
                      반려 사유를 입력해주세요.
                    </p>

                    <textarea
                      value={rejectionReason}
                      onChange={(event) =>
                        setRejectionReason(event.target.value)
                      }
                      placeholder="반려 사유를 입력하세요"
                      rows={4}
                      disabled={requestActionLoading}
                      className="mt-4 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-pink-300 disabled:bg-slate-100"
                    />
                  </div>
                )}
            </div>

            <div className="border-t border-slate-100 p-5">
              {selectedAppointmentRequest.status === "PENDING" ? (
                isRejectMode ? (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={closeRejectMode}
                      disabled={requestActionLoading}
                      className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      돌아가기
                    </button>

                    <button
                      type="button"
                      onClick={handleRejectAppointmentRequest}
                      disabled={requestActionLoading}
                      className="flex-1 rounded-xl border border-pink-200 px-4 py-3 text-sm font-semibold text-pink-600 transition hover:bg-pink-50 disabled:opacity-50"
                    >
                      {requestActionLoading ? "반려 처리 중..." : "반려 확정"}
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={openRejectMode}
                      disabled={requestActionLoading}
                      className="flex-1 rounded-xl border border-pink-200 px-4 py-3 text-sm font-medium text-pink-600 transition hover:bg-pink-50 disabled:opacity-50"
                    >
                      반려
                    </button>

                    <button
                      type="button"
                      onClick={handleApproveAppointmentRequest}
                      disabled={requestActionLoading}
                      className="flex-1 rounded-xl bg-pink-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-pink-600 disabled:opacity-50"
                    >
                      {requestActionLoading ? "승인 처리 중..." : "승인"}
                    </button>
                  </div>
                )
              ) : (
                <button
                  type="button"
                  onClick={closeAppointmentRequestDetail}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  닫기
                </button>
              )}
            </div>
          </div>
        ) : selectedAppointment ? (
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-pink-500">
                    예약 상세
                  </p>

                  <h2 className="mt-1 text-xl font-bold text-slate-800">
                    {selectedAppointment.patient_name}
                  </h2>

                  <p className="mt-1 text-sm text-slate-400">
                    {
                      selectedAppointment.patient_code
                    }
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeAppointmentDetail}
                  className="rounded-full px-3 py-2 text-xl text-slate-400 transition hover:bg-slate-100"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {actionError && (
                <div className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  {actionError}
                </div>
              )}

              {/* 예약 정보 */}
              <div className="rounded-xl bg-pink-50/60 p-5">
                <h3 className="mb-4 font-semibold text-slate-700">
                  예약 정보
                </h3>

                <div className="space-y-4 text-sm">
                  <DetailRow
                    label="예약 구분"
                    value={getAppointmentTypeLabel(
                      selectedAppointment.created_by_type
                    )}
                  />

                  <DetailRow
                    label="예약일시"
                    value={formatDateTime(
                      selectedAppointment.scheduled_at
                    )}
                  />

                  <DetailRow
                    label="예약 상태"
                    value={getAppointmentStatusLabel(
                      selectedAppointment.appointment_status
                    )}
                  />

                  <DetailRow
                    label="담당 의사"
                    value={
                      selectedAppointment.doctor_name ??
                      "-"
                    }
                  />

                  <DetailRow
                    label="진료과"
                    value="호흡기내과"
                  />

                  {selectedAppointment.confirmed_at && (
                    <DetailRow
                      label="확정 시각"
                      value={formatDateTime(
                        selectedAppointment.confirmed_at
                      )}
                    />
                  )}
                </div>
              </div>

              {/* 환자 정보 */}
              <div className="mt-5 rounded-xl border border-slate-100 p-5">
                <h3 className="font-semibold text-slate-700">
                  환자 정보
                </h3>

                <div className="mt-4 space-y-4 text-sm">
                  <DetailRow
                    label="환자번호"
                    value={
                      selectedAppointment.patient_code
                    }
                  />

                  <DetailRow
                    label="환자명"
                    value={
                      selectedAppointment.patient_name
                    }
                  />
                </div>
              </div>

              {/* 취소 정보 */}
              {selectedAppointment.appointment_status ===
                "CANCELLED" && (
                <div className="mt-5 rounded-xl border border-slate-100 p-5">
                  <h3 className="font-semibold text-slate-700">
                    취소 정보
                  </h3>

                  <div className="mt-4 space-y-4 text-sm">
                    <DetailRow
                      label="취소 시각"
                      value={formatDateTime(
                        selectedAppointment.cancelled_at
                      )}
                    />

                    <DetailRow
                      label="취소 사유"
                      value={
                        selectedAppointment.cancellation_reason ??
                        "-"
                      }
                    />
                  </div>
                </div>
              )}

              {/* 취소 사유 입력 */}
              {isCancelMode && (
                <div className="mt-5 rounded-xl border border-pink-100 bg-pink-50/40 p-5">
                  <h3 className="font-semibold text-slate-700">
                    예약 취소
                  </h3>

                  <p className="mt-1 text-sm text-slate-400">
                    취소 사유를 입력해주세요.
                  </p>

                  <textarea
                    value={cancellationReason}
                    onChange={(e) =>
                      setCancellationReason(
                        e.target.value
                      )
                    }
                    placeholder="예: 환자 일정 변경 요청"
                    rows={4}
                    className="mt-4 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-pink-300"
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 p-5">
              {isCancelMode ? (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={closeCancelMode}
                    disabled={actionLoading}
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    돌아가기
                  </button>

                  <button
                    type="button"
                    onClick={
                      handleCancelAppointment
                    }
                    disabled={actionLoading}
                    className="flex-1 rounded-xl bg-pink-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-pink-600 disabled:opacity-50"
                  >
                    {actionLoading
                      ? "취소 처리 중..."
                      : "취소 확정"}
                  </button>
                </div>
              ) : selectedAppointment.appointment_status ===
                "REQUESTED" ? (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={openCancelMode}
                    disabled={actionLoading}
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    예약 취소
                  </button>

                  <button
                    type="button"
                    onClick={
                      handleConfirmAppointment
                    }
                    disabled={actionLoading}
                    className="flex-1 rounded-xl bg-pink-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-pink-600 disabled:opacity-50"
                  >
                    {actionLoading
                      ? "확정 중..."
                      : "예약 확정"}
                  </button>
                </div>
              ) : selectedAppointment.appointment_status ===
                "CONFIRMED" ? (
                <button
                  type="button"
                  onClick={openCancelMode}
                  disabled={actionLoading}
                  className="w-full rounded-xl border border-pink-200 px-4 py-3 text-sm font-medium text-pink-600 transition hover:bg-pink-50 disabled:opacity-50"
                >
                  예약 취소
                </button>
              ) : (
                <div className="w-full rounded-xl bg-slate-50 px-4 py-3 text-center text-sm text-slate-400">
                  취소된 예약입니다.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex justify-between gap-6">
      <span className="text-slate-400">
        {label}
      </span>

      <span className="text-right font-medium text-slate-700">
        {value}
      </span>
    </div>
  );
}

function getAppointmentStatusLabel(
  status: string
) {
  if (status === "REQUESTED") {
    return "승인 대기";
  }

  if (status === "CONFIRMED") {
    return "예약 확정";
  }

  if (status === "CANCELLED") {
    return "예약 취소";
  }

  return status;
}

function getAppointmentRequestTypeLabel(
  requestType: AppointmentRequest["request_type"]
) {
  if (requestType === "CHANGE") {
    return "예약 변경 요청";
  }

  return "예약 취소 요청";
}

function getAppointmentRequestStatusLabel(
  requestStatus: AppointmentRequest["status"]
) {
  if (requestStatus === "PENDING") {
    return "요청중";
  }

  if (requestStatus === "APPROVED") {
    return "승인";
  }

  return "반려";
}

function getShortStatusLabel(status: string) {
  if (status === "REQUESTED") {
    return "대기";
  }

  if (status === "CONFIRMED") {
    return "확정";
  }

  return status;
}

function getAppointmentTypeLabel(
  type: string
) {
  if (type === "PATIENT") {
    return "상담 예약";
  }

  if (type === "DOCTOR_ORDER") {
    return "검사 예약";
  }

  return type;
}

function getScheduleCellClass(
  status: string,
  past: boolean
) {
  if (status === "REQUESTED") {
    return past
      ? "border-l-pink-200 border-pink-100 bg-pink-50/40 text-pink-300"
      : "border-l-pink-300 border-pink-200 bg-pink-50/70 text-pink-700";
  }

  return past
    ? "border-l-pink-200 border-pink-100 bg-pink-50/40 text-slate-500"
    : "border-l-pink-300 border-pink-200 bg-pink-50/70 text-slate-700";
}

function formatDateTime(
  value: string | null
) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDate(date: Date) {
  return `${date.getFullYear()}.${String(
    date.getMonth() + 1
  ).padStart(2, "0")}.${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function formatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getMonday(date: Date) {
  const result = new Date(date);

  const day = result.getDay();

  const diff =
    result.getDate() -
    day +
    (day === 0 ? -6 : 1);

  result.setDate(diff);
  result.setHours(0, 0, 0, 0);

  return result;
}

function addDays(
  date: Date,
  days: number
) {
  const result = new Date(date);

  result.setDate(result.getDate() + days);

  return result;
}

function isSameDate(
  first: Date,
  second: Date
) {
  return (
    first.getFullYear() ===
      second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function getTimeValue(date: Date) {
  return `${String(date.getHours()).padStart(
    2,
    "0"
  )}:${String(date.getMinutes()).padStart(
    2,
    "0"
  )}`;
}

function formatWeekRange(
  start: Date,
  end: Date
) {
  return `${start.getFullYear()}. ${String(
    start.getMonth() + 1
  ).padStart(2, "0")}. ${String(
    start.getDate()
  ).padStart(2, "0")} ~ ${String(
    end.getMonth() + 1
  ).padStart(2, "0")}. ${String(
    end.getDate()
  ).padStart(2, "0")}`;
}

function isPastSlot(
  date: Date,
  time: string
) {
  const [hour, minute] = time
    .split(":")
    .map(Number);

  const slot = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    minute
  );

  return slot.getTime() < Date.now();
}

function getMonthCalendarDates(
  month: Date
) {
  const firstDay = new Date(
    month.getFullYear(),
    month.getMonth(),
    1
  );

  const lastDay = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0
  );

  const start = getMonday(firstDay);

  const endMonday = getMonday(lastDay);

  const end = addDays(endMonday, 6);

  const dates: Date[] = [];

  let current = new Date(start);

  while (current <= end) {
    dates.push(new Date(current));
    current = addDays(current, 1);
  }

  return dates;
}

async function getApiErrorMessage(
  response: Response,
  fallback: string
) {
  try {
    const errorData = await response.json();

    const firstError =
      Object.values(errorData)[0];

    if (Array.isArray(firstError)) {
      return String(firstError[0]);
    }

    if (typeof firstError === "string") {
      return firstError;
    }

    return fallback;
  } catch {
    return fallback;
  }
}
