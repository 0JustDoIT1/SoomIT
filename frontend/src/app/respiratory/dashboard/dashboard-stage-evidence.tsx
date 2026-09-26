"use client";

import { useEffect, useState } from "react";
import { LoadingIndicator } from "@/components/common/loading-indicator";
import { API_BASE_URL } from "../_lib/respiratory-api";
import { ThoraxIllustration, type ThoraxLesion } from "./thorax-illustration";
import type { DashboardCase, DashboardCaseSnapshot } from "./dashboard-work-queues";

export type DashboardFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Asset = { id: string; workflow_stage: string; image_type: string; status: string; preview_url?: string; acquired_at?: string };
type Slide = { id: string; stain: string; status: string; slide_code: string };
type Detection = { bbox_xyxy: number[]; class_name: string };
type Preview = { url: string; caption: string; detections?: Detection[]; width?: number; height?: number };
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

export function DashboardStageEvidence({ caseItem, snapshot, status, authorizedFetch, onOpenCase }: {
  caseItem: DashboardCase; snapshot?: DashboardCaseSnapshot; status: string; authorizedFetch: DashboardFetch; onOpenCase: (id: string) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const stage = caseItem.current_stage;
  const summary = confirmedStageSummary(stage, snapshot);
  const lesions = confirmedCtLesions(snapshot);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    const request = (path: string) => authorizedFetch(`${API_BASE_URL}${path}`, { signal: controller.signal });
    const json = async <T,>(path: string): Promise<T[]> => {
      const response = await request(path);
      if (!response.ok) throw new Error("Unavailable evidence");
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error("Invalid evidence list");
      return data as T[];
    };
    const image = async (path: string, caption: string): Promise<Preview> => {
      // Only the existing authenticated API serves these images.
      const url = new URL(path, API_BASE_URL);
      if (url.origin !== new URL(API_BASE_URL).origin) throw new Error("Invalid evidence origin");
      const response = await authorizedFetch(url.href, { signal: controller.signal });
      if (!response.ok || !/^image\/(png|jpeg|webp)(;|$)/i.test(response.headers.get("content-type") ?? "")) throw new Error("Unavailable image");
      const blob = await response.blob();
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      objectUrl = URL.createObjectURL(blob);
      return { url: objectUrl, caption };
    };
    async function load(): Promise<Preview | null> {
      const base = `/api/doctor/cases/${encodeURIComponent(caseItem.id)}`;
      if (stage === "PATHOLOGY_GENE" || stage === "PDL1") {
        const specimens = await json<{ id: string }>(`${base}/specimens/`);
        for (const specimen of specimens) {
          const slides = await json<Slide>(`/api/doctor/cases/specimens/${encodeURIComponent(specimen.id)}/slides/`);
          const slide = slides.find(item => item.status === "READY" && item.stain === (stage === "PDL1" ? "PDL1" : "HE"));
          if (slide) return image(`/api/doctor/cases/slides/${encodeURIComponent(slide.id)}/thumbnail/`, `${stage === "PDL1" ? "PD-L1" : "H&E"} · ${slide.slide_code}`);
        }
        return null;
      }
      if (!["XRAY", "CT", "PET_CT_TNM"].includes(stage)) return null;
      const assets = await json<Asset>(`${base}/image-assets/`);
      const asset = assets.filter(item => item.workflow_stage === stage && item.status === "READY").sort((a, b) => (b.acquired_at ?? "").localeCompare(a.acquired_at ?? ""))[0];
      if (!asset) return null;
      if (stage === "XRAY") {
        if (!asset.preview_url) return null;
        const result = await image(asset.preview_url, "X-ray · 원본 미리보기");
        // Optional AI failure must not hide the available original image.
        const analyses = await json<unknown>(`${base}/ai-results/`).catch(() => []);
        return { ...result, ...matchedDetections(analyses, asset.id) };
      }
      const instances = await json<Record<string, { Value?: unknown[] }>>(`${base}/image-assets/${asset.id}/dicom-web/instances/`);
      const ordered = instances.filter(item => typeof item["00080018"]?.Value?.[0] === "string").sort((a, b) => Number(a["00200013"]?.Value?.[0] ?? 0) - Number(b["00200013"]?.Value?.[0] ?? 0));
      const uid = ordered[Math.floor(ordered.length / 2)]?.["00080018"]?.Value?.[0];
      if (typeof uid !== "string") return null;
      const response = await request(`${base}/image-assets/${asset.id}/dicom-web/instances/${encodeURIComponent(uid)}/`);
      if (!response.ok) throw new Error("Unavailable DICOM");
      const blob = await response.blob();
      if (controller.signal.aborted) return null;
      const { createDicomPreview } = await import("./dashboard-dicom-preview");
      const rendered = await createDicomPreview(blob, controller.signal);
      if (controller.signal.aborted) return null;
      objectUrl = URL.createObjectURL(rendered);
      return { url: objectUrl, caption: `${asset.image_type} · 중간 단면 ${Math.floor(ordered.length / 2) + 1}/${ordered.length} · 병변 대표 단면 아님` };
    }
    void load().then(result => { if (!controller.signal.aborted) { setPreview(result); setLoading(false); } }).catch(() => { if (!controller.signal.aborted) { setError(true); setLoading(false); } });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [authorizedFetch, caseItem.id, stage, retry]);

  return (
    <section aria-label="현재 단계 검사 요약" className="flex min-h-[390px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">{labels[stage] ?? stage}</h3>
        <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">{status}</span>
      </header>
      <button type="button" aria-label={`${labels[stage] ?? stage} 검사 상세 열기`} onClick={() => onOpenCase(caseItem.id)} className="group relative flex min-h-[230px] flex-1 items-center justify-center overflow-hidden border-y border-slate-200 bg-[radial-gradient(circle_at_50%_42%,#ffffff_0%,#eef5f8_62%,#e3edf2_100%)] transition hover:bg-blue-50">
        {preview ? <>
          {/* Authenticated blobs are rendered locally, without the image optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.url} alt={`${caseItem.patient_name || caseItem.patient_code} ${preview.caption}`} className="absolute inset-0 h-full w-full object-contain" onLoad={event => {
            if (preview.detections?.length && (event.currentTarget.naturalWidth !== preview.width || event.currentTarget.naturalHeight !== preview.height)) {
              setPreview({ ...preview, detections: [] });
            }
          }} onError={() => { setPreview(null); setError(true); }} />
          {Boolean(preview.detections?.length) && <svg viewBox={`0 0 ${preview.width} ${preview.height}`} preserveAspectRatio="xMidYMid meet" className="pointer-events-none absolute inset-0 h-full w-full" aria-label="AI 검출 후보 위치">
            {preview.detections!.map((item, index) => <rect key={index} x={item.bbox_xyxy[0]} y={item.bbox_xyxy[1]} width={item.bbox_xyxy[2] - item.bbox_xyxy[0]} height={item.bbox_xyxy[3] - item.bbox_xyxy[1]} fill="none" stroke="#fbbf24" strokeWidth="2" vectorEffect="non-scaling-stroke"><title>{item.class_name} · AI 검출 후보</title></rect>)}
          </svg>}
        </> : <div className="h-[236px] w-[222px] opacity-90 transition duration-300 group-hover:scale-[1.025]"><ThoraxIllustration lesions={lesions} stage={stage} /></div>}
        {!loading && lesions.length > 0 && <div className="absolute left-3 top-3 rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-[10px] font-bold text-slate-700 shadow-sm backdrop-blur">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rose-500 align-middle" />
          CT 확정 병변 {lesions.length}곳
        </div>}
        {!loading && lesions.length > 0 && <div className="absolute inset-x-3 bottom-3 flex flex-wrap justify-center gap-1.5">
          {lesions.slice(0, 3).map((lesion, index) => <span key={lesion.id} className="rounded-full border border-slate-200 bg-white/92 px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm backdrop-blur">
            <span className="mr-1 text-rose-500">●</span>{index + 1}. {lesion.label.replace(/^결절 \d+ · /, "")}{lesion.diameterMm ? ` · ${lesion.diameterMm}mm` : ""}
          </span>)}
          {lesions.length > 3 && <span className="rounded-full border border-slate-200 bg-white/92 px-2 py-1 text-[10px] font-semibold text-slate-600">+{lesions.length - 3}</span>}
        </div>}
        {loading && <LoadingIndicator label="검사 이미지 확인 중" className="absolute inset-x-3 bottom-3 min-h-0 text-xs" />}
      </button>
      <div className="space-y-1.5 px-4 py-3 text-xs">
        <p className="font-semibold text-slate-800">{caseItem.patient_name || caseItem.patient_code} <span className="font-normal text-slate-500">· {caseItem.case_code}</span></p>
        <p className="text-slate-500">{preview?.caption ?? (loading ? "현재 단계의 영상을 확인합니다." : error ? "미리보기를 불러오지 못했습니다. · 해부학 참고 그림" : "현재 단계 이미지 없음 · 해부학 참고 그림")}</p>
        {Boolean(preview?.detections?.length) && <p className="text-amber-700">AI 검출 후보 {preview!.detections!.length}개 · 상세 영상에서 확인</p>}
        {!preview && !loading && lesions.length > 0 && <p className="font-medium text-rose-700">번호 표시는 확정 CT의 엽 위치를 기준으로 한 해부학적 위치입니다.</p>}
        {!preview && !loading && lesions.length === 0 && <p className="text-slate-400">확정된 CT 병변 위치 정보가 없어 참고 해부도를 표시합니다.</p>}
        {summary && <p className="font-medium text-teal-700">확정 결과 · {summary}</p>}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button type="button" onClick={() => onOpenCase(caseItem.id)} className="font-semibold text-blue-700 hover:underline">검사 상세 보기 →</button>
          {error && <button type="button" onClick={() => { setError(false); setLoading(true); setRetry(value => value + 1); }} className="text-slate-600 hover:underline">다시 시도</button>}
        </div>
      </div>
    </section>
  );
}
