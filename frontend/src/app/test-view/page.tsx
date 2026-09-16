"use client";

import { useEffect, useState } from "react";

import { CtDicomViewer } from "@/components/medical-imaging/ct-dicom-viewer";
import { CtVisualizationViewer } from "@/components/medical-imaging/ct-visualization-viewer";
import {
  fetchRadiologyAnalysisResult,
  RadiologyApiError,
  type RadiologyVisualizationLayer,
} from "@/app/radiology/_lib/radiology-api";

const CT_TEST_PRESET = {
  analysisId: "6275047c-fa17-443d-bc80-0828f69b0747",
  orderId: "937dc266-7e19-4e0f-b3c6-7bfcb2df64e9",
  assetId: "7b2a428e-3ec8-4854-bf3b-d3dfcc9e80b3",
  orthancSeriesId: "1ddda848-9c2a7f23-3f580cf0-ee14b84f-e8561c0f",
} as const;

/**
 * Sandbox page for building/testing the CT DICOMweb + Cornerstone segmentation
 * viewer and the Three.js AI-visualization viewer against real IDs, without
 * wiring them into the radiology workstation yet.
 */
export default function TestViewPage() {
  const [orderId, setOrderId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [analysisId, setAnalysisId] = useState("");
  const [submitted, setSubmitted] = useState<{ orderId: string; assetId: string; analysisId: string } | null>(null);

  const [layers, setLayers] = useState<RadiologyVisualizationLayer[]>([]);
  const [layersError, setLayersError] = useState("");

  useEffect(() => {
    if (!submitted?.analysisId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLayers([]);
      return;
    }
    let disposed = false;
    setLayersError("");
    fetchRadiologyAnalysisResult(submitted.analysisId)
      .then((data) => {
        if (disposed) return;
        setLayers("visualization" in data.result ? data.result.visualization?.layers ?? [] : []);
      })
      .catch((reason: unknown) => {
        if (disposed) return;
        setLayers([]);
        setLayersError(reason instanceof RadiologyApiError ? reason.message : "3D 시각화 데이터를 불러오지 못했습니다.");
      });
    return () => {
      disposed = true;
    };
  }, [submitted?.analysisId]);

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <h1 className="text-lg font-bold text-slate-900">CT 3D 뷰어 테스트</h1>
      <p className="mt-1 text-xs text-slate-500">
        워크스테이션에 아직 통합 전인 Cornerstone3D / Three.js 뷰어를 실제 ID로 직접 테스트하는 화면입니다.
      </p>

      <form
        className="mt-4 flex flex-wrap items-end gap-3 rounded border border-slate-200 bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted({ orderId, assetId, analysisId });
        }}
      >
        <label className="text-xs text-slate-600">
          order_id
          <input
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
            className="mt-1 block w-72 rounded border border-slate-300 px-2 py-1 text-xs"
            placeholder="CT 오더 UUID"
          />
        </label>
        <label className="text-xs text-slate-600">
          asset_id
          <input
            value={assetId}
            onChange={(event) => setAssetId(event.target.value)}
            className="mt-1 block w-72 rounded border border-slate-300 px-2 py-1 text-xs"
            placeholder="READY 상태 CT 영상 자산 UUID"
          />
        </label>
        <label className="text-xs text-slate-600">
          analysis_id
          <input
            value={analysisId}
            onChange={(event) => setAnalysisId(event.target.value)}
            className="mt-1 block w-72 rounded border border-slate-300 px-2 py-1 text-xs"
            placeholder="CT_ANALYSIS 분석 UUID (선택)"
          />
        </label>
        <button type="submit" className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">
          불러오기
        </button>
        <button
          type="button"
          className="rounded bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          title={`Orthanc Series: ${CT_TEST_PRESET.orthancSeriesId}`}
          onClick={() => {
            setOrderId(CT_TEST_PRESET.orderId);
            setAssetId(CT_TEST_PRESET.assetId);
            setAnalysisId(CT_TEST_PRESET.analysisId);
            setSubmitted({
              orderId: CT_TEST_PRESET.orderId,
              assetId: CT_TEST_PRESET.assetId,
              analysisId: CT_TEST_PRESET.analysisId,
            });
          }}
        >
          현재 CT 테스트 값 불러오기
        </button>
      </form>

      {submitted?.orderId && submitted.assetId ? (
        <div className="mt-6 space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-800">Cornerstone3D — CT 판독 뷰어</h2>
            <CtDicomViewer
              orderId={submitted.orderId}
              assetId={submitted.assetId}
              analysisId={submitted.analysisId || undefined}
            />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-800">Three.js — AI 분할 3D 시각화</h2>
            {layersError ? (
              <p className="text-xs text-rose-600">{layersError}</p>
            ) : submitted.analysisId ? (
              <CtVisualizationViewer analysisId={submitted.analysisId} layers={layers} />
            ) : (
              <p className="text-xs text-slate-500">analysis_id를 입력하면 3D 시각화를 불러옵니다.</p>
            )}
          </section>
        </div>
      ) : (
        <p className="mt-6 text-xs text-slate-500">order_id와 asset_id를 입력하고 불러오기를 눌러주세요.</p>
      )}
    </main>
  );
}
