"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { TreatmentDecisionPanel } from "../../cases/[caseId]/treatment-decision-panel";
import { PrescriptionPanel } from "../../cases/[caseId]/prescription-panel";
import { useRespiratoryAuth } from "../../_components/respiratory-auth-provider";
import { API_BASE_URL } from "../../_lib/respiratory-api";

export default function TreatmentPreviewPage() {
  const params = useParams<{ caseId: string }>();
  const caseId = typeof params.caseId === "string" ? params.caseId : "";
  const { authorizedFetch } = useRespiratoryAuth();
  const [treatmentVersion, setTreatmentVersion] = useState(0);

  if (!caseId) {
    return <main className="mx-auto max-w-6xl p-6 text-sm text-slate-500">유효한 Case ID가 필요합니다.</main>;
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold text-blue-600">DEVELOPMENT / INTEGRATION PREVIEW</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">치료 결정 · 처방 통합 테스트</h1>
        <p className="mt-2 text-sm text-slate-500">기존 Case 화면과 분리된 개발·통합 검증용 Preview Page입니다.</p>
        <p className="mt-2 break-all font-mono text-xs text-slate-400">caseId: {caseId}</p>
      </header>

      <TreatmentDecisionPanel
        caseId={caseId}
        apiBaseUrl={API_BASE_URL}
        authorizedFetch={authorizedFetch}
        onTreatmentChanged={() => setTreatmentVersion((value) => value + 1)}
      />

      <PrescriptionPanel
        caseId={caseId}
        apiBaseUrl={API_BASE_URL}
        authorizedFetch={authorizedFetch}
        refreshKey={treatmentVersion}
      />
    </main>
  );
}
