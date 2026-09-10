"use client";

import { useEffect, useState } from "react";

import { RadiologyDetail } from "./_components/radiology-detail";
import { RadiologyWorklist, type WorklistViewStatus } from "./_components/radiology-worklist";
import {
  fetchRadiologyWorklist,
  RadiologyApiError,
  type RadiologyWorklistFilters,
  type RadiologyWorklistItem,
} from "./_lib/radiology-api";

export default function RadiologyWorklistPage() {
  const [worklistItems, setWorklistItems] = useState<RadiologyWorklistItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<RadiologyWorklistItem | null>(null);
  const [filters, setFilters] = useState<RadiologyWorklistFilters>({});
  const [viewStatus, setViewStatus] = useState<WorklistViewStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");

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
        const nextItems = await fetchRadiologyWorklist(accessToken, filters, controller.signal);
        if (controller.signal.aborted) return;

        setWorklistItems(nextItems);
        setSelectedItem((currentItem) => {
          if (!currentItem) return null;

          return (
            nextItems.find(
              (item) => item.examination_order.id === currentItem.examination_order.id,
            ) ?? null
          );
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
    <div className="p-4 sm:p-6 xl:p-8">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Radiology</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Worklist</h1>
      </div>

      <div className="grid overflow-hidden border-y border-slate-200 bg-white xl:grid-cols-[minmax(0,1.35fr)_minmax(380px,0.65fr)] xl:divide-x xl:divide-slate-200">
        <RadiologyWorklist
          items={worklistItems}
          selectedId={selectedItem?.examination_order.id ?? null}
          onSelect={setSelectedItem}
          viewStatus={viewStatus}
          errorMessage={errorMessage}
          filters={filters}
          onFiltersChange={setFilters}
        />
        <RadiologyDetail item={selectedItem} />
      </div>
    </div>
  );
}
