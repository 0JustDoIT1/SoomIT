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
  visit_status: string;
  checked_in_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
};

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [createdByFilter, setCreatedByFilter] = useState("ALL");

  // 취소 관련
  const [isCancelMode, setIsCancelMode] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [actionError, setActionError] = useState("");

  // 예약 목록 조회
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
    fetchAppointments();
  }, []);

  // 예약 상세 조회
  const fetchAppointmentDetail = async (appointmentId: string) => {
    const response = await fetch(
      `http://127.0.0.1:8000/api/appointments/${appointmentId}/`
    );

    if (!response.ok) {
      throw new Error("예약 상세 정보를 불러오지 못했습니다.");
    }

    return response.json();
  };

  const openAppointmentDetail = async (appointmentId: string) => {
    try {
      setDetailLoading(true);
      setActionError("");
      setIsCancelMode(false);
      setCancellationReason("");

      const data = await fetchAppointmentDetail(appointmentId);
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

  // 예약 확정
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

      const updatedAppointment = await fetchAppointmentDetail(
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

  // 취소 입력창 열기
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

  // 예약 취소
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
            cancellation_reason: cancellationReason.trim(),
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

      const updatedAppointment = await fetchAppointmentDetail(
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

  const getAppointmentStatusLabel = (status: string) => {
    if (status === "REQUESTED") return "예약 요청";
    if (status === "CONFIRMED") return "예약 확정";
    if (status === "CANCELLED") return "예약 취소";

    return status;
  };

  const getCreatedByTypeLabel = (type: string) => {
    if (type === "PATIENT") return "환자 요청";
    if (type === "DOCTOR_ORDER") return "의사 오더";

    return type;
  };

  const getVisitStatusLabel = (status: string) => {
    if (status === "SCHEDULED") return "방문 예정";
    if (status === "VISITED") return "방문 완료";
    if (status === "NO_SHOW") return "미방문";

    return status;
  };

  const formatDateTime = (value: string | null) => {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filteredAppointments = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return appointments.filter((appointment) => {
      const matchesSearch =
        keyword === "" ||
        appointment.patient_name.toLowerCase().includes(keyword) ||
        appointment.patient_code.toLowerCase().includes(keyword);

      const matchesStatus =
        statusFilter === "ALL" ||
        appointment.appointment_status === statusFilter;

      const matchesCreatedBy =
        createdByFilter === "ALL" ||
        appointment.created_by_type === createdByFilter;

      return matchesSearch && matchesStatus && matchesCreatedBy;
    });
  }, [
    appointments,
    searchTerm,
    statusFilter,
    createdByFilter,
  ]);

  const resetFilters = () => {
    setSearchTerm("");
    setStatusFilter("ALL");
    setCreatedByFilter("ALL");
  };

  return (
    <div>
      {/* 페이지 상단 */}
      <div className="mb-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-800">
                예약 관리
              </h1>

              <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-500">
                총 {appointments.length}건
              </span>
            </div>

            <p className="mt-2 text-sm text-slate-500">
              예약 요청을 확인하고 상태를 관리합니다.
            </p>
          </div>
        </div>

        {/* 검색 / 필터 */}
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <div className="min-w-[260px] flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="환자명, 환자번호 검색"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-pink-300 focus:bg-white"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 outline-none focus:border-pink-300"
          >
            <option value="ALL">예약 상태 전체</option>
            <option value="REQUESTED">예약 요청</option>
            <option value="CONFIRMED">예약 확정</option>
            <option value="CANCELLED">예약 취소</option>
          </select>

          <select
            value={createdByFilter}
            onChange={(e) => setCreatedByFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 outline-none focus:border-pink-300"
          >
            <option value="ALL">생성 주체 전체</option>
            <option value="PATIENT">환자 요청</option>
            <option value="DOCTOR_ORDER">의사 오더</option>
          </select>

          <button
            type="button"
            onClick={resetFilters}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-500 transition hover:bg-slate-50"
          >
            초기화
          </button>
        </div>
      </div>

      {/* 로딩 */}
      {loading && (
        <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
          예약 정보를 불러오는 중입니다.
        </div>
      )}

      {/* 오류 */}
      {error && (
        <div className="rounded-2xl bg-red-50 p-6 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* 예약 목록 */}
      {!loading && !error && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-sm font-semibold text-slate-700">
              예약 목록
            </p>

            <p className="mt-1 text-xs text-slate-400">
              검색 결과 {filteredAppointments.length}건
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="bg-pink-50/70 text-sm text-slate-600">
                <tr>
                  <th className="px-5 py-4 font-semibold">예약일시</th>
                  <th className="px-5 py-4 font-semibold">환자명</th>
                  <th className="px-5 py-4 font-semibold">환자번호</th>
                  <th className="px-5 py-4 font-semibold">Case ID</th>
                  <th className="px-5 py-4 font-semibold">생성 주체</th>
                  <th className="px-5 py-4 font-semibold">예약 상태</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredAppointments.map((appointment) => (
                  <tr
                    key={appointment.id}
                    onClick={() =>
                      openAppointmentDetail(appointment.id)
                    }
                    className="cursor-pointer text-sm text-slate-700 transition hover:bg-pink-50/40"
                  >
                    <td className="px-5 py-4 font-medium text-slate-700">
                      {formatDateTime(appointment.scheduled_at)}
                    </td>

                    <td className="px-5 py-4 font-semibold text-slate-800">
                      {appointment.patient_name}
                    </td>

                    <td className="px-5 py-4">
                      {appointment.patient_code}
                    </td>

                    <td className="px-5 py-4">
                      {appointment.case_code ?? "-"}
                    </td>

                    <td className="px-5 py-4">
                      <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                        {getCreatedByTypeLabel(
                          appointment.created_by_type
                        )}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                        {getAppointmentStatusLabel(
                          appointment.appointment_status
                        )}
                      </span>
                    </td>
                  </tr>
                ))}

                {filteredAppointments.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-12 text-center text-sm text-slate-400"
                    >
                      검색 조건에 해당하는 예약이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 상세 로딩 */}
      {detailLoading && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/10">
          <div className="rounded-2xl bg-white px-6 py-4 text-sm text-slate-600 shadow-lg">
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
                  <p className="text-sm font-medium text-pink-500">
                    Appointment Detail
                  </p>

                  <h2 className="mt-1 text-xl font-bold text-slate-800">
                    {selectedAppointment.patient_name}
                  </h2>

                  <p className="mt-1 text-sm text-slate-400">
                    {selectedAppointment.patient_code}
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

              <div className="rounded-2xl bg-pink-50/70 p-5">
                <h3 className="mb-4 font-semibold text-slate-700">
                  예약 정보
                </h3>

                <div className="space-y-4 text-sm">
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
                    label="생성 주체"
                    value={getCreatedByTypeLabel(
                      selectedAppointment.created_by_type
                    )}
                  />

                  <DetailRow
                    label="담당 의료진"
                    value={selectedAppointment.doctor_name ?? "-"}
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

              <div className="mt-5 rounded-2xl border border-slate-100 p-5">
                <h3 className="font-semibold text-slate-700">
                  환자 / Case
                </h3>

                <div className="mt-4 space-y-4 text-sm">
                  <DetailRow
                    label="환자번호"
                    value={selectedAppointment.patient_code}
                  />

                  <DetailRow
                    label="환자명"
                    value={selectedAppointment.patient_name}
                  />

                  <DetailRow
                    label="Case ID"
                    value={selectedAppointment.case_code ?? "-"}
                  />
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-100 p-5">
                <h3 className="font-semibold text-slate-700">
                  방문 정보
                </h3>

                <div className="mt-4 space-y-4 text-sm">
                  <DetailRow
                    label="방문 상태"
                    value={getVisitStatusLabel(
                      selectedAppointment.visit_status
                    )}
                  />

                  <DetailRow
                    label="체크인 시각"
                    value={formatDateTime(
                      selectedAppointment.checked_in_at
                    )}
                  />
                </div>
              </div>

              {selectedAppointment.appointment_status ===
                "CANCELLED" && (
                <div className="mt-5 rounded-2xl border border-slate-100 p-5">
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
                <div className="mt-5 rounded-2xl border border-pink-100 bg-pink-50/40 p-5">
                  <h3 className="font-semibold text-slate-700">
                    예약 취소
                  </h3>

                  <p className="mt-1 text-sm text-slate-400">
                    취소 사유를 입력해주세요.
                  </p>

                  <textarea
                    value={cancellationReason}
                    onChange={(e) =>
                      setCancellationReason(e.target.value)
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
                    onClick={handleCancelAppointment}
                    disabled={actionLoading}
                    className="flex-1 rounded-xl bg-pink-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-pink-600 disabled:opacity-50"
                  >
                    {actionLoading ? "취소 처리 중..." : "취소 확정"}
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
                    onClick={handleConfirmAppointment}
                    disabled={actionLoading}
                    className="flex-1 rounded-xl bg-pink-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-pink-600 disabled:opacity-50"
                  >
                    {actionLoading ? "확정 중..." : "예약 확정"}
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
      <span className="text-slate-400">{label}</span>

      <span className="text-right font-medium text-slate-700">
        {value}
      </span>
    </div>
  );
}

async function getApiErrorMessage(
  response: Response,
  fallback: string
) {
  try {
    const errorData = await response.json();
    const firstError = Object.values(errorData)[0];

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