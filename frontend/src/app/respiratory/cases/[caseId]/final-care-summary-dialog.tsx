"use client";

import { useEffect, useMemo, useState } from "react";

import type { AuthorizedFetch } from "./treatment-prescription-types";

type SummaryPrescription = {
  id: string;
  cycle_number: number;
  phase_label?: string;
  prescription_status: string;
  finalized_at?: string | null;
  regimen_detail?: { regimen_name: string; regimen_code: string };
  items: Array<{
    id: string;
    drug_name: string;
    ingredient_name?: string | null;
    mfds_item_seq?: string | null;
    final_dose: string | number | null;
    unit: string | null;
    route: string;
    instructions?: string | null;
  }>;
  safety_check_results: Array<{
    id: string;
    check_type_label: string;
    result: "PASS" | "WARNING" | "BLOCK";
    message: string;
    acknowledged_at?: string | null;
    acknowledgment_note?: string | null;
  }>;
};

type LoadedSummary = {
  caseDetail: Record<string, unknown>;
  clinicalResults: Record<string, unknown>[];
  treatment: Record<string, unknown>;
  partial: boolean;
};

const EMPTY_SUMMARY: LoadedSummary = { caseDetail: {}, clinicalResults: [], treatment: {}, partial: false };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function display(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "-";
}

function resultFor(results: Record<string, unknown>[], stage: string) {
  return results.find((result) => result.workflow_stage === stage && result.result_status === "CONFIRMED")
    ?? results.find((result) => result.workflow_stage === stage);
}

export function FinalCareSummaryDialog({
  open,
  caseId,
  apiBaseUrl,
  authorizedFetch,
  prescription,
  onClose,
}: {
  open: boolean;
  caseId: string;
  apiBaseUrl: string;
  authorizedFetch: AuthorizedFetch;
  prescription: SummaryPrescription | null;
  onClose: () => void;
}) {
  const summaryIdentity = `${caseId}:${prescription?.id ?? "none"}`;
  const [loadedSummary, setLoadedSummary] = useState<LoadedSummary & { identity: string }>({ ...EMPTY_SUMMARY, identity: "" });
  const loading = open && loadedSummary.identity !== summaryIdentity;
  const summary = loadedSummary;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();

    void Promise.allSettled([
      authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/`, { signal: controller.signal }),
      authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/clinical-results/`, { signal: controller.signal }),
      authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/treatment-decision/`, { signal: controller.signal }),
    ]).then(async (requests) => {
      if (controller.signal.aborted) return;
      const payloads = await Promise.all(requests.map(async (request) => {
        if (request.status !== "fulfilled" || !request.value.ok) return null;
        return request.value.json().catch(() => null) as Promise<unknown>;
      }));
      if (controller.signal.aborted) return;
      setLoadedSummary({
        identity: summaryIdentity,
        caseDetail: record(payloads[0]),
        clinicalResults: Array.isArray(payloads[1]) ? payloads[1].map(record) : [],
        treatment: record(payloads[2]),
        partial: payloads.some((payload) => payload === null),
      });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      controller.abort();
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [apiBaseUrl, authorizedFetch, caseId, onClose, open, summaryIdentity]);

  const clinical = useMemo(() => {
    const tnm = record(record(resultFor(summary.clinicalResults, "PET_CT_TNM"))?.result_detail);
    const pathology = record(record(resultFor(summary.clinicalResults, "PATHOLOGY_GENE"))?.result_detail);
    const pdl1 = record(record(resultFor(summary.clinicalResults, "PDL1"))?.result_detail);
    const tnmDetail = record(tnm.tnm);
    const pathologyDetail = record(pathology.pathology);
    const pdl1Detail = record(pdl1.pdl1);
    const diagnosis = [pathologyDetail.histologic_type, pathologyDetail.subtype]
      .filter((value) => typeof value === "string" && value.trim())
      .join(" · ");
    const aiRange = typeof pdl1Detail.interpretation === "string"
      ? pdl1Detail.interpretation.match(/AI predicted TPS range:\s*(.+)$/i)?.[1]
      : undefined;
    const pdl1Summary = pdl1Detail.tps_percent !== undefined && pdl1Detail.tps_percent !== null
      ? `TPS ${display(pdl1Detail.tps_percent)}%`
      : typeof pdl1Detail.indeterminate_reason === "string" && pdl1Detail.indeterminate_reason.trim()
        ? `판정 불가 · ${pdl1Detail.indeterminate_reason.trim()}`
        : aiRange
          ? `확정 TPS 미입력 · AI 예측 TPS ${aiRange}`
          : "확정 TPS 미입력";
    return {
      diagnosis: diagnosis || display(pathologyDetail.diagnosis_summary),
      tnm: [tnmDetail.t_category, tnmDetail.n_category, tnmDetail.m_category].map(display).join(" / "),
      stage: display(tnmDetail.stage_group),
      pdl1: pdl1Summary,
    };
  }, [summary.clinicalResults]);

  if (!open || !prescription) return null;

  const patientName = display(summary.caseDetail.patient_name);
  const patientCode = display(summary.caseDetail.patient_code);
  const caseCode = display(summary.caseDetail.case_code);
  const regimen = prescription.regimen_detail;
  const safetyPassed = prescription.safety_check_results.every((result) => result.result !== "BLOCK" && (result.result !== "WARNING" || Boolean(result.acknowledged_at)));

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px] print:static print:block print:bg-white print:p-0" role="dialog" aria-modal="true" aria-labelledby="final-care-summary-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:max-h-none print:max-w-none print:rounded-none print:shadow-none">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-gradient-to-r from-emerald-50 via-white to-blue-50 px-6 py-5">
          <div>
            <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700">FINAL</span>
            <h2 id="final-care-summary-title" className="mt-2 text-xl font-bold text-slate-900">최종 진료 요약</h2>
            <p className="mt-1 text-xs text-slate-500">확정된 진단 근거와 치료·처방 내용을 마지막으로 확인합니다.</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-xl text-slate-400 hover:bg-white hover:text-slate-700 print:hidden" aria-label="최종 진료 요약 닫기">×</button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading && <p role="status" className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">진료 요약 정보를 불러오는 중입니다.</p>}
          {!loading && summary.partial && <p role="status" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">일부 진료 정보를 불러오지 못했습니다. 확정된 처방 내용은 정상적으로 표시됩니다.</p>}

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 text-xs sm:grid-cols-4">
            <SummaryCell label="환자" value={patientName} />
            <SummaryCell label="환자번호" value={patientCode} />
            <SummaryCell label="Case" value={caseCode} />
            <SummaryCell label="확정 시각" value={prescription.finalized_at ? new Date(prescription.finalized_at).toLocaleString("ko-KR") : "확정 완료"} />
          </dl>

          <SummarySection title="최종 진단 및 병기">
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryValue label="병리 진단" value={clinical.diagnosis} />
              <SummaryValue label="TNM / Stage" value={`${clinical.tnm} · Stage ${clinical.stage}`} />
              <SummaryValue label="PD-L1" value={clinical.pdl1} />
              <SummaryValue label="담당의" value={display(summary.caseDetail.primary_doctor_name)} />
            </div>
          </SummarySection>

          <SummarySection title="확정 치료계획">
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryValue label="치료 유형" value={display(summary.treatment.treatment_type_label ?? summary.treatment.treatment_type)} />
              <SummaryValue label="Regimen" value={regimen ? `${regimen.regimen_code} · ${regimen.regimen_name}` : display(record(summary.treatment.selected_regimen_detail).regimen_name)} />
              <div className="sm:col-span-2"><SummaryValue label="치료 계획" value={display(summary.treatment.treatment_plan)} /></div>
            </div>
          </SummarySection>

          <SummarySection title={`최종 처방 · Cycle ${prescription.cycle_number}`}>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              {prescription.items.map((item) => (
                <div key={item.id} className="grid gap-1 border-b border-slate-100 px-3 py-2.5 text-xs last:border-b-0 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]">
                  <p className="font-semibold text-slate-800">{item.drug_name}<span className="ml-1 font-normal text-slate-400">{item.ingredient_name}</span></p>
                  <p className="text-slate-600">{display(item.final_dose)}{item.unit ?? ""} · {item.route}</p>
                  <p className="text-slate-500">{item.instructions || "-"}</p>
                  {item.mfds_item_seq && <p className="text-[10px] text-slate-400 sm:col-span-3">MFDS ITEM_SEQ {item.mfds_item_seq}</p>}
                </div>
              ))}
            </div>
          </SummarySection>

          <SummarySection title="Safety Check">
            <div className={`rounded-xl border px-4 py-3 text-xs ${safetyPassed ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              <p className="font-bold">{safetyPassed ? "최종 안전성 검토 완료" : "안전성 검토 기록 확인 필요"}</p>
              <p className="mt-1">PASS {prescription.safety_check_results.filter((result) => result.result === "PASS").length}건 · WARNING {prescription.safety_check_results.filter((result) => result.result === "WARNING").length}건 · BLOCK {prescription.safety_check_results.filter((result) => result.result === "BLOCK").length}건</p>
              {prescription.safety_check_results.filter((result) => result.result === "WARNING").map((result) => <p key={result.id} className="mt-1">{result.check_type_label}: {result.acknowledgment_note || result.message}</p>)}
            </div>
          </SummarySection>
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 print:hidden">
          <button type="button" onClick={() => window.print()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">인쇄</button>
          <button type="button" onClick={onClose} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700">확인하고 닫기</button>
        </footer>
      </section>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return <div className="bg-white px-3 py-2.5"><dt className="text-[10px] font-semibold text-slate-400">{label}</dt><dd className="mt-1 truncate font-semibold text-slate-700">{value}</dd></div>;
}

function SummarySection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-5"><h3 className="mb-2 text-sm font-bold text-slate-900">{title}</h3>{children}</section>;
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 px-3 py-2.5"><p className="text-[10px] font-semibold text-slate-400">{label}</p><p className="mt-1 text-xs font-semibold text-slate-700">{value}</p></div>;
}
