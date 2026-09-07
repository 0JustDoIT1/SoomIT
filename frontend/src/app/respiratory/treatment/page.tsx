"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type RegimenDetail = {
  id: string;
  regimen_code: string;
  regimen_name: string;
  cancer_type: string;
  histology: string | null;
  treatment_line: string | null;
  cycle_length_days: number | null;
  induction_cycles: number | null;
  maintenance_yn: boolean;
  source: string | null;
  source_version: string | null;
};

type RegimenCandidate = {
  id: string;
  rule_code: string;
  cancer_type: string;
  histology: string | null;
  stage_condition: Record<string, unknown>;
  biomarker_condition: Record<string, unknown>;
  pdl1_condition: Record<string, unknown>;
  ecog_condition: Record<string, unknown>;
  treatment_line: string | null;
  priority: number;
  evidence_source: string | null;
  regimen: string;
  regimen_detail: RegimenDetail;
  match_reasons: string[];
};

type TreatmentDecision = {
  clinical_result: string;
  ai_recommendation_action: string | null;
  ai_recommendation_action_label: string | null;
  treatment_type: string | null;
  treatment_type_label: string | null;
  selected_regimen: string | null;
  selected_regimen_detail: RegimenDetail | null;
  treatment_plan: string | null;
  targeted_therapy_plan: string | null;
  rationale: string | null;
};

type FormState = {
  treatment_type: string;
  selected_regimen: string;
  treatment_plan: string;
  targeted_therapy_plan: string;
  rationale: string;
};

const initialForm: FormState = {
  treatment_type: "",
  selected_regimen: "",
  treatment_plan: "",
  targeted_therapy_plan: "",
  rationale: "",
};

export default function RespiratoryTreatmentPage() {
  const searchParams = useSearchParams();
  const caseId = searchParams.get("caseId");

  const [candidates, setCandidates] = useState<RegimenCandidate[]>([]);
  const [decision, setDecision] = useState<TreatmentDecision | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!caseId) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");
        setMessage("");

        const token = await getAccessToken();

        const [candidateResponse, decisionResponse] = await Promise.all([
          fetch(
            `http://127.0.0.1:8000/api/doctor/cases/${caseId}/regimen-candidates/`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          ),
          fetch(
            `http://127.0.0.1:8000/api/doctor/cases/${caseId}/treatment-decision/`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          ),
        ]);

        if (!candidateResponse.ok) {
          throw new Error("Regimen 후보를 불러오지 못했습니다.");
        }

        const candidateData = await candidateResponse.json();
        setCandidates(candidateData);

        if (decisionResponse.ok) {
          const decisionData = await decisionResponse.json();

          setDecision(decisionData);

          setForm({
            treatment_type: decisionData.treatment_type ?? "",
            selected_regimen: decisionData.selected_regimen ?? "",
            treatment_plan: decisionData.treatment_plan ?? "",
            targeted_therapy_plan:
              decisionData.targeted_therapy_plan ?? "",
            rationale: decisionData.rationale ?? "",
          });
        } else if (decisionResponse.status === 404) {
          setDecision(null);
          setForm(initialForm);
        } else {
          throw new Error("치료 결정 정보를 불러오지 못했습니다.");
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "치료 결정 조회 중 오류가 발생했습니다."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [caseId]);

  const selectedCandidate = useMemo(() => {
    return candidates.find(
      (item) => item.regimen_detail.id === form.selected_regimen
    );
  }, [candidates, form.selected_regimen]);

  const handleSelectCandidate = (candidate: RegimenCandidate) => {
    setForm((prev) => ({
      ...prev,
      selected_regimen: candidate.regimen_detail.id,
    }));
  };

  const handleSave = async () => {
    if (!caseId) return;

    try {
      setSaving(true);
      setError("");
      setMessage("");

      const token = await getAccessToken();

      const response = await fetch(
        `http://127.0.0.1:8000/api/doctor/cases/${caseId}/treatment-decision/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            treatment_type: form.treatment_type || null,
            selected_regimen: form.selected_regimen || null,
            treatment_plan: form.treatment_plan || null,
            targeted_therapy_plan:
              form.targeted_therapy_plan || null,
            rationale: form.rationale || null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "치료 결정 저장 중 오류가 발생했습니다."
        );
      }

      setDecision(data);

      setForm({
        treatment_type: data.treatment_type ?? "",
        selected_regimen: data.selected_regimen ?? "",
        treatment_plan: data.treatment_plan ?? "",
        targeted_therapy_plan:
          data.targeted_therapy_plan ?? "",
        rationale: data.rationale ?? "",
      });

      setMessage("치료 결정 DRAFT가 저장되었습니다.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "치료 결정 저장 중 오류가 발생했습니다."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!caseId) return;

    try {
      setConfirming(true);
      setError("");
      setMessage("");

      const token = await getAccessToken();

      const response = await fetch(
        `http://127.0.0.1:8000/api/doctor/cases/${caseId}/treatment-decision/confirm/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "치료 결정 확정 중 오류가 발생했습니다."
        );
      }

      setDecision(data);
      setMessage(
        "치료 결정이 확정되었습니다. Case가 처방 단계로 진행됩니다."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "치료 결정 확정 중 오류가 발생했습니다."
      );
    } finally {
      setConfirming(false);
    }
  };

  if (!caseId) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-800">
          치료 결정
        </h1>

        <p className="mt-3 text-sm text-slate-500">
          담당 Case에서 환자를 선택한 뒤 치료 결정을 진행해주세요.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
        치료 결정 정보를 불러오는 중입니다.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">
          치료 결정
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          환자의 확정 임상 결과를 기준으로 Regimen 후보를 검토하고
          최종 치료방침을 결정합니다.
        </p>
      </div>

      {error && (
        <div className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {message && (
        <div className="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {message}
        </div>
      )}

      <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-slate-800">
            Regimen 후보
          </h2>

          <p className="mt-1 text-xs text-slate-400">
            병리, TNM, 유전자, PD-L1 조건에 맞는 치료 후보입니다.
          </p>
        </div>

        <div className="space-y-4">
          {candidates.map((candidate) => {
            const selected =
              form.selected_regimen === candidate.regimen_detail.id;

            return (
              <button
                key={candidate.id}
                type="button"
                onClick={() => handleSelectCandidate(candidate)}
                className={`w-full rounded-2xl border p-5 text-left transition ${
                  selected
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/30"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-base font-bold text-slate-800">
                      {candidate.regimen_detail.regimen_name}
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      {candidate.regimen_detail.regimen_code}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      selected
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {selected ? "선택됨" : "선택"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-3">
                  <MiniInfo
                    label="암종"
                    value={candidate.regimen_detail.cancer_type}
                  />

                  <MiniInfo
                    label="조직형"
                    value={candidate.regimen_detail.histology}
                  />

                  <MiniInfo
                    label="치료 차수"
                    value={candidate.regimen_detail.treatment_line}
                  />

                  <MiniInfo
                    label="Cycle"
                    value={
                      candidate.regimen_detail.cycle_length_days
                        ? `${candidate.regimen_detail.cycle_length_days}일`
                        : "-"
                    }
                  />
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold text-slate-500">
                    매칭 근거
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {candidate.match_reasons.map((reason) => (
                      <span
                        key={reason}
                        className="rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-700"
                      >
                        {reason}
                      </span>
                    ))}

                    {candidate.match_reasons.length === 0 && (
                      <span className="text-xs text-slate-400">
                        표시할 매칭 근거가 없습니다.
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}

          {candidates.length === 0 && (
            <div className="rounded-xl bg-slate-50 py-10 text-center text-sm text-slate-400">
              현재 조건에 맞는 Regimen 후보가 없습니다.
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-slate-800">
            담당의 치료 결정
          </h2>

          <p className="mt-1 text-xs text-slate-400">
            Regimen 후보는 참고 정보이며 최종 치료결정은 담당의가
            확정합니다.
          </p>
        </div>

        {selectedCandidate && (
          <div className="mb-5 rounded-xl bg-emerald-50/60 px-4 py-3">
            <p className="text-xs text-emerald-600">
              선택 Regimen
            </p>

            <p className="mt-1 text-sm font-bold text-slate-800">
              {selectedCandidate.regimen_detail.regimen_name}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="치료 유형">
            <select
              value={form.treatment_type}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  treatment_type: event.target.value,
                }))
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-300"
            >
              <option value="">선택</option>
              <option value="CHEMOTHERAPY">항암화학요법</option>
              <option value="TARGETED_THERAPY">표적치료</option>
              <option value="IMMUNOTHERAPY">면역치료</option>
              <option value="COMBINATION">병합치료</option>
              <option value="RADIATION">방사선치료</option>
              <option value="SURGERY">수술</option>
              <option value="SUPPORTIVE_CARE">지지치료</option>
              <option value="OBSERVATION">관찰</option>
            </select>
          </Field>

          <Field label="선택 Regimen">
            <input
              type="text"
              value={
                selectedCandidate?.regimen_detail.regimen_name ??
                decision?.selected_regimen_detail?.regimen_name ??
                "선택 없음"
              }
              readOnly
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"
            />
          </Field>

          <Field label="치료 계획" wide>
            <textarea
              value={form.treatment_plan}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  treatment_plan: event.target.value,
                }))
              }
              rows={4}
              placeholder="최종 치료 계획을 입력하세요."
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-300"
            />
          </Field>

          <Field label="표적치료 계획" wide>
            <textarea
              value={form.targeted_therapy_plan}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  targeted_therapy_plan: event.target.value,
                }))
              }
              rows={3}
              placeholder="필요한 경우 표적치료 계획을 입력하세요."
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-300"
            />
          </Field>

          <Field label="치료 결정 근거" wide>
            <textarea
              value={form.rationale}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  rationale: event.target.value,
                }))
              }
              rows={4}
              placeholder="치료 결정 근거를 입력하세요."
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-300"
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || confirming}
            className="rounded-xl border border-emerald-200 bg-white px-5 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
          >
            {saving ? "저장 중..." : "DRAFT 저장"}
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={!decision || saving || confirming}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {confirming ? "확정 중..." : "최종 치료결정 확정"}
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <p className="mb-2 text-xs font-semibold text-slate-500">
        {label}
      </p>

      {children}
    </div>
  );
}

function MiniInfo({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3">
      <p className="text-[11px] text-slate-400">{label}</p>

      <p className="mt-1 text-sm font-semibold text-slate-700">
        {value === null || value === undefined || value === ""
          ? "-"
          : String(value)}
      </p>
    </div>
  );
}

async function getAccessToken() {
  const response = await fetch(
    "http://127.0.0.1:8000/api/auth/staff/login/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hospital_code: "SUMIT001",
        username: "doctor01",
        password: "test1234",
      }),
    }
  );

  if (!response.ok) {
    throw new Error("의료진 로그인에 실패했습니다.");
  }

  const data = await response.json();
  return data.access as string;
}