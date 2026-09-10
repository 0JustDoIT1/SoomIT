import { CaseInfoKey, getCaseInfoLabel } from "./case-info-menu";

const RESULT_STAGES: CaseInfoKey[] = ["XRAY", "CT", "PATHOLOGY"];

export function CaseInfoWorkspace({ menu }: { menu: CaseInfoKey }) {
  if (menu === "OVERVIEW") return <OverviewWorkspace />;
  if (RESULT_STAGES.includes(menu)) return <ResultWorkspace menu={menu} />;
  if (menu === "GENE") return <BiomarkerWorkspace />;
  if (menu === "TREATMENT") return <TreatmentWorkspace />;
  if (menu === "PRESCRIPTION") return <PrescriptionWorkspace />;
  return null;
}

function WorkspaceFrame({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white"><header className="shrink-0 border-b border-slate-200 px-5 py-3"><h1 className="text-lg font-bold text-slate-900">{title}</h1><p className="mt-1 text-xs text-slate-600">{description}</p></header><div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div></section>;
}

function OverviewWorkspace() {
  return <WorkspaceFrame title="전체 요약" description="현재 Case의 진행 단계와 실제로 조회된 결과를 한눈에 확인합니다."><div className="grid grid-cols-4 gap-2"><EmptyMetric label="현재 단계" /><EmptyMetric label="전문과 확정 결과" /><EmptyMetric label="AI 후보" /><EmptyMetric label="다음 진행 결정" /></div><div className="mt-3 grid grid-cols-2 gap-3"><EmptySection title="확인된 결과" message="확인 가능한 전문과 확정 결과가 없습니다." /><EmptySection title="진행 중·대기" message="검사오더 API가 연결되면 진행 상태가 표시됩니다." /><EmptySection title="미확정 사항" message="확인 가능한 미확정 항목이 없습니다." /><EmptySection title="다음 행동" message="저장된 clinician decision이 없습니다." /></div></WorkspaceFrame>;
}

function ResultWorkspace({ menu }: { menu: CaseInfoKey }) {
  const label = getCaseInfoLabel(menu);
  return <WorkspaceFrame title={`${label} 검사·결과`} description="전문과 확정 결과와 AI 보조 결과를 구분해 검토합니다."><div className="grid h-full min-h-[360px] grid-cols-[1.2fr_1fr] gap-3"><div className="grid min-h-0 grid-rows-2 gap-3"><EmptySection title="전문과 의료진 확정 결과" message={`확인 가능한 ${label} 확정 결과가 없습니다.`} emphasis /><EmptySection title="AI 분석 후보" message={`현재 Case에 연결된 ${label} AI 후보가 없습니다.`} /></div><EmptySection title="원본 영상·검사 근거" message="연결된 원본 근거가 없습니다. 영상 API 연결 후 이 영역에서 확인합니다." /></div></WorkspaceFrame>;
}

function BiomarkerWorkspace() {
  return <WorkspaceFrame title="바이오마커" description="유전자·PD-L1 전문과 확정 결과와 AI 후보를 분리해 표시합니다."><div className="grid grid-cols-3 gap-3"><EmptySection title="전문과 확정 결과" message="확인 가능한 바이오마커 확정 결과가 없습니다." emphasis /><EmptySection title="PD-L1 결과" message="확정 TPS 결과가 없습니다. 전용 AI API는 인증 연동 대기 상태입니다." /><EmptySection title="유전자·AI 후보" message="연결된 바이오마커 AI 후보가 없습니다." /></div><EmptyTable title="검사 결과 이력" columns={["검사 종류", "상태", "결과", "판독자", "확정 시각"]} /></WorkspaceFrame>;
}

function TreatmentWorkspace() {
  return <WorkspaceFrame title="치료 결정" description="AI 치료 후보와 호흡기내과 의료진의 최종 치료 결정을 구분해 확인합니다."><div className="grid grid-cols-3 gap-3"><EmptySection title="AI 치료 후보" message="현재 Case에 연결된 AI 치료 후보가 없습니다." /><EmptySection title="치료요법 후보" message="확인 가능한 치료요법 후보가 없습니다." /><EmptySection title="의료진 치료 결정" message="저장된 의료진 치료 결정이 없습니다." emphasis /></div><div className="mt-3 flex justify-end gap-2"><DisabledButton label="임시 저장" /><DisabledButton label="치료 결정 확정" /></div></WorkspaceFrame>;
}

function PrescriptionWorkspace() {
  return <WorkspaceFrame title="처방 및 안전성 확인" description="실제 처방과 안전성 검사, 경고 확인 및 최종 확정 상태를 관리합니다."><div className="grid grid-cols-[1.4fr_1fr] gap-3"><EmptyTable title="처방 목록" columns={["처방 항목", "용량·주기", "상태", "수정 시각"]} /><div className="space-y-3"><EmptySection title="안전성 검사" message="확인 가능한 안전성 검사 결과가 없습니다." /><EmptySection title="경고 확인" message="확인할 처방 경고가 없습니다." /></div></div><div className="mt-3 flex justify-end gap-2"><DisabledButton label="새 처방 생성" /><DisabledButton label="처방 최종 확정" /></div></WorkspaceFrame>;
}

function EmptyMetric({ label }: { label: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] text-slate-400">{label}</p><p className="mt-2 text-sm font-bold text-slate-700">-</p></div>;
}

function EmptySection({ title, message, emphasis = false }: { title: string; message: string; emphasis?: boolean }) {
  return <section className={`rounded-lg border p-4 ${emphasis ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200 bg-white"}`}><h2 className="text-sm font-bold text-slate-800">{title}</h2><div className="flex min-h-20 items-center justify-center text-center text-xs leading-5 text-slate-500">{message}</div></section>;
}

function EmptyTable({ title, columns }: { title: string; columns: string[] }) {
  return <section className="mt-3 overflow-hidden rounded-lg border border-slate-200"><h2 className="border-b border-slate-200 px-4 py-3 text-xs font-bold text-slate-800">{title}</h2><div className="overflow-x-auto"><div className="min-w-[620px]"><div className="grid bg-slate-50 px-4 py-2 text-[10px] font-semibold text-slate-500" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(110px, 1fr))` }}>{columns.map((column) => <span key={column} className="whitespace-nowrap">{column}</span>)}</div><p className="px-4 py-10 text-center text-xs text-slate-400">표시할 실제 데이터가 없습니다.</p></div></div></section>;
}

function DisabledButton({ label }: { label: string }) {
  return <button type="button" disabled className="whitespace-nowrap rounded-md bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-400">{label} · API 연동 대기</button>;
}
