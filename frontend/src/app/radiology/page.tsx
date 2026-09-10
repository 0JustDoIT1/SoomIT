"use client";

import { useEffect, useState } from "react";

import { StateMessage } from "@/components/workspace/state-message";
import { StatusBadge } from "@/components/workspace/status-badge";

import { RadiologyDetail } from "./_components/radiology-detail";
import {
  getInitialDisplayStage,
  RadiologyStagePanel,
  type RadiologyDisplayStage,
} from "./_components/radiology-stage-panel";
import { RadiologyWorklist, type WorklistViewStatus } from "./_components/radiology-worklist";
import {
  fetchRadiologyWorklist,
  RadiologyApiError,
  type RadiologyWorklistFilters,
  type RadiologyWorklistItem,
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
  items: RadiologyWorklistItem[];
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
                <tr key={item.examination_order.id} className="border-b border-slate-100 bg-white">
                  <td className="px-4 py-3 font-semibold text-slate-800">{item.patient.name}</td>
                  <td className="px-4 py-3 text-slate-600">{item.patient.patient_code}</td>
                  <td className="px-4 py-3 text-slate-700">{item.examination_order.exam_type_label}</td>
                  <td className="px-4 py-3">
                    {item.latest_ai_analysis ? <StatusBadge status={item.latest_ai_analysis.status} label={item.latest_ai_analysis.status_label} /> : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.requesting_doctor.name}</td>
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

export default function RadiologyWorklistPage() {
  const pageSize = 10;
  const [worklistItems, setWorklistItems] = useState<RadiologyWorklistItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<RadiologyWorklistItem | null>(null);
  const [filters, setFilters] = useState<RadiologyWorklistFilters>({});
  const [viewStatus, setViewStatus] = useState<WorklistViewStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<WorkstationTab>("worklist");
  const [selectedStage, setSelectedStage] = useState<RadiologyDisplayStage | null>(null);

  const totalPages = Math.max(1, Math.ceil(worklistItems.length / pageSize));
  const pagedItems = worklistItems.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const aiItems = worklistItems.filter((item) =>
    ["AI_READY", "AI_RUNNING", "AI_FAILED"].includes(item.workflow_status),
  );
  const completedItems = worklistItems.filter(
    (item) => item.workflow_status === "REVIEW_COMPLETED",
  );

  function handleSelectItem(item: RadiologyWorklistItem) {
    setSelectedItem(item);
    setSelectedStage(getInitialDisplayStage(item.case.current_stage));
  }

  function handleFiltersChange(nextFilters: RadiologyWorklistFilters) {
    setCurrentPage(1);
    setFilters(nextFilters);
  }

  function handlePageChange(nextPage: number) {
    const boundedPage = Math.min(Math.max(nextPage, 1), totalPages);
    const nextItems = worklistItems.slice(
      (boundedPage - 1) * pageSize,
      boundedPage * pageSize,
    );
    setCurrentPage(boundedPage);
    if (
      selectedItem &&
      !nextItems.some(
        (item) => item.examination_order.id === selectedItem.examination_order.id,
      )
    ) {
      setSelectedItem(null);
      setSelectedStage(null);
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadWorklist() {
      await Promise.resolve();

      const accessToken = sessionStorage.getItem("accessToken");
      if (!accessToken) {
        setWorklistItems([]);
        setSelectedItem(null);
        setSelectedStage(null);
        setErrorMessage("로그인이 필요합니다.");
        setViewStatus("unauthorized");
        return;
      }

      setViewStatus("loading");
      setErrorMessage("");

      try {
        const nextItems = await fetchRadiologyWorklist(filters, controller.signal);
        if (controller.signal.aborted) return;

        setWorklistItems(nextItems);
        setSelectedItem((currentItem) => {
          if (!currentItem) return null;

          const retainedItem = (
            nextItems.find(
              (item) => item.examination_order.id === currentItem.examination_order.id,
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
        setSelectedStage(null);

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
    <div className="min-w-0">
      <nav aria-label="영상의학과 작업" className="overflow-x-auto border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-max gap-7">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
              className={`border-b-2 px-1 py-3 text-sm font-semibold transition-colors ${activeTab === tab.id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="p-3 sm:p-4 lg:p-5">
        {activeTab === "worklist" ? (
          <div className="grid overflow-hidden border-y border-slate-200 bg-white xl:h-[calc(100vh-133px)] xl:min-h-[560px] xl:grid-cols-[minmax(360px,28fr)_minmax(190px,16fr)_minmax(0,56fr)] xl:divide-x xl:divide-slate-200">
            <RadiologyWorklist
              items={pagedItems}
              selectedId={selectedItem?.examination_order.id ?? null}
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
            <RadiologyStagePanel
              item={selectedItem}
              selectedStage={selectedStage}
              onSelectStage={setSelectedStage}
            />
            <RadiologyDetail item={selectedItem} selectedStage={selectedStage} />
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
