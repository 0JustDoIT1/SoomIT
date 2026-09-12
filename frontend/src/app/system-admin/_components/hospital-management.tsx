"use client";

import { useEffect, useMemo, useState } from "react";
import { StateMessage } from "@/components/workspace/state-message";
import {
  fetchHospitalDetail,
  fetchHospitals,
  SystemAdminApiError,
  type Hospital,
  type HospitalDetail,
} from "../_lib/system-admin-api";
import { getSystemAdminAccessToken } from "../_lib/system-admin-session";

const message = (caught: unknown) =>
  caught instanceof SystemAdminApiError && caught.status === 401
    ? "인증이 만료되었습니다. 다시 로그인해주세요."
    : caught instanceof SystemAdminApiError && caught.status === 403
      ? "시스템 관리자 권한이 없습니다."
      : caught instanceof Error
        ? caught.message
        : "조회하지 못했습니다.";

export function HospitalManagement() {
  const [items, setItems] = useState<Hospital[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<HospitalDetail | null>(null);
  const [listState, setListState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [detailState, setDetailState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) =>
      item.name.toLowerCase().includes(keyword) || item.code.toLowerCase().includes(keyword),
    );
  }, [items, query]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      await Promise.resolve();
      const token = getSystemAdminAccessToken();
      if (!token) return;
      try {
        const rows = await fetchHospitals(token, controller.signal);
        setItems(rows);
        setSelectedId((current) => current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? null);
        setListState(rows.length ? "ready" : "empty");
      } catch (caught) {
        if (controller.signal.aborted || (caught instanceof Error && caught.name === "AbortError")) return;
        setError(message(caught));
        setListState("error");
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    async function load() {
      await Promise.resolve();
      const token = getSystemAdminAccessToken();
      if (!token) return;
      setDetailState("loading");
      try {
        setDetail(await fetchHospitalDetail(token, selectedId!, controller.signal));
        setDetailState("ready");
      } catch (caught) {
        if (controller.signal.aborted || (caught instanceof Error && caught.name === "AbortError")) return;
        setError(message(caught));
        setDetailState("error");
      }
    }
    void load();
    return () => controller.abort();
  }, [selectedId]);

  return (
    <div className="grid min-h-[650px] gap-5 lg:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.35fr)]">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold text-slate-900">병원 목록</h2>
            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">{items.length}개</span>
          </div>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="병원명 또는 코드로 검색"
            className="mt-4 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-sky-300 focus:bg-white"
          />
        </div>
        {listState === "loading" ? <StateMessage variant="loading" title="병원 목록을 불러오는 중입니다." className="m-5" /> : null}
        {listState === "empty" ? <StateMessage variant="empty" title="등록된 병원이 없습니다." className="m-5" /> : null}
        {listState === "error" ? <StateMessage variant="error" title="병원 목록을 조회할 수 없습니다." description={error} className="m-5" /> : null}
        {listState === "ready" && filteredItems.length === 0 ? <StateMessage variant="empty" title="검색 결과가 없습니다." className="m-5" /> : null}
        <div className="max-h-[570px] divide-y divide-slate-100 overflow-y-auto">
          {filteredItems.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 border-l-[3px] px-5 py-4 text-left transition hover:bg-sky-50/70 ${selectedId === item.id ? "border-l-sky-500 bg-sky-50" : "border-l-transparent"}`}
            >
              <span className="truncate font-semibold text-slate-900">{item.name}</span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{item.code}</span>
              <span className="col-span-2 text-xs text-slate-500">{item.phone || "전화번호 없음"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {detailState === "idle" ? <StateMessage variant="empty" title="병원을 선택해주세요." /> : null}
        {detailState === "loading" ? <StateMessage variant="loading" title="병원 상세를 불러오는 중입니다." /> : null}
        {detailState === "error" ? <StateMessage variant="error" title="병원 상세를 조회할 수 없습니다." description={error} /> : null}
        {detailState === "ready" && detail ? <HospitalDetailPanel detail={detail} /> : null}
      </section>
    </div>
  );
}

function HospitalDetailPanel({ detail }: { detail: HospitalDetail }) {
  const addressLines = [detail.address, detail.address_detail].filter(Boolean);
  return (
    <>
      <div className="border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Hospital Detail</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900">{detail.name}</h2>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <Info label="병원 코드" value={detail.code} />
          <Info label="전화번호" value={detail.phone || "전화번호 없음"} />
          <div className="sm:col-span-2">
            <Info label="주소" value={addressLines.join(" ") || "주소 없음"} />
            {detail.postal_code ? <p className="mt-1 text-xs text-slate-500">우편번호 {detail.postal_code}</p> : null}
          </div>
        </dl>
      </div>
      <section className="py-5">
        <h3 className="font-bold text-slate-900">부서 및 역할</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {detail.departments.map((department) => (
            <div key={department.id} className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
              <div className="flex justify-between gap-3">
                <span className="font-semibold">{department.name}</span>
                <span className="text-xs text-slate-500">{department.code}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{department.roles.map((role) => role.display_name).join(", ") || "등록된 역할 없음"}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="border-t border-slate-200 pt-5">
        <h3 className="font-bold text-slate-900">HospitalAdmin</h3>
        <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {detail.hospital_admins.map((admin) => (
            <div key={admin.id} className="flex justify-between gap-4 px-4 py-3 text-sm">
              <span>{admin.name} · {admin.login_id}</span>
              <span className="text-slate-500">{admin.account_status}</span>
            </div>
          ))}
          {detail.hospital_admins.length === 0 ? <p className="px-4 py-5 text-sm text-slate-500">등록된 병원 관리자가 없습니다.</p> : null}
        </div>
      </section>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-slate-800">{value}</dd></div>;
}
