"use client";

import { useState } from "react";
import { BottomActionBar } from "./bottom-action-bar";
import { CaseInfoMenu, CaseInfoKey } from "./case-info-menu";
import { CaseInfoWorkspace } from "./case-info-workspace";
import { CasePatientSidebar } from "./case-patient-sidebar";
import { CaseSummaryHeader, CaseWorkflowBar } from "./case-workflow-header";
import { CurrentActionQueue } from "./current-action-queue";
import { TnmReviewWorkspace } from "./tnm-review-workspace";
import { CaseOverviewPanel } from "./case-overview-panel";
import { ResultReviewPanel } from "./result-review-panel";
import { BiomarkerSourceHeader } from "./biomarker-source-header";
import { TreatmentPrescriptionOverview } from "./treatment-prescription-overview";

export function CaseWorkspaceEmpty({ errorMessage, isPreview = false }: { errorMessage?: string; isPreview?: boolean }) {
  const [selectedMenu, setSelectedMenu] = useState<CaseInfoKey>("STAGING");

  return (
    <div className="fixed inset-x-0 bottom-0 top-[54px] flex min-h-0 w-full flex-col overflow-hidden bg-slate-50">
      <div className="relative"><CaseSummaryHeader caseData={{ patient_name: "-", patient_code: "-", case_code: "-", primary_doctor_name: null, current_stage: "-", case_status: "-" }} />{isPreview && <span className="absolute right-4 top-2 rounded-full bg-amber-50 px-3 py-1 text-[10px] font-semibold text-amber-700">UI 미리보기 · 실제 의료 데이터 없음</span>}</div>
      <div className="grid min-h-0 flex-1 grid-cols-[235px_165px_minmax(0,1fr)] overflow-hidden">
        <CasePatientSidebar cases={[]} selectedId="" searchText="" onSearchChange={() => undefined} onSelect={() => undefined} />
        <CaseInfoMenu selected={selectedMenu} onSelect={setSelectedMenu} />
        <main className="grid min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)_52px] overflow-hidden p-2 pb-0">
          <CaseWorkflowBar currentStage="" />
          <CurrentActionQueue actions={[]} onNavigate={() => undefined} />
          {errorMessage && <p role="alert" className="sr-only">{errorMessage}</p>}
          <div className="min-h-0 overflow-y-auto">
            <PreviewWorkspace menu={selectedMenu} />
          </div>
          {selectedMenu === "STAGING" ? <BottomActionBar /> : <div className="-mx-2 border-t border-slate-200 bg-white" />}
        </main>
      </div>
    </div>
  );
}

const EMPTY_CASE = {
  case_code: "-",
  patient_name: "-",
  patient_code: "-",
  current_stage: "-",
  case_status: "-",
  primary_doctor_name: null,
  updated_at: null,
};

function PreviewWorkspace({ menu }: { menu: CaseInfoKey }) {
  if (menu === "OVERVIEW") return <CaseOverviewPanel caseData={EMPTY_CASE} clinicalResults={[]} aiResults={[]} />;
  if (["XRAY", "CT", "PATHOLOGY"].includes(menu)) return <ResultReviewPanel stage={menu} />;
  if (menu === "STAGING") return <TnmReviewWorkspace />;
  if (menu === "GENE") {
    return <div className="space-y-3"><BiomarkerSourceHeader /><PreviewEmpty title="PD-L1 결과 비교" message="전문과 확정 TPS가 없으며 PD-L1 AI 후보는 인증 연결 전까지 조회되지 않습니다." /></div>;
  }
  if (menu === "TREATMENT" || menu === "PRESCRIPTION") {
    return <div><TreatmentPrescriptionOverview treatment={null} prescriptions={[]} /><CaseInfoWorkspace menu={menu} /></div>;
  }
  return <CaseInfoWorkspace menu={menu} />;
}

function PreviewEmpty({ title, message }: { title: string; message: string }) {
  return <section className="rounded-lg border border-slate-200 bg-white p-4"><h2 className="text-sm font-bold text-slate-900">{title}</h2><div className="mt-3 flex min-h-48 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-5 text-center text-xs leading-5 text-slate-400">{message}</div></section>;
}
