"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import CaseSelectionRequired from "../CaseSelectionRequired";

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

type TreatmentDecision = {
  clinical_result: string;
  treatment_type: string | null;
  treatment_type_label: string | null;
  selected_regimen: string | null;
  selected_regimen_detail: RegimenDetail | null;
  treatment_plan: string | null;
  targeted_therapy_plan: string | null;
  rationale: string | null;
};

type PrescriptionItem = {
  id: string;
  drug: string;
  drug_name: string;
  ingredient_name: string;
  standard_dose: string | number | null;
  dose_basis: string;
  dose_basis_label: string;
  patient_bsa: string | number | null;
  target_auc: string | number | null;
  renal_value: string | number | null;
  calculated_dose: string | number | null;
  final_dose: string | number | null;
  unit: string | null;
  route: string;
  route_label: string;
  administration_day: string | null;
  frequency: string | null;
  instructions: string | null;
};

type SafetyResult = {
  id: string;
  prescription_item: string | null;
  check_type: string;
  check_type_label: string;
  result: "PASS" | "WARNING" | "BLOCK";
  result_label: string;
  message: string;
  source: string | null;
  source_code: string | null;
  checked_at: string;
  acknowledged_by_user: string | null;
  acknowledged_at: string | null;
  acknowledgment_note: string | null;
};

type Prescription = {
  id: string;
  case: string;
  treatment_decision: string;
  regimen: string;
  regimen_detail: RegimenDetail;
  cycle_number: number;
  phase: string;
  phase_label: string;
  cycle_start_date: string;
  prescription_status: string;
  prescription_status_label: string;
  prescribed_by_user: string | null;
  prescribed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  items: PrescriptionItem[];
  safety_check_results: SafetyResult[];
  created_at: string;
  updated_at: string;
};

export default function RespiratoryPrescriptionsPage() {
  const searchParams = useSearchParams();
  const caseId = searchParams.get("caseId");

  const [decision, setDecision] = useState<TreatmentDecision | null>(null);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);

  const [cycleNumber, setCycleNumber] = useState("1");
  const [phase, setPhase] = useState("INDUCTION");
  const [cycleStartDate, setCycleStartDate] = useState("");

  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = async () => {
    if (!caseId) return;

    try {
      setLoading(true);
      setError("");

      const token = await getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [decisionResponse, prescriptionResponse] = await Promise.all([
        fetch(
          `http://127.0.0.1:8000/api/doctor/cases/${caseId}/treatment-decision/`,
          { headers }
        ),
        fetch(
          `http://127.0.0.1:8000/api/doctor/cases/${caseId}/prescriptions/`,
          { headers }
        ),
      ]);

      if (decisionResponse.ok) {
        setDecision(await decisionResponse.json());
      } else if (decisionResponse.status === 404) {
        setDecision(null);
      } else {
        throw new Error("치료 결정 정보를 불러오지 못했습니다.");
      }

      if (!prescriptionResponse.ok) {
        throw new Error("처방 목록을 불러오지 못했습니다.");
      }

      setPrescriptions(await prescriptionResponse.json());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "처방 정보를 불러오는 중 오류가 발생했습니다."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [caseId]);

  const handleCreatePrescription = async () => {
    if (!caseId) return;

    try {
      setWorking(true);
      setError("");
      setMessage("");

      const token = await getAccessToken();

      const response = await fetch(
        `http://127.0.0.1:8000/api/doctor/cases/${caseId}/prescriptions/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            cycle_number: Number(cycleNumber),
            phase,
            cycle_start_date: cycleStartDate || null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "처방 생성에 실패했습니다.");
      }

      setMessage("처방 DRAFT가 생성되었습니다.");
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "처방 생성에 실패했습니다."
      );
    } finally {
      setWorking(false);
    }
  };

  const handleItemUpdate = async (
    prescriptionId: string,
    itemId: string,
    finalDose: string,
    instructions: string
  ) => {
    if (!caseId) return;

    try {
      setWorking(true);
      setError("");
      setMessage("");

      const token = await getAccessToken();

      const response = await fetch(
        `http://127.0.0.1:8000/api/doctor/cases/${caseId}/prescriptions/${prescriptionId}/items/${itemId}/`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            final_dose: finalDose,
            instructions,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "처방 약물 수정에 실패했습니다.");
      }

      setMessage("처방 약물 정보가 수정되었습니다.");
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "처방 약물 수정에 실패했습니다."
      );
    } finally {
      setWorking(false);
    }
  };

  const handleSafetyCheck = async (prescriptionId: string) => {
    if (!caseId) return;

    try {
      setWorking(true);
      setError("");
      setMessage("");

      const token = await getAccessToken();

      const response = await fetch(
        `http://127.0.0.1:8000/api/doctor/cases/${caseId}/prescriptions/${prescriptionId}/safety-check/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Safety Check에 실패했습니다.");
      }

      setMessage("Safety Check가 완료되었습니다.");
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Safety Check에 실패했습니다."
      );
    } finally {
      setWorking(false);
    }
  };

  const handleAcknowledgeWarnings = async (prescriptionId: string) => {
    if (!caseId) return;

    const note = window.prompt(
      "WARNING 확인 사유를 입력하세요.",
      "담당의 검토 후 처방 진행"
    );

    if (note === null) return;

    try {
      setWorking(true);
      setError("");
      setMessage("");

      const token = await getAccessToken();

      const response = await fetch(
        `http://127.0.0.1:8000/api/doctor/cases/${caseId}/prescriptions/${prescriptionId}/warnings/acknowledge/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            acknowledgment_note: note,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "WARNING 확인 처리에 실패했습니다.");
      }

      setMessage("WARNING 확인이 완료되었습니다.");
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "WARNING 확인 처리에 실패했습니다."
      );
    } finally {
      setWorking(false);
    }
  };

  const handleFinalize = async (prescriptionId: string) => {
    if (!caseId) return;

    const confirmed = window.confirm(
      "이 처방을 최종 확정하시겠습니까?\n확정 후에는 일반 DRAFT 수정이 불가능합니다."
    );

    if (!confirmed) return;

    try {
      setWorking(true);
      setError("");
      setMessage("");

      const token = await getAccessToken();

      const response = await fetch(
        `http://127.0.0.1:8000/api/doctor/cases/${caseId}/prescriptions/${prescriptionId}/finalize/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "처방 최종 확정에 실패했습니다.");
      }

      setMessage("처방이 최종 확정되었습니다.");
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "처방 최종 확정에 실패했습니다."
      );
    } finally {
      setWorking(false);
    }
  };

  if (!caseId) {
    return (
      <CaseSelectionRequired
        title="처방 관리"
        description="처방을 확인하고 관리할 환자를 먼저 선택해주세요."
      />
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
        처방 정보를 불러오는 중입니다.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">처방 관리</h1>

        <p className="mt-2 text-sm text-slate-500">
          확정된 치료결정을 기준으로 처방 생성, 용량 검토, Safety Check 및
          최종 확정을 진행합니다.
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
        <h2 className="text-lg font-bold text-slate-800">확정 치료계획</h2>

        {decision?.selected_regimen_detail ? (
          <div className="mt-5 grid grid-cols-4 gap-3">
            <Info
              label="치료 유형"
              value={decision.treatment_type_label}
            />

            <Info
              label="Regimen"
              value={decision.selected_regimen_detail.regimen_name}
            />

            <Info
              label="Cycle 간격"
              value={
                decision.selected_regimen_detail.cycle_length_days
                  ? `${decision.selected_regimen_detail.cycle_length_days}일`
                  : "-"
              }
            />

            <Info
              label="Induction"
              value={
                decision.selected_regimen_detail.induction_cycles
                  ? `${decision.selected_regimen_detail.induction_cycles} Cycle`
                  : "-"
              }
            />
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-400">
            확정된 Regimen 정보가 없습니다.
          </p>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800">새 처방 생성</h2>

        <div className="mt-5 grid grid-cols-3 gap-4">
          <Field label="Cycle 번호">
            <input
              type="number"
              min="1"
              value={cycleNumber}
              onChange={(e) => setCycleNumber(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-300"
            />
          </Field>

          <Field label="Phase">
            <select
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-300"
            >
              <option value="INDUCTION">INDUCTION</option>
              <option value="MAINTENANCE">MAINTENANCE</option>
            </select>
          </Field>

          <Field label="Cycle 시작일">
            <input
              type="date"
              value={cycleStartDate}
              onChange={(e) => setCycleStartDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-300"
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            disabled={working || !decision?.selected_regimen}
            onClick={handleCreatePrescription}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            처방 DRAFT 생성
          </button>
        </div>
      </section>

      <div className="mt-6 space-y-6">
        {prescriptions.map((prescription) => (
          <PrescriptionCard
            key={prescription.id}
            prescription={prescription}
            working={working}
            onItemUpdate={handleItemUpdate}
            onSafetyCheck={handleSafetyCheck}
            onAcknowledge={handleAcknowledgeWarnings}
            onFinalize={handleFinalize}
          />
        ))}

        {prescriptions.length === 0 && (
          <div className="rounded-2xl border border-emerald-100 bg-white py-16 text-center text-sm text-slate-400 shadow-sm">
            생성된 처방이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

function PrescriptionCard({
  prescription,
  working,
  onItemUpdate,
  onSafetyCheck,
  onAcknowledge,
  onFinalize,
}: {
  prescription: Prescription;
  working: boolean;
  onItemUpdate: (
    prescriptionId: string,
    itemId: string,
    finalDose: string,
    instructions: string
  ) => Promise<void>;
  onSafetyCheck: (prescriptionId: string) => Promise<void>;
  onAcknowledge: (prescriptionId: string) => Promise<void>;
  onFinalize: (prescriptionId: string) => Promise<void>;
}) {
  const warnings = prescription.safety_check_results.filter(
    (item) => item.result === "WARNING"
  );

  const blocks = prescription.safety_check_results.filter(
    (item) => item.result === "BLOCK"
  );

  const unacknowledgedWarnings = warnings.filter(
    (item) => !item.acknowledged_at
  );

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">
            Cycle {prescription.cycle_number}
          </h2>

          <p className="mt-1 text-xs text-slate-400">
            {prescription.regimen_detail.regimen_name} ·{" "}
            {prescription.phase_label}
          </p>
        </div>

        <StatusBadge
          status={prescription.prescription_status}
          label={prescription.prescription_status_label}
        />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Info
          label="Cycle 시작일"
          value={prescription.cycle_start_date}
        />

        <Info
          label="Phase"
          value={prescription.phase_label}
        />

        <Info
          label="Safety 결과"
          value={
            prescription.safety_check_results.length
              ? `PASS ${
                  prescription.safety_check_results.filter(
                    (item) => item.result === "PASS"
                  ).length
                } / WARNING ${warnings.length} / BLOCK ${blocks.length}`
              : "미실행"
          }
        />
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-bold text-slate-700">처방 약물</h3>

        <div className="mt-3 space-y-3">
          {prescription.items.map((item) => (
            <PrescriptionItemRow
              key={item.id}
              item={item}
              prescriptionId={prescription.id}
              editable={prescription.prescription_status === "DRAFT"}
              working={working}
              onSave={onItemUpdate}
            />
          ))}

          {prescription.items.length === 0 && (
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-400">
              처방 약물 항목이 없습니다.
            </div>
          )}
        </div>
      </div>

      {prescription.safety_check_results.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-bold text-slate-700">
            Safety Check 결과
          </h3>

          <div className="mt-3 space-y-2">
            {prescription.safety_check_results.map((result) => (
              <div
                key={result.id}
                className={`rounded-xl border px-4 py-3 ${
                  result.result === "BLOCK"
                    ? "border-red-200 bg-red-50"
                    : result.result === "WARNING"
                    ? "border-amber-200 bg-amber-50"
                    : "border-emerald-100 bg-emerald-50/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      {result.check_type_label}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {result.message}
                    </p>
                  </div>

                  <SafetyBadge result={result.result} />
                </div>

                {result.acknowledged_at && (
                  <p className="mt-2 text-xs text-amber-700">
                    의료진 확인 완료
                    {result.acknowledgment_note
                      ? ` · ${result.acknowledgment_note}`
                      : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-end gap-3">
        {prescription.prescription_status === "DRAFT" && (
          <button
            type="button"
            disabled={working}
            onClick={() => onSafetyCheck(prescription.id)}
            className="rounded-xl border border-emerald-200 bg-white px-5 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            Safety Check
          </button>
        )}

        {prescription.prescription_status === "VALIDATED" &&
          unacknowledgedWarnings.length > 0 && (
            <button
              type="button"
              disabled={working}
              onClick={() => onAcknowledge(prescription.id)}
              className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              WARNING 확인
            </button>
          )}

        {prescription.prescription_status === "VALIDATED" && (
          <button
            type="button"
            disabled={
              working ||
              blocks.length > 0 ||
              unacknowledgedWarnings.length > 0
            }
            onClick={() => onFinalize(prescription.id)}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            최종 처방 확정
          </button>
        )}
      </div>
    </section>
  );
}

function PrescriptionItemRow({
  item,
  prescriptionId,
  editable,
  working,
  onSave,
}: {
  item: PrescriptionItem;
  prescriptionId: string;
  editable: boolean;
  working: boolean;
  onSave: (
    prescriptionId: string,
    itemId: string,
    finalDose: string,
    instructions: string
  ) => Promise<void>;
}) {
  const [finalDose, setFinalDose] = useState(
    item.final_dose !== null ? String(item.final_dose) : ""
  );

  const [instructions, setInstructions] = useState(
    item.instructions ?? ""
  );

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-bold text-slate-800">
            {item.drug_name}
          </p>

          <p className="mt-1 text-xs text-slate-400">
            {item.ingredient_name}
          </p>
        </div>

        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500">
          {item.route_label}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-3">
        <Info
          label="기준 용량"
          value={
            item.standard_dose !== null
              ? `${item.standard_dose} ${item.dose_basis_label}`
              : "-"
          }
        />

        <Info
          label="BSA"
          value={
            item.patient_bsa !== null
              ? `${item.patient_bsa} m²`
              : "-"
          }
        />

        <Info
          label="계산 용량"
          value={
            item.calculated_dose !== null
              ? `${item.calculated_dose} ${item.unit ?? ""}`
              : "-"
          }
        />

        <Info
          label="투여일"
          value={item.administration_day}
        />

        <Info label="빈도" value={item.frequency} />
      </div>

      <div className="mt-4 grid grid-cols-[180px_1fr_auto] gap-3">
        <div>
          <p className="mb-2 text-xs text-slate-400">최종 용량</p>

          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              disabled={!editable}
              value={finalDose}
              onChange={(e) => setFinalDose(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 disabled:bg-slate-100"
            />

            <span className="text-xs text-slate-500">
              {item.unit}
            </span>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs text-slate-400">투여 지시</p>

          <input
            type="text"
            disabled={!editable}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 disabled:bg-slate-100"
          />
        </div>

        <div className="flex items-end">
          {editable && (
            <button
              type="button"
              disabled={working || finalDose === ""}
              onClick={() =>
                onSave(
                  prescriptionId,
                  item.id,
                  finalDose,
                  instructions
                )
              }
              className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              수정
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  let className = "bg-slate-100 text-slate-600";

  if (status === "DRAFT") {
    className = "bg-slate-100 text-slate-600";
  }

  if (status === "VALIDATED") {
    className = "bg-sky-50 text-sky-700";
  }

  if (status === "FINAL") {
    className = "bg-emerald-100 text-emerald-700";
  }

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

function SafetyBadge({
  result,
}: {
  result: "PASS" | "WARNING" | "BLOCK";
}) {
  const className =
    result === "BLOCK"
      ? "bg-red-100 text-red-700"
      : result === "WARNING"
      ? "bg-amber-100 text-amber-700"
      : "bg-emerald-100 text-emerald-700";

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold ${className}`}
    >
      {result}
    </span>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <div className="rounded-xl bg-emerald-50/40 px-4 py-3">
      <p className="text-xs text-slate-400">{label}</p>

      <p className="mt-1 break-words text-sm font-semibold text-slate-700">
        {value === null || value === undefined || value === ""
          ? "-"
          : String(value)}
      </p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-slate-500">
        {label}
      </p>

      {children}
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