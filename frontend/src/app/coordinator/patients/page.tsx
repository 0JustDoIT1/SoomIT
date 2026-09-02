"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Patient = {
  id: string;
  patient_code: string;
  name: string;
  birth_date: string;
  sex: string;
  phone_number: string;
  address: string | null;
  created_at: string;
  updated_at: string;
};

type PatientCreateForm = {
  patient_code: string;
  name: string;
  birth_date: string;
  sex: string;
  phone_number: string;
  address: string;
};

type PatientUpdateForm = {
  name: string;
  birth_date: string;
  sex: string;
  phone_number: string;
  address: string;
};

const initialCreateForm: PatientCreateForm = {
  patient_code: "",
  name: "",
  birth_date: "",
  sex: "FEMALE",
  phone_number: "",
  address: "",
};

const initialUpdateForm: PatientUpdateForm = {
  name: "",
  birth_date: "",
  sex: "FEMALE",
  phone_number: "",
  address: "",
};

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [sexFilter, setSexFilter] = useState("ALL");

  // 신규 등록
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] =
    useState<PatientCreateForm>(initialCreateForm);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  // 환자정보 수정
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const [updateForm, setUpdateForm] =
    useState<PatientUpdateForm>(initialUpdateForm);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState("");

  // 환자 목록 조회
  const fetchPatients = async () => {
    try {
      setError("");

      const response = await fetch(
        "http://127.0.0.1:8000/api/patients/"
      );

      if (!response.ok) {
        throw new Error("환자 목록을 불러오지 못했습니다.");
      }

      const data = await response.json();
      setPatients(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "환자 목록 조회 중 오류가 발생했습니다."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  // 환자 상세 조회
  const fetchPatientDetail = async (patientId: string) => {
    const response = await fetch(
      `http://127.0.0.1:8000/api/patients/${patientId}/`
    );

    if (!response.ok) {
      throw new Error("환자 상세 정보를 불러오지 못했습니다.");
    }

    return response.json();
  };

  const openPatientDetail = async (patientId: string) => {
    try {
      setDetailLoading(true);

      const data = await fetchPatientDetail(patientId);

      setSelectedPatient(data);
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "환자 상세 조회 중 오류가 발생했습니다."
      );
    } finally {
      setDetailLoading(false);
    }
  };

  // 신규 환자 등록 Drawer
  const openCreateDrawer = () => {
    setSelectedPatient(null);
    setIsUpdateOpen(false);

    setCreateError("");
    setCreateForm(initialCreateForm);
    setIsCreateOpen(true);
  };

  const closeCreateDrawer = () => {
    if (createLoading) return;

    setIsCreateOpen(false);
    setCreateError("");
    setCreateForm(initialCreateForm);
  };

  // 신규 환자 등록
  const handleCreatePatient = async (
    e: FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    if (
      !createForm.patient_code.trim() ||
      !createForm.name.trim() ||
      !createForm.birth_date ||
      !createForm.sex ||
      !createForm.phone_number.trim() ||
      !createForm.address.trim()
    ) {
      setCreateError("모든 필수 정보를 입력해주세요.");
      return;
    }

    try {
      setCreateLoading(true);
      setCreateError("");

      const response = await fetch(
        "http://127.0.0.1:8000/api/patients/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            patient_code: createForm.patient_code.trim(),
            name: createForm.name.trim(),
            birth_date: createForm.birth_date,
            sex: createForm.sex,
            phone_number: createForm.phone_number.trim(),
            address: createForm.address.trim(),
          }),
        }
      );

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          "환자 등록에 실패했습니다."
        );

        throw new Error(message);
      }

      await fetchPatients();

      setIsCreateOpen(false);
      setCreateForm(initialCreateForm);
    } catch (err) {
      setCreateError(
        err instanceof Error
          ? err.message
          : "환자 등록 중 오류가 발생했습니다."
      );
    } finally {
      setCreateLoading(false);
    }
  };

  // 수정 Drawer 열기
  const openUpdateDrawer = () => {
    if (!selectedPatient) return;

    setUpdateError("");

    setUpdateForm({
      name: selectedPatient.name,
      birth_date: selectedPatient.birth_date,
      sex: selectedPatient.sex,
      phone_number: selectedPatient.phone_number,
      address: selectedPatient.address ?? "",
    });

    setIsUpdateOpen(true);
  };

  const closeUpdateDrawer = () => {
    if (updateLoading) return;

    setIsUpdateOpen(false);
    setUpdateError("");
  };

  // 환자정보 수정
  const handleUpdatePatient = async (
    e: FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    if (!selectedPatient) return;

    if (
      !updateForm.name.trim() ||
      !updateForm.birth_date ||
      !updateForm.sex ||
      !updateForm.phone_number.trim() ||
      !updateForm.address.trim()
    ) {
      setUpdateError("모든 필수 정보를 입력해주세요.");
      return;
    }

    try {
      setUpdateLoading(true);
      setUpdateError("");

      const response = await fetch(
        `http://127.0.0.1:8000/api/patients/${selectedPatient.id}/`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: updateForm.name.trim(),
            birth_date: updateForm.birth_date,
            sex: updateForm.sex,
            phone_number: updateForm.phone_number.trim(),
            address: updateForm.address.trim(),
          }),
        }
      );

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          "환자정보 수정에 실패했습니다."
        );

        throw new Error(message);
      }

      // 목록 다시 조회
      await fetchPatients();

      // 상세정보 다시 조회
      const updatedPatient = await fetchPatientDetail(
        selectedPatient.id
      );

      setSelectedPatient(updatedPatient);
      setIsUpdateOpen(false);
    } catch (err) {
      setUpdateError(
        err instanceof Error
          ? err.message
          : "환자정보 수정 중 오류가 발생했습니다."
      );
    } finally {
      setUpdateLoading(false);
    }
  };

  // 성별 표시
  const getSexLabel = (sex: string) => {
    if (sex === "FEMALE") return "여";
    if (sex === "MALE") return "남";
    if (sex === "OTHER") return "기타";
    if (sex === "UNKNOWN") return "미상";

    return sex;
  };

  // 검색 + 성별 필터
  const filteredPatients = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return patients.filter((patient) => {
      const matchesSearch =
        keyword === "" ||
        patient.name.toLowerCase().includes(keyword) ||
        patient.patient_code.toLowerCase().includes(keyword) ||
        patient.phone_number.includes(keyword);

      const matchesSex =
        sexFilter === "ALL" || patient.sex === sexFilter;

      return matchesSearch && matchesSex;
    });
  }, [patients, searchTerm, sexFilter]);

  const resetFilters = () => {
    setSearchTerm("");
    setSexFilter("ALL");
  };

  return (
    <div>
      {/* 페이지 상단 */}
      <div className="mb-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-800">
                환자 관리
              </h1>

              <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-500">
                총 {patients.length}명
              </span>
            </div>

            <p className="mt-2 text-sm text-slate-500">
              환자의 기본정보와 Case 연결 현황을 관리합니다.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreateDrawer}
            className="rounded-xl bg-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-pink-600"
          >
            + 신규 환자 등록
          </button>
        </div>

        {/* 검색 / 필터 */}
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="환자명, 환자번호, 연락처 검색"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-pink-300 focus:bg-white"
            />
          </div>

          <select
            value={sexFilter}
            onChange={(e) => setSexFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 outline-none focus:border-pink-300"
          >
            <option value="ALL">성별 전체</option>
            <option value="FEMALE">여</option>
            <option value="MALE">남</option>
            <option value="OTHER">기타</option>
            <option value="UNKNOWN">미상</option>
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
          환자 정보를 불러오는 중입니다.
        </div>
      )}

      {/* 오류 */}
      {error && (
        <div className="rounded-2xl bg-red-50 p-6 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* 환자 목록 */}
      {!loading && !error && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-sm font-semibold text-slate-700">
              환자 목록
            </p>

            <p className="mt-1 text-xs text-slate-400">
              검색 결과 {filteredPatients.length}명
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left">
              <thead className="bg-pink-50/70 text-sm text-slate-600">
                <tr>
                  <th className="px-5 py-4 font-semibold">환자번호</th>
                  <th className="px-5 py-4 font-semibold">이름</th>
                  <th className="px-5 py-4 font-semibold">생년월일</th>
                  <th className="px-5 py-4 font-semibold">성별</th>
                  <th className="px-5 py-4 font-semibold">연락처</th>
                  <th className="px-5 py-4 font-semibold">주소</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredPatients.map((patient) => (
                  <tr
                    key={patient.id}
                    onClick={() => openPatientDetail(patient.id)}
                    className="cursor-pointer text-sm text-slate-700 transition hover:bg-pink-50/40"
                  >
                    <td className="px-5 py-4 font-medium text-slate-600">
                      {patient.patient_code}
                    </td>

                    <td className="px-5 py-4 font-semibold text-slate-800">
                      {patient.name}
                    </td>

                    <td className="px-5 py-4">
                      {patient.birth_date}
                    </td>

                    <td className="px-5 py-4">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                        {getSexLabel(patient.sex)}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      {patient.phone_number}
                    </td>

                    <td className="max-w-[260px] truncate px-5 py-4">
                      {patient.address ?? "-"}
                    </td>
                  </tr>
                ))}

                {filteredPatients.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-12 text-center text-sm text-slate-400"
                    >
                      검색 조건에 해당하는 환자가 없습니다.
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
            환자 정보를 불러오는 중입니다.
          </div>
        </div>
      )}

      {/* 공통 배경 */}
      {(selectedPatient || isCreateOpen || isUpdateOpen) && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => {
            if (isUpdateOpen) {
              closeUpdateDrawer();
              return;
            }

            if (isCreateOpen) {
              closeCreateDrawer();
              return;
            }

            setSelectedPatient(null);
          }}
        />
      )}

      {/* 신규 등록 Drawer */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-[440px] bg-white shadow-2xl transition-transform duration-300 ${
          isCreateOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {isCreateOpen && (
          <form
            onSubmit={handleCreatePatient}
            className="flex h-full flex-col"
          >
            <DrawerHeader
              eyebrow="New Patient"
              title="신규 환자 등록"
              description="환자의 기본정보를 입력해주세요."
              onClose={closeCreateDrawer}
            />

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {createError && (
                <ErrorMessage message={createError} />
              )}

              <div className="space-y-5">
                <FormField label="환자번호" required>
                  <input
                    type="text"
                    value={createForm.patient_code}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        patient_code: e.target.value,
                      })
                    }
                    placeholder="예: P0003"
                    className={inputClassName}
                  />
                </FormField>

                <FormField label="이름" required>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        name: e.target.value,
                      })
                    }
                    placeholder="환자 이름"
                    className={inputClassName}
                  />
                </FormField>

                <FormField label="생년월일" required>
                  <input
                    type="date"
                    value={createForm.birth_date}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        birth_date: e.target.value,
                      })
                    }
                    className={inputClassName}
                  />
                </FormField>

                <FormField label="성별" required>
                  <select
                    value={createForm.sex}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        sex: e.target.value,
                      })
                    }
                    className={inputClassName}
                  >
                    <option value="FEMALE">여</option>
                    <option value="MALE">남</option>
                    <option value="OTHER">기타</option>
                    <option value="UNKNOWN">미상</option>
                  </select>
                </FormField>

                <FormField label="연락처" required>
                  <input
                    type="text"
                    value={createForm.phone_number}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        phone_number: e.target.value,
                      })
                    }
                    placeholder="예: 010-1234-5678"
                    className={inputClassName}
                  />
                </FormField>

                <FormField label="주소" required>
                  <input
                    type="text"
                    value={createForm.address}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        address: e.target.value,
                      })
                    }
                    placeholder="환자 주소"
                    className={inputClassName}
                  />
                </FormField>
              </div>
            </div>

            <DrawerFooter
              cancelLabel="취소"
              submitLabel={
                createLoading ? "등록 중..." : "환자 등록"
              }
              loading={createLoading}
              onCancel={closeCreateDrawer}
            />
          </form>
        )}
      </div>

      {/* 환자 상세 Drawer */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-[420px] bg-white shadow-2xl transition-transform duration-300 ${
          selectedPatient && !isUpdateOpen
            ? "translate-x-0"
            : "translate-x-full"
        }`}
      >
        {selectedPatient && !isUpdateOpen && (
          <div className="flex h-full flex-col">
            <DrawerHeader
              eyebrow="Patient Detail"
              title={selectedPatient.name}
              description={selectedPatient.patient_code}
              onClose={() => setSelectedPatient(null)}
            />

            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="rounded-2xl bg-pink-50/70 p-5">
                <h3 className="mb-4 font-semibold text-slate-700">
                  기본 정보
                </h3>

                <div className="space-y-4 text-sm">
                  <DetailRow
                    label="환자번호"
                    value={selectedPatient.patient_code}
                  />

                  <DetailRow
                    label="이름"
                    value={selectedPatient.name}
                  />

                  <DetailRow
                    label="생년월일"
                    value={selectedPatient.birth_date}
                  />

                  <DetailRow
                    label="성별"
                    value={getSexLabel(selectedPatient.sex)}
                  />

                  <DetailRow
                    label="연락처"
                    value={selectedPatient.phone_number}
                  />

                  <DetailRow
                    label="주소"
                    value={selectedPatient.address ?? "-"}
                  />
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-100 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-700">
                    앱 연결 상태
                  </h3>

                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                    연동 예정
                  </span>
                </div>

                <p className="mt-3 text-sm text-slate-400">
                  환자 앱 계정 연결 정보는 추후 API와 연동합니다.
                </p>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-100 p-5">
                <h3 className="font-semibold text-slate-700">
                  Case 정보
                </h3>

                <p className="mt-3 text-sm text-slate-400">
                  연결된 Case 정보는 다음 단계에서 연동합니다.
                </p>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-100 p-5">
                <h3 className="font-semibold text-slate-700">
                  최근 예약
                </h3>

                <p className="mt-3 text-sm text-slate-400">
                  예약 정보는 다음 단계에서 연동합니다.
                </p>
              </div>
            </div>

            <div className="flex gap-3 border-t border-slate-100 p-5">
              <button
                type="button"
                onClick={openUpdateDrawer}
                className="flex-1 rounded-xl border border-pink-200 px-4 py-3 text-sm font-medium text-pink-600 transition hover:bg-pink-50"
              >
                환자정보 수정
              </button>

              <button
                type="button"
                className="flex-1 rounded-xl bg-pink-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-pink-600"
              >
                Case 상세
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 환자정보 수정 Drawer */}
      <div
        className={`fixed right-0 top-0 z-[60] h-full w-[440px] bg-white shadow-2xl transition-transform duration-300 ${
          isUpdateOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {isUpdateOpen && selectedPatient && (
          <form
            onSubmit={handleUpdatePatient}
            className="flex h-full flex-col"
          >
            <DrawerHeader
              eyebrow="Edit Patient"
              title="환자정보 수정"
              description={`${selectedPatient.name} · ${selectedPatient.patient_code}`}
              onClose={closeUpdateDrawer}
            />

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {updateError && (
                <ErrorMessage message={updateError} />
              )}

              {/* 환자번호는 수정 불가 */}
              <div className="mb-5 rounded-2xl bg-slate-50 p-4">
                <p className="text-xs text-slate-400">
                  환자번호
                </p>

                <p className="mt-1 text-sm font-semibold text-slate-700">
                  {selectedPatient.patient_code}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  환자번호는 수정할 수 없습니다.
                </p>
              </div>

              <div className="space-y-5">
                <FormField label="이름" required>
                  <input
                    type="text"
                    value={updateForm.name}
                    onChange={(e) =>
                      setUpdateForm({
                        ...updateForm,
                        name: e.target.value,
                      })
                    }
                    className={inputClassName}
                  />
                </FormField>

                <FormField label="생년월일" required>
                  <input
                    type="date"
                    value={updateForm.birth_date}
                    onChange={(e) =>
                      setUpdateForm({
                        ...updateForm,
                        birth_date: e.target.value,
                      })
                    }
                    className={inputClassName}
                  />
                </FormField>

                <FormField label="성별" required>
                  <select
                    value={updateForm.sex}
                    onChange={(e) =>
                      setUpdateForm({
                        ...updateForm,
                        sex: e.target.value,
                      })
                    }
                    className={inputClassName}
                  >
                    <option value="FEMALE">여</option>
                    <option value="MALE">남</option>
                    <option value="OTHER">기타</option>
                    <option value="UNKNOWN">미상</option>
                  </select>
                </FormField>

                <FormField label="연락처" required>
                  <input
                    type="text"
                    value={updateForm.phone_number}
                    onChange={(e) =>
                      setUpdateForm({
                        ...updateForm,
                        phone_number: e.target.value,
                      })
                    }
                    className={inputClassName}
                  />
                </FormField>

                <FormField label="주소" required>
                  <input
                    type="text"
                    value={updateForm.address}
                    onChange={(e) =>
                      setUpdateForm({
                        ...updateForm,
                        address: e.target.value,
                      })
                    }
                    className={inputClassName}
                  />
                </FormField>
              </div>
            </div>

            <DrawerFooter
              cancelLabel="취소"
              submitLabel={
                updateLoading ? "저장 중..." : "변경사항 저장"
              }
              loading={updateLoading}
              onCancel={closeUpdateDrawer}
            />
          </form>
        )}
      </div>
    </div>
  );
}

const inputClassName =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-pink-300";

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

function FormField({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        {label}

        {required && (
          <span className="ml-1 text-pink-500">*</span>
        )}
      </label>

      {children}
    </div>
  );
}

function DrawerHeader({
  eyebrow,
  title,
  description,
  onClose,
}: {
  eyebrow: string;
  title: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <div className="border-b border-slate-100 px-6 py-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-pink-500">
            {eyebrow}
          </p>

          <h2 className="mt-1 text-xl font-bold text-slate-800">
            {title}
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            {description}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-3 py-2 text-xl text-slate-400 transition hover:bg-slate-100"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function DrawerFooter({
  cancelLabel,
  submitLabel,
  loading,
  onCancel,
}: {
  cancelLabel: string;
  submitLabel: string;
  loading: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex gap-3 border-t border-slate-100 p-5">
      <button
        type="button"
        onClick={onCancel}
        disabled={loading}
        className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {cancelLabel}
      </button>

      <button
        type="submit"
        disabled={loading}
        className="flex-1 rounded-xl bg-pink-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </div>
  );
}

function ErrorMessage({
  message,
}: {
  message: string;
}) {
  return (
    <div className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
      {message}
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