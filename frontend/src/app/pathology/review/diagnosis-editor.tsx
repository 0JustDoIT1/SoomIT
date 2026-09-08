"use client";

import { useState } from "react";

import { PathologyStateMessage } from "../_components/pathology-state-message";
import {
  casePathologyDiagnosesApiUrl,
  pathologyDiagnosisApiUrl,
  pathologyDiagnosisConfirmApiUrl,
  readPathologyDiagnosis,
  type PathologyDiagnosis,
  type WorkItem,
} from "../_lib/pathology-api";

type DiagnosisEditorProps = {
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  diagnosis: PathologyDiagnosis | null;
  workItem: WorkItem;
  onChanged: (diagnosis: PathologyDiagnosis, action: "saved" | "confirmed") => void;
};

export function DiagnosisEditor({
  authorizedFetch,
  diagnosis,
  workItem,
  onChanged,
}: DiagnosisEditorProps) {
  const [malignancyStatus, setMalignancyStatus] = useState(
    diagnosis?.pathology?.malignancy_status ?? "INDETERMINATE",
  );
  const [histologicType, setHistologicType] = useState(
    diagnosis?.pathology?.histologic_type ?? "",
  );
  const [subtype, setSubtype] = useState(diagnosis?.pathology?.subtype ?? "");
  const [diagnosisSummary, setDiagnosisSummary] = useState(
    diagnosis?.pathology?.diagnosis_summary ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const isConfirmed = diagnosis?.result_status === "CONFIRMED";

  const body = JSON.stringify({
    malignancy_status: malignancyStatus,
    histologic_type: histologicType || null,
    subtype: subtype || null,
    diagnosis_summary: diagnosisSummary || null,
    ...(diagnosis ? {} : { work_item_id: workItem.id }),
  });

  async function saveDraft() {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await authorizedFetch(
        diagnosis
          ? pathologyDiagnosisApiUrl(diagnosis.id)
          : casePathologyDiagnosesApiUrl(workItem.case_id),
        {
          method: diagnosis ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body,
        },
      );
      const savedDiagnosis = await readPathologyDiagnosis(response);
      setMessage("판독 초안이 저장되었습니다.");
      onChanged(savedDiagnosis, "saved");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "판독 초안을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmDiagnosis() {
    if (!diagnosis || isConfirmed) return;
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await authorizedFetch(
        pathologyDiagnosisConfirmApiUrl(diagnosis.id),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ work_item_id: workItem.id }),
        },
      );
      const confirmedDiagnosis = await readPathologyDiagnosis(response);
      setMessage("병리 판독이 확정되었습니다.");
      onChanged(confirmedDiagnosis, "confirmed");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "병리 판독을 확정하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-5 border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">판독 입력</p>
        <span className="text-xs font-medium text-slate-500">
          {isConfirmed ? "확정됨" : diagnosis ? "초안 수정" : "새 초안"}
        </span>
      </div>

      <fieldset disabled={saving || isConfirmed} className="mt-4 space-y-4 disabled:opacity-70">
        <label className="block text-xs font-medium text-slate-600">
          악성 여부
          <select
            value={malignancyStatus}
            onChange={(event) => setMalignancyStatus(event.target.value)}
            className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="BENIGN">양성</option>
            <option value="MALIGNANT">악성</option>
            <option value="INDETERMINATE">판정불가</option>
          </select>
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-xs font-medium text-slate-600">
            조직형
            <input
              value={histologicType}
              onChange={(event) => setHistologicType(event.target.value)}
              className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            아형
            <input
              value={subtype}
              onChange={(event) => setSubtype(event.target.value)}
              className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>
        </div>
        <label className="block text-xs font-medium text-slate-600">
          진단 요약
          <textarea
            value={diagnosisSummary}
            onChange={(event) => setDiagnosisSummary(event.target.value)}
            rows={5}
            className="mt-2 block w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 text-slate-900"
          />
        </label>
      </fieldset>

      {error && <PathologyStateMessage variant="error" title={error} className="mt-4" />}
      {message && <PathologyStateMessage variant="info" title={message} className="mt-4" />}

      {!isConfirmed && (
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={saveDraft}
            disabled={saving}
            className="rounded-md border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
          >
            {saving ? "처리 중..." : diagnosis ? "초안 수정" : "초안 저장"}
          </button>
          {diagnosis && (
            <button
              type="button"
              onClick={confirmDiagnosis}
              disabled={saving}
              className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              판독 확정
            </button>
          )}
        </div>
      )}
    </div>
  );
}
