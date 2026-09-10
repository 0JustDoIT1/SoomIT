"use client";

import { useState } from "react";
import { BottomActionBar } from "./bottom-action-bar";
import { CaseInfoMenu, CaseInfoKey } from "./case-info-menu";
import { CaseInfoWorkspace } from "./case-info-workspace";
import { CasePatientSidebar } from "./case-patient-sidebar";
import { CaseSummaryHeader, CaseWorkflowBar } from "./case-workflow-header";
import { CurrentActionQueue } from "./current-action-queue";
import { TnmReviewWorkspace } from "./tnm-review-workspace";

export function CaseWorkspaceEmpty({ errorMessage, isPreview = false }: { errorMessage?: string; isPreview?: boolean }) {
  const [selectedMenu, setSelectedMenu] = useState<CaseInfoKey>("STAGING");

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50">
      <div className="relative"><CaseSummaryHeader caseData={{ patient_name: "-", patient_code: "-", case_code: "-", primary_doctor_name: null, current_stage: "-", case_status: "-" }} />{isPreview && <span className="absolute right-4 top-2 rounded-full bg-amber-50 px-3 py-1 text-[10px] font-semibold text-amber-700">UI 미리보기 · 실제 의료 데이터 없음</span>}</div>
      <div className="grid min-h-0 flex-1 grid-cols-[235px_165px_minmax(1040px,1fr)] overflow-x-auto overflow-y-hidden">
        <CasePatientSidebar cases={[]} selectedId="" searchText="" onSearchChange={() => undefined} onSelect={() => undefined} />
        <CaseInfoMenu selected={selectedMenu} onSelect={setSelectedMenu} />
        <main className="grid min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)_52px] overflow-hidden p-2 pb-0">
          <CaseWorkflowBar currentStage="" />
          <CurrentActionQueue actions={[]} onNavigate={() => undefined} />
          {errorMessage && <p role="alert" className="sr-only">{errorMessage}</p>}
          <div className="min-h-0 overflow-hidden">
            {selectedMenu === "STAGING" ? <TnmReviewWorkspace /> : <CaseInfoWorkspace menu={selectedMenu} />}
          </div>
          {selectedMenu === "STAGING" ? <BottomActionBar /> : <div className="-mx-2 border-t border-slate-200 bg-white" />}
        </main>
      </div>
    </div>
  );
}
