"use client";

import { useEffect, useMemo, useState } from "react";

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

const WEEK_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("WEEK");

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const [isCancelMode, setIsCancelMode] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");

  /*
   * 예약 목록 조회
   */
  const fetchAppointments = async () => {
    try {
      setError("");

      const response = await fetch(
        "http://127.0.0.1:8000/api/appointments/"
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

  useEffect(() => {
    // Initial data synchronization with the existing appointments API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAppointments();
  }, []);

  /*
   * 예약 상세 조회
   */
  const fetchAppointmentDetail = async (
    appointmentId: string
  ) => {
    const response = await fetch(
      `http://127.0.0.1:8000/api/appointments/${appointmentId}/`
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
      alert(
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

  /*
   * 예약 확정
   */
  const handleConfirmAppointment = async () => {
    if (!selectedAppointment) return;

    try {
      setActionLoading(true);
      setActionError("");

      const response = await fetch(
        `http://127.0.0.1:8000/api/appointments/${selectedAppointment.id}/confirm/`,
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

      const response = await fetch(
        `http://127.0.0.1:8000/api/appointments/${selectedAppointment.id}/cancel/`,
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
  const doctors = useMemo(() => {
    const appointmentDoctors = appointments
      .map((appointment) => appointment.doctor_name)
      .filter(
        (doctor): doctor is string =>
          Boolean(doctor)
      );

    return Array.from(
      new Set(appointmentDoctors)
    ).slice(0, 5);
  }, [appointments]);

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
  const getSlotAppointment = (
    doctor: string,
    date: Date,
    time: string
  ) => {
    return appointments.find((appointment) => {
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
          상담 및 검사 예약 일정과 승인 요청을 관리합니다.
        </p>
      </div>

      {/* 2차 탭 */}
      <div className="border-b border-slate-200">
        <div className="flex h-11 items-end gap-8">
          <button
            type="button"
            onClick={() => setViewMode("WEEK")}
            className={`relative h-full px-0.5 text-sm font-semibold ${
              viewMode === "WEEK"
                ? "text-slate-900"
                : "text-slate-400 hover:text-slate-700"
            }`}
          >
            주간 예약

            {viewMode === "WEEK" && (
              <span className="absolute bottom-0 left-0 h-[2px] w-full bg-pink-400" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setViewMode("MONTH")}
            className={`relative h-full px-0.5 text-sm font-semibold ${
              viewMode === "MONTH"
                ? "text-slate-900"
                : "text-slate-400 hover:text-slate-700"
            }`}
          >
            월간 예약

            {viewMode === "MONTH" && (
              <span className="absolute bottom-0 left-0 h-[2px] w-full bg-pink-400" />
            )}
          </button>
        </div>
      </div>

      {/* 승인 대기 */}
      {!loading &&
        !error &&
        requestedAppointments.length > 0 && (
          <section className="mt-6">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-700">
                승인 대기
              </h2>

              <span className="text-xs font-semibold text-pink-500">
                {requestedAppointments.length}
              </span>
            </div>

            <div className="divide-y divide-slate-100 border-y border-slate-200 bg-white">
              {requestedAppointments.map(
                (appointment) => (
                  <button
                    key={appointment.id}
                    type="button"
                    onClick={() =>
                      openAppointmentDetail(
                        appointment.id
                      )
                    }
                    className="grid w-full grid-cols-[120px_160px_150px_1fr_90px] items-center gap-5 px-4 py-3 text-left transition hover:bg-pink-50/30"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {appointment.patient_name}
                      </p>

                      <p className="mt-0.5 text-xs text-slate-400">
                        {appointment.patient_code}
                      </p>
                    </div>

                    <div className="text-sm text-slate-600">
                      {formatDateTime(
                        appointment.scheduled_at
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {appointment.doctor_name ??
                          "담당 의사 미정"}
                      </p>

                      <p className="mt-0.5 text-xs text-slate-400">
                        호흡기내과
                      </p>
                    </div>

                    <div>
                      <span className="text-xs font-medium text-slate-500">
                        {getAppointmentTypeLabel(
                          appointment.created_by_type
                        )}
                      </span>
                    </div>

                    <div className="text-right text-xs font-semibold text-pink-500">
                      승인 대기
                    </div>
                  </button>
                )
              )}
            </div>
          </section>
        )}

      {/* 로딩 */}
      {loading && (
        <div className="mt-6 border border-slate-200 bg-white p-8 text-sm text-slate-500">
          예약 정보를 불러오는 중입니다.
        </div>
      )}

      {/* 오류 */}
      {error && (
        <div className="mt-6 border border-red-100 bg-red-50 p-6 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* 주간 예약 */}
      {!loading &&
        !error &&
        viewMode === "WEEK" && (
          <section className="mt-7">
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
                  {formatWeekRange(
                    weekStart,
                    weekEnd
                  )}
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
            <div className="mt-5 grid grid-cols-7 border-y border-slate-200 bg-white">
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
                    className={`relative px-3 py-3 text-center transition ${
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
                      {dayAppointments.length > 0
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
            <div className="mt-5 overflow-x-auto border-y border-slate-200 bg-white">
              <table className="w-full min-w-[1100px] table-fixed text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    <th className="w-[90px] px-4 py-3 text-xs font-semibold text-slate-500">
                      시간
                    </th>

                    {doctors.map((doctor) => (
                      <th
                        key={doctor}
                        className="px-4 py-3 text-center"
                      >
                        <p className="text-sm font-semibold text-slate-700">
                          {doctor}
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
                      <td className="px-4 py-3 text-sm font-medium text-slate-500">
                        {time}
                      </td>

                      {doctors.map((doctor) => {
                        const appointment =
                          getSlotAppointment(
                            doctor,
                            selectedDate,
                            time
                          );

                        const past = isPastSlot(
                          selectedDate,
                          time
                        );

                        if (appointment) {
                          return (
                            <td
                              key={`${doctor}-${time}`}
                              className="border-l border-slate-100 px-2 py-2"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  openAppointmentDetail(
                                    appointment.id
                                  )
                                }
                                className={`w-full rounded-lg border px-3 py-2 text-left transition hover:shadow-sm ${getScheduleCellClass(
                                  appointment.appointment_status,
                                  past
                                )}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate text-xs font-semibold">
                                    {
                                      appointment.patient_name
                                    }
                                  </span>

                                  <span className="shrink-0 text-[10px]">
                                    {getShortStatusLabel(
                                      appointment.appointment_status
                                    )}
                                  </span>
                                </div>

                                <p className="mt-1 truncate text-[10px] opacity-70">
                                  {getAppointmentTypeLabel(
                                    appointment.created_by_type
                                  )}
                                </p>
                              </button>
                            </td>
                          );
                        }

                        return (
                          <td
                            key={`${doctor}-${time}`}
                            className="border-l border-slate-100 px-2 py-2"
                          >
                            <div
                              className={`flex min-h-[50px] items-center justify-center rounded-lg text-xs ${
                                past
                                  ? "bg-slate-50 text-slate-300"
                                  : "border border-dashed border-slate-200 text-slate-400"
                              }`}
                            >
                              {past
                                ? "X"
                                : "예약 가능"}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

      {/* 월간 예약 */}
      {!loading &&
        !error &&
        viewMode === "MONTH" && (
          <section className="mt-7 grid items-start gap-5 xl:grid-cols-[minmax(0,63fr)_minmax(300px,37fr)]">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
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
                  {currentMonth.getFullYear()}년{" "}
                  {currentMonth.getMonth() + 1}월
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
                    className="border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-center text-[11px] font-semibold text-slate-500 last:border-r-0"
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

                      {dayAppointments.length > 0 ? (
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
                  {formatDate(selectedDate)}
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  예약 {selectedDateAppointments.length}건
                </p>
              </div>

              {selectedDateAppointments.length > 0 ? (
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

      {/* 상세 로딩 */}
      {detailLoading && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/10">
          <div className="rounded-xl bg-white px-6 py-4 text-sm text-slate-600 shadow-lg">
            예약 정보를 불러오는 중입니다.
          </div>
        </div>
      )}

      {/* Drawer 배경 */}
      {selectedAppointment && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={closeAppointmentDetail}
        />
      )}

      {/* 예약 상세 Drawer */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-[440px] bg-white shadow-2xl transition-transform duration-300 ${
          selectedAppointment
            ? "translate-x-0"
            : "translate-x-full"
        }`}
      >
        {selectedAppointment && (
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
        )}
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
  if (past) {
    if (status === "REQUESTED") {
      return "border-pink-100 bg-pink-50/40 text-pink-300";
    }

    return "border-sky-100 bg-sky-50/40 text-slate-400";
  }

  if (status === "REQUESTED") {
    return "border-pink-200 bg-pink-50 text-pink-600";
  }

  return "border-sky-100 bg-sky-50/70 text-slate-700";
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
