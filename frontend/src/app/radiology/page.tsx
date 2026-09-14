"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { RecentPatients, useRecentPatients, type RecentPatient } from "@/components/workspace/recent-patients";

import { StateMessage } from "@/components/workspace/state-message";
import { StatusBadge } from "@/components/workspace/status-badge";

import { RadiologyDetail, RadiologyPatientSummary } from "./_components/radiology-detail";
import { RadiologyWorklist, type WorklistViewStatus } from "./_components/radiology-worklist";
import {
  fetchRadiologyCaseWorkflow,
  fetchRadiologyCaseWorklist,
  RadiologyApiError,
  type RadiologyCaseWorklistItem,
  type RadiologyCaseWorkflow,
  type RadiologyWorklistFilters,
} from "./_lib/radiology-api";

type WorkstationTab = "worklist" | "ai" | "history";

const tabs: Array<{ id: WorkstationTab; label: string }> = [
  { id: "worklist", label: "Worklist" },
  { id: "ai", label: "AI 작업" },
  { id: "history", label: "완료 기록" },
];

function RadiologyStatusTable({
  title,
  items,
  emptyTitle,
}: {
  title: string;
  items: RadiologyCaseWorklistItem[];
  emptyTitle: string;
}) {
  return (
    <section className="min-w-0 bg-white" aria-labelledby="status-table-heading">
      <div className="flex min-h-14 items-center border-b border-slate-200 px-5">
        <h2 id="status-table-heading" className="text-sm font-bold text-slate-800">{title}</h2>
      </div>
      {items.length === 0 ? (
        <StateMessage variant="empty" title={emptyTitle} className="m-5" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3">환자명</th>
                <th className="px-4 py-3">환자코드</th>
                <th className="px-4 py-3">검사</th>
                <th className="px-4 py-3">AI 상태</th>
                <th className="px-4 py-3">요청 의사</th>
                <th className="px-4 py-3">현재 상태</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.case.id} className="border-b border-slate-100 bg-white">
                  <td className="px-4 py-3 font-semibold text-slate-800">{item.patient.name}</td>
                  <td className="px-4 py-3 text-slate-600">{item.patient.patient_code}</td>
                  <td className="px-4 py-3 text-slate-700">{item.current_exam.examination_order.exam_type_label}</td>
                  <td className="px-4 py-3">
                    {item.current_exam.latest_ai_analysis ? <StatusBadge status={item.current_exam.latest_ai_analysis.status} label={item.current_exam.latest_ai_analysis.status_label} /> : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.current_exam.requesting_doctor.name}</td>
                  <td className="px-4 py-3"><StatusBadge status={item.workflow_status} label={item.workflow_status_label} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RadiologyCaseDetail({ caseId, onLoaded }: { caseId: string; onLoaded: (workflow: RadiologyCaseWorkflow) => void }) {
  const [workflow, setWorkflow] = useState<RadiologyCaseWorkflow | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetchRadiologyCaseWorkflow(caseId, controller.signal)
      .then(data => { if (!controller.signal.aborted) { setWorkflow(data); onLoaded(data); } })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "검사 흐름을 불러오지 못했습니다.");
        }
      });
    return () => controller.abort();
  }, [caseId, onLoaded]);

  if (error) return <StateMessage variant="error" title={error} className="m-6" />;
  if (!workflow) return <StateMessage variant="loading" title="검사 흐름을 불러오는 중입니다." className="m-6" />;
  if (workflow.exams.length === 0) return <StateMessage variant="empty" title="표시할 영상 검사가 없습니다." className="m-6" />;

  return (
    <main className="min-h-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-violet-600">선택 환자 영상검사</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">
              {workflow.patient.name}
              <span className="ml-2 text-sm font-medium text-slate-500">{workflow.patient.patient_code}</span>
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {workflow.patient.sex} · {workflow.patient.birth_date} · {workflow.case.case_code}
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>담당 의사</p>
            <p className="mt-1 font-semibold text-slate-800">{workflow.responsible_doctor?.name ?? "-"}</p>
            <p className="mt-2 text-violet-600">검사 오더 {workflow.exams.length}건</p>
          </div>
        </div>
      </header>
      <div className="space-y-5">
        {workflow.exams.map((exam, index) => (
          <section key={exam.examination_order.id}>
            <div className="flex items-center justify-between gap-3 rounded-t-xl border border-b-0 border-violet-100 bg-gradient-to-r from-violet-50 to-blue-50/60 px-5 py-3">
              <p className="text-sm font-bold text-slate-800">
                <span className="mr-2 text-xs text-violet-600">{String(index + 1).padStart(2, "0")}</span>
                {exam.examination_order.exam_type_label}
              </p>
              <StatusBadge status={exam.workflow_status} label={exam.workflow_status_label} />
            </div>
            <RadiologyDetail item={exam} embedded />
          </section>
        ))}
      </div>
    </main>
  );
}

export default function RadiologyWorklistPage() {
  const pageSize = 10;
  const [worklistItems, setWorklistItems] = useState<RadiologyCaseWorklistItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<RadiologyCaseWorklistItem | null>(null);
  const [recentSelection, setRecentSelection] = useState<RecentPatient | null>(null);
  const recent = useRecentPatients("radiologyRecentPatients");
  const selectedCaseId = selectedItem?.case.id ?? recentSelection?.case_id ?? null;
  const onWorkflowLoaded = useCallback((workflow: RadiologyCaseWorkflow) => {
    setSelectedItem(current => {
      if (current) return current;
      const exam = workflow.exams.at(-1);
      return exam ? { case: workflow.case, patient: workflow.patient, responsible_doctor: workflow.responsible_doctor,
        exam_count: workflow.exams.length, current_exam: exam, workflow_status: exam.workflow_status,
        workflow_status_label: exam.workflow_status_label } : null;
    });
  }, []);
  const [filters, setFilters] = useState<RadiologyWorklistFilters>({});
  const [viewStatus, setViewStatus] = useState<WorklistViewStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pagePending, startPageTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<WorkstationTab>("worklist");

  const totalPages = Math.max(1, Math.ceil(worklistItems.length / pageSize));
  const pagedItems = worklistItems.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const aiItems = worklistItems.filter((item) =>
    ["AI_READY", "AI_RUNNING", "AI_FAILED", "AI_COMPLETED", "REVIEW_PENDING"].includes(item.workflow_status),
  );
  const completedItems = worklistItems.filter(
    (item) => item.workflow_status === "REVIEW_COMPLETED",
  );

  function handleSelectItem(item: RadiologyCaseWorklistItem) {
    setRecentSelection(null);
    setSelectedItem(item);
    recent.remember({ case_id: item.case.id, patient_name: item.patient.name, birth_date: item.patient.birth_date });
  }

  function handleFiltersChange(nextFilters: RadiologyWorklistFilters) {
    setRecentSelection(null);
    setCurrentPage(1);
    setFilters(nextFilters);
  }

  function handlePageChange(nextPage: number) {
    const boundedPage = Math.min(Math.max(nextPage, 1), totalPages);
    startPageTransition(() => setCurrentPage(boundedPage));
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadWorklist() {
      await Promise.resolve();

      const accessToken = sessionStorage.getItem("accessToken");
      if (!accessToken) {
        setWorklistItems([]);
        setSelectedItem(null);
        setErrorMessage("로그인이 필요합니다.");
        setViewStatus("unauthorized");
        return;
      }

      setViewStatus("loading");
      setErrorMessage("");

      try {
        const nextItems = await fetchRadiologyCaseWorklist(filters, controller.signal);
        if (controller.signal.aborted) return;

        setWorklistItems(nextItems);
        setSelectedItem((currentItem) => {
          if (!currentItem) return null;

          const retainedItem = (
            nextItems.find(
              (item) => item.case.id === currentItem.case.id,
            ) ?? null
          );
          return retainedItem;
        });
        setViewStatus(nextItems.length > 0 ? "ready" : "empty");
      } catch (error) {
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
          return;
        }

        setWorklistItems([]);
        setSelectedItem(null);

        if (error instanceof RadiologyApiError && (error.status === 401 || error.status === 403)) {
          setErrorMessage(
            error.status === 401
              ? "인증 정보가 유효하지 않습니다. 다시 로그인해 주세요."
              : "방사선사 Worklist에 접근할 권한이 없습니다.",
          );
          setViewStatus("unauthorized");
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Worklist를 불러오지 못했습니다.");
        setViewStatus("error");
      }
    }

    void loadWorklist();

    return () => controller.abort();
  }, [filters]);

  return (
    <div className="min-w-0 bg-slate-50/60">
      <nav aria-label="영상의학과 작업" className="overflow-x-auto border-b border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-[1760px] px-4 sm:px-6">
          <div className="flex min-w-max gap-7">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={activeTab === tab.id ? "page" : undefined}
                className={`border-b-2 px-2 py-3 text-sm font-semibold transition-colors ${activeTab === tab.id ? "border-violet-400 text-violet-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <div className="mx-auto w-full max-w-[1760px] px-4 py-3 sm:px-6 sm:py-4">
        {activeTab === "worklist" ? (
          <div className="grid gap-4 xl:h-[calc(100vh-173px)] xl:min-h-[560px] xl:grid-cols-[160px_minmax(360px,28fr)_minmax(0,62fr)]">
            <RecentPatients patients={recent.patients} selectedId={selectedCaseId} onSelect={patient => {
              if (patient.case_id !== selectedCaseId) { setSelectedItem(null); setRecentSelection(patient); }
              recent.remember(patient);
            }} />
            <div className="grid min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm grid-rows-[minmax(0,62fr)_minmax(0,38fr)] divide-y divide-slate-100">
              <RadiologyWorklist
                items={pagedItems}
                selectedId={selectedCaseId}
                onSelect={handleSelectItem}
                viewStatus={pagePending ? "loading" : viewStatus}
                errorMessage={errorMessage}
                filters={filters}
                onFiltersChange={handleFiltersChange}
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={worklistItems.length}
                onPageChange={handlePageChange}
              />
              {selectedItem ? (
                <RadiologyPatientSummary item={selectedItem.current_exam} onClear={() => { setSelectedItem(null); setRecentSelection(null); }} />
              ) : recentSelection ? (
                <div className="p-4"><p>{recentSelection.patient_name}</p><p>{recentSelection.birth_date || "-"}</p></div>
              ) : (
                <StateMessage variant="empty" title="환자를 선택하세요" description="Worklist에서 검사 항목을 선택하면 환자 정보가 표시됩니다." className="m-4" />
              )}
            </div>
            {selectedCaseId ? (
              <RadiologyCaseDetail key={selectedCaseId} caseId={selectedCaseId} onLoaded={onWorkflowLoaded} />
            ) : (
              <StateMessage variant="empty" title="영상 작업을 시작할 환자를 선택하세요" description="Worklist에서 환자를 선택하면 X-ray / CT / PET-CT-TNM 검사 흐름을 확인할 수 있습니다." className="m-8 self-center rounded-xl border border-slate-200 bg-white shadow-sm" />
            )}
          </div>
        ) : null}
        {activeTab === "ai" ? (
          viewStatus === "loading" ? <StateMessage variant="loading" title="AI 작업 목록을 불러오는 중입니다." />
            : viewStatus === "error" || viewStatus === "unauthorized" ? <StateMessage variant="error" title="AI 작업 목록을 조회할 수 없습니다." description={errorMessage} />
              : <RadiologyStatusTable title="AI 작업" items={aiItems} emptyTitle="현재 표시할 AI 작업이 없습니다." />
        ) : null}
        {activeTab === "history" ? (
          viewStatus === "loading" ? <StateMessage variant="loading" title="완료 기록을 불러오는 중입니다." />
            : viewStatus === "error" || viewStatus === "unauthorized" ? <StateMessage variant="error" title="완료 기록을 조회할 수 없습니다." description={errorMessage} />
              : <RadiologyStatusTable title="완료 기록" items={completedItems} emptyTitle="현재 조회 데이터에서 확인 가능한 완료 기록이 없습니다." />
        ) : null}
      </div>
    </div>
  );
}
