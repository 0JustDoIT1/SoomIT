"use client";

import { ThoraxIllustration, type ThoraxLesion } from "./thorax-illustration";
import styles from "./dashboard.module.css";
import type { DashboardCase, DashboardCaseSnapshot } from "./dashboard-work-queues";

export type DashboardFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Detection = { bbox_xyxy: number[]; class_name: string };
const labels: Record<string, string> = { XRAY: "흉부 X-ray", CT: "흉부 CT", PET_CT_TNM: "PET-CT / TNM", PATHOLOGY_GENE: "조직·유전자 · H&E", PDL1: "PD-L1", TREATMENT: "치료결정", PRESCRIPTION: "처방" };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const CT_LOBES = new Set<ThoraxLesion["lobe"]>(["RUL", "RML", "RLL", "LUL", "LLL"]);

/** Patient-specific markers come only from a clinician-confirmed CT result. */
export function confirmedCtLesions(snapshot?: DashboardCaseSnapshot): ThoraxLesion[] {
  const confirmedCt = snapshot?.clinicalResults.find(item => item.workflow_stage === "CT" && item.result_status === "CONFIRMED");
  const observations = record(record(confirmedCt?.result_detail).ct).nodule_observations;
  if (!Array.isArray(observations)) return [];
  return observations.flatMap((value, index) => {
    const item = record(value);
    const lobe = item.lobe;
    if (typeof lobe !== "string" || !CT_LOBES.has(lobe as ThoraxLesion["lobe"])) return [];
    const number = typeof item.nodule_no === "number" ? item.nodule_no : index + 1;
    const lobeLabel = typeof item.lobe_label === "string" && item.lobe_label.trim() ? item.lobe_label.trim() : lobe;
    const diameterMm = typeof item.max_diameter_mm === "number" && Number.isFinite(item.max_diameter_mm) && item.max_diameter_mm > 0 ? item.max_diameter_mm : undefined;
    return [{ id: `ct-nodule-${number}`, label: `결절 ${number} · ${lobeLabel}`, lobe: lobe as ThoraxLesion["lobe"], diameterMm }];
  });
}

/** A box is valid only for the exact source image and its original pixel dimensions. */
export function matchedDetections(analyses: unknown[], assetId: string) {
  const analysis = analyses.map(record).find(item => item.analysis_type === "XRAY_ANALYSIS" && item.status === "SUCCEEDED" && record(record(item.input_context).source_asset).id === assetId);
  const payload = record(record(analysis?.result_detail).result_payload);
  const image = record(payload.image);
  const width = image.width, height = image.height;
  if (typeof width !== "number" || typeof height !== "number" || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return {};
  const detections = (Array.isArray(payload.detections) ? payload.detections : []).map(record).filter(item => {
    const box = item.bbox_xyxy;
    return typeof item.class_name === "string" && Array.isArray(box) && box.length === 4 && box.every(n => typeof n === "number" && Number.isFinite(n)) && box[0] >= 0 && box[1] >= 0 && box[2] > box[0] && box[3] > box[1] && box[2] <= width && box[3] <= height;
  }) as Detection[];
  return { width, height, detections };
}

export function confirmedStageSummary(stage: string, snapshot?: DashboardCaseSnapshot) {
  const result = snapshot?.clinicalResults.find(item => item.workflow_stage === stage && item.result_status === "CONFIRMED");
  if (!result) return "";
  const root = record(result.result_detail);
  const section = record(root[stage === "PDL1" ? "pdl1" : stage === "PATHOLOGY_GENE" ? "pathology" : stage === "PET_CT_TNM" ? "tnm" : stage === "CT" ? "ct" : "xray"]);
  const keys = stage === "PDL1" ? ["tps_percent", "interpretation"] : stage === "PATHOLOGY_GENE" ? ["histologic_type", "subtype"] : stage === "PET_CT_TNM" ? ["t_category", "n_category", "m_category", "stage_group"] : ["assessment_label", "overall_assessment_label"];
  return keys.flatMap(key => {
    const value = section[key];
    if (typeof value !== "string" && typeof value !== "number") return [];
    return [key === "tps_percent" ? `TPS ${value}%` : String(value)];
  }).join(" · ");
}

export function DashboardStageEvidence({ caseItem, snapshot, status }: {
  caseItem: DashboardCase; snapshot?: DashboardCaseSnapshot; status: string; authorizedFetch: DashboardFetch;
}) {
  const stage = caseItem.current_stage;
  const summary = confirmedStageSummary(stage, snapshot);
  const lesions = confirmedCtLesions(snapshot);

  return (
    <section aria-label="현재 단계 검사 요약" className="flex min-h-[390px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">{labels[stage] ?? stage}</h3>
        <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">{status}</span>
      </header>
      <div data-testid="stage-evidence-visual" className={`${styles.evidenceVisual} relative flex min-h-[230px] flex-1 items-center justify-center overflow-hidden border-y border-slate-200 bg-[radial-gradient(circle_at_50%_42%,#ffffff_0%,#e8f1f5_58%,#dbe8ee_100%)]`}>
        <div className={`${styles.thoraxModel} h-[242px] w-[228px]`}><ThoraxIllustration lesions={lesions} stage={stage} /></div>
        {lesions.length > 0 && <div className="absolute left-3 top-3 rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-[10px] font-bold text-slate-700 shadow-sm backdrop-blur">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rose-500 align-middle" />
          CT 확정 병변 {lesions.length}곳
        </div>}
        {lesions.length > 0 && <div className="absolute inset-x-3 bottom-3 flex flex-wrap justify-center gap-1.5">
          {lesions.slice(0, 3).map((lesion, index) => <span key={lesion.id} className="rounded-full border border-slate-200 bg-white/92 px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm backdrop-blur">
            <span className="mr-1 text-rose-500">●</span>{index + 1}. {lesion.label.replace(/^결절 \d+ · /, "")}{lesion.diameterMm ? ` · ${lesion.diameterMm}mm` : ""}
          </span>)}
          {lesions.length > 3 && <span className="rounded-full border border-slate-200 bg-white/92 px-2 py-1 text-[10px] font-semibold text-slate-600">+{lesions.length - 3}</span>}
        </div>}
      </div>
      <div className="space-y-1.5 px-4 py-3 text-xs">
        <p className="font-semibold text-slate-800">{caseItem.patient_name || caseItem.patient_code} <span className="font-normal text-slate-500">· {caseItem.case_code}</span></p>
        {summary && <p className="font-medium text-teal-700">확정 결과 · {summary}</p>}
      </div>
    </section>
  );
}
