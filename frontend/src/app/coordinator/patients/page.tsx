"use client";

import { useEffect, useState } from "react";

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

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const response = await fetch("http://127.0.0.1:8000/api/patients/");

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

    fetchPatients();
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">환자 관리</h1>
        <p className="mt-1 text-sm text-slate-500">
          등록된 환자의 기본 정보를 조회합니다.
        </p>
      </div>

      {loading && (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          환자 정보를 불러오는 중입니다.
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-red-50 p-6 text-red-600">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-pink-50 text-sm text-slate-600">
              <tr>
                <th className="px-5 py-4">환자번호</th>
                <th className="px-5 py-4">이름</th>
                <th className="px-5 py-4">생년월일</th>
                <th className="px-5 py-4">성별</th>
                <th className="px-5 py-4">연락처</th>
                <th className="px-5 py-4">주소</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {patients.map((patient) => (
                <tr
                  key={patient.id}
                  className="text-sm text-slate-700 hover:bg-slate-50"
                >
                  <td className="px-5 py-4">{patient.patient_code}</td>
                  <td className="px-5 py-4 font-medium">{patient.name}</td>
                  <td className="px-5 py-4">{patient.birth_date}</td>
                  <td className="px-5 py-4">
                    {patient.sex === "FEMALE"
                      ? "여"
                      : patient.sex === "MALE"
                      ? "남"
                      : patient.sex}
                  </td>
                  <td className="px-5 py-4">{patient.phone_number}</td>
                  <td className="px-5 py-4">{patient.address ?? "-"}</td>
                </tr>
              ))}

              {patients.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-sm text-slate-400"
                  >
                    등록된 환자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
