"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { RecentPatients, useRecentPatients, type RecentPatient } from "@/components/workspace/recent-patients";

import { StateMessage } from "@/components/workspace/state-message";
import { StatusBadge } from "@/components/workspace/status-badge";

import { RadiologyDetail, RadiologyPatientSummary, RadiologyWorkflowBadge } from "./_components/radiology-detail";
import { RadiologyCompletedHistory } from "./_components/radiology-completed-history";
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
                  <td className="px-4 py-3 text-slate-700">{item.current_exam.examination_order.order_type_label}</td>
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

function RadiologyCaseDetail({
  caseId,
  currentExam,
}: {
  caseId: string;
  currentExam: RadiologyCaseWorklistItem["current_exam"] | null;
}) {
  const [workflow, setWorkflow] = useState<RadiologyCaseWorkflow | null>(null);
  const [error, setError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetchRadiologyCaseWorkflow(caseId, controller.signal)
      .then(data => { if (!controller.signal.aborted) setWorkflow(data); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "검사 흐름을 불러오지 못했습니다.");
        }
      });
    return () => controller.abort();
  }, [caseId, reloadVersion]);

  if (error) return <StateMessage variant="error" title={error} className="m-6" />;
  if (!workflow) return (
    <div
      role="status"
      aria-live="polite"
      className="m-6 flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-violet-100 bg-white px-4 py-8 text-center"
    >
      <Image
        src="/images/soomi-loading.png"
        alt=""
        width={160}
        height={160}
        className="h-[120px] w-[120px] object-contain"
      />
      <p className="mt-3 text-sm font-semibold text-[#25324B]">검사 흐름을 불러오는 중입니다</p>
      <p className="mt-1 text-xs text-slate-500">잠시만 기다려 주세요</p>
      <span
        className="mt-3 block h-4 w-4 animate-spin rounded-full border-2 border-violet-100 border-t-[#5364C7]"
        aria-label="로딩 중"
      />
    </div>
  );
  if (workflow.exams.length === 0) return <StateMessage variant="empty" title="표시할 영상 검사가 없습니다." className="m-6" />;
  if (!currentExam) return <StateMessage variant="empty" title="표시할 현재 검사가 없습니다." className="m-6" />;

  const currentWorkflowExam = workflow.exams.find(
    (exam) => exam.examination_order.id === currentExam.examination_order.id,
  );
  if (!currentWorkflowExam) return <StateMessage variant="empty" title="표시할 현재 검사가 없습니다." className="m-6" />;

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
      <section>
        <div className="flex items-center justify-between gap-3 rounded-t-xl border border-b-0 border-violet-100 bg-gradient-to-r from-violet-50 to-blue-50/60 px-5 py-3">
          <p className="text-sm font-bold text-slate-800">
            <span className="mr-2 text-xs text-violet-600">01</span>
            {currentWorkflowExam.examination_order.order_type_label}
          </p>
          <RadiologyWorkflowBadge status={currentWorkflowExam.workflow_status} label={currentWorkflowExam.workflow_status_label} />
        </div>
        <RadiologyDetail
          key={currentWorkflowExam.examination_order.id}
          item={currentWorkflowExam}
          embedded
          onImageUploaded={() => setReloadVersion((version) => version + 1)}
        />
      </section>
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
  const [filters, setFilters] = useState<RadiologyWorklistFilters>({});
  const [viewStatus, setViewStatus] = useState<WorklistViewStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<WorkstationTab>("worklist");

  const totalPages = Math.max(1, Math.ceil(worklistItems.length / pageSize));
  const pagedItems = worklistItems.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const aiItems = worklistItems.filter((item) =>
    ["AI_READY", "AI_RUNNING", "AI_FAILED", "AI_COMPLETED", "REVIEW_PENDING"].includes(item.workflow_status),
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
    setCurrentPage(boundedPage);
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
                viewStatus={viewStatus}
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
              ) : null}
            </div>
            {selectedCaseId ? (
              <RadiologyCaseDetail
                key={selectedCaseId}
                caseId={selectedCaseId}
                currentExam={selectedItem?.current_exam ?? null}
              />
            ) : (
              <main className="flex min-h-0 items-center justify-center overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex -translate-y-8 flex-col items-center text-center">
                  <Image src="/images/soomi.png" alt="" width={176} height={176} className="mb-5 h-auto w-44 object-contain" />
                  <h2 className="text-xl font-bold text-slate-900">환자를 선택해 주세요</h2>
                  <p className="mt-2 max-w-[360px] text-sm leading-6 text-slate-500">
                    왼쪽 Worklist에서 환자를 선택하면 X-ray / CT / PET-CT·TNM 작업을 시작할 수 있습니다.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-3" aria-label="지원 검사 종류">
                    <div className="flex min-w-[104px] items-center justify-center gap-2 rounded-[10px] border border-[#E5EEFC] bg-[#F4F8FF] px-4 py-3 text-sm font-semibold text-[#25324B]">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                        <path d="M11.2 5.2C8.1 5.7 6.5 8.4 6.5 12.5c0 3.5 1.5 5.8 4.5 6.3V5.2Zm1.6 0v13.6c3-.5 4.5-2.8 4.5-6.3 0-4.1-1.6-6.8-4.7-7.3Z" />
                        <path d="M12 4v15.3M8.2 8.5c1.2.5 2.1 1.7 2.5 3.5m5.1-3.5c-1.2.5-2.1 1.7-2.5 3.5" strokeLinecap="round" />
                      </svg>
                      <span>X-ray</span>
                    </div>
                    <div className="flex min-w-[104px] items-center justify-center gap-2 rounded-[10px] border border-[#ECE8FC] bg-[#F8F6FF] px-4 py-3 text-sm font-semibold text-[#25324B]">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                        <rect x="4" y="4" width="16" height="16" rx="2" />
                        <circle cx="12" cy="12" r="4" />
                        <path d="M12 8v8m-4-4h8" strokeLinecap="round" />
                      </svg>
                      <span>CT</span>
                    </div>
                    <div className="flex min-w-[144px] items-center justify-center gap-2 rounded-[10px] border border-[#E1F1EC] bg-[#F3FAF8] px-4 py-3 text-sm font-semibold text-[#25324B]">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                        <circle cx="12" cy="12" r="7" />
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 2v3m0 14v3M2 12h3m14 0h3" strokeLinecap="round" />
                      </svg>
                      <span>PET-CT·TNM</span>
                    </div>
                  </div>
                </div>
              </main>
            )}
          </div>
        ) : null}
        {activeTab === "ai" ? (
          viewStatus === "loading" ? <StateMessage variant="loading" title="AI 작업 목록을 불러오는 중입니다." />
            : viewStatus === "error" || viewStatus === "unauthorized" ? <StateMessage variant="error" title="AI 작업 목록을 조회할 수 없습니다." description={errorMessage} />
              : <RadiologyStatusTable title="AI 작업" items={aiItems} emptyTitle="현재 표시할 AI 작업이 없습니다." />
        ) : null}
        {activeTab === "history" ? (
          <RadiologyCompletedHistory />
        ) : null}
      </div>
    </div>
  );
}
