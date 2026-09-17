"use client";

import { useCallback, useEffect, useState } from "react";

import { CtVisualizationViewer } from "@/components/medical-imaging/ct-visualization-viewer";
import type { RadiologyVisualizationLayer } from "@/app/radiology/_lib/radiology-api";

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function CaseCtVisualization({ apiBaseUrl, authorizedFetch, caseId, analysisId }: { apiBaseUrl: string; authorizedFetch: AuthorizedFetch; caseId: string; analysisId?: string }) {
  const [layers, setLayers] = useState<RadiologyVisualizationLayer[]>([]);
  const [loading, setLoading] = useState(Boolean(analysisId));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!analysisId) return;
    const controller = new AbortController();
    void (async () => {
      setLoading(true); setError("");
      try {
        const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/ct-analyses/${analysisId}/visualization/`, { signal: controller.signal });
        const body: unknown = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body && typeof body === "object" && "detail" in body && typeof body.detail === "string" ? body.detail : "CT 3D 결과를 불러오지 못했습니다.");
        const nextLayers = body && typeof body === "object" && "layers" in body && Array.isArray(body.layers) ? body.layers : [];
        if (!controller.signal.aborted) setLayers(nextLayers as RadiologyVisualizationLayer[]);
      } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "CT 3D 결과를 불러오지 못했습니다."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [apiBaseUrl, analysisId, authorizedFetch, caseId]);

  const fetchLayer = useCallback(async (layerId: string) => {
    if (!analysisId) throw new Error("CT 분석 결과가 없습니다.");
    const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/ct-analyses/${analysisId}/visualization/${layerId}/`, { headers: { Accept: "*/*" } });
    if (!response.ok) throw new Error("CT 3D 레이어를 불러오지 못했습니다.");
    return response.arrayBuffer();
  }, [apiBaseUrl, analysisId, authorizedFetch, caseId]);

  if (!analysisId) return null;
  if (loading) return <p className="rounded border border-slate-200 bg-white px-3 py-5 text-center text-xs text-slate-500">CT 3D 결과를 불러오는 중입니다.</p>;
  if (error) return <p role="alert" className="rounded border border-rose-100 bg-rose-50 px-3 py-3 text-xs text-rose-700">{error}</p>;
  if (!layers.length) return null;
  return <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><header className="border-b border-slate-200 px-4 py-3"><p className="text-[10px] font-semibold text-blue-600">CT 분할 · 3D</p><h3 className="mt-0.5 text-sm font-bold text-slate-800">결절 분할 3D 시각화</h3></header><CtVisualizationViewer analysisId={analysisId} layers={layers} fetchLayer={fetchLayer} /></section>;
}
