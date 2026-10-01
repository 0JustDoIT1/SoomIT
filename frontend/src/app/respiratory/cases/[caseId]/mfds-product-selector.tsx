"use client";

import { useState } from "react";
import type { AuthorizedFetch } from "./treatment-prescription-types";

type Product = {
  item_seq: string;
  item_name?: string;
  entp_name?: string;
  item_ingr_name?: string;
  approval_status: string;
};

type Props = {
  ingredientName?: string | null;
  selectedItemSeq?: string | null;
  apiBaseUrl: string;
  authorizedFetch: AuthorizedFetch;
  onSelect: (itemSeq: string) => Promise<void>;
};

export function MfdsProductSelector({
  ingredientName,
  selectedItemSeq,
  apiBaseUrl,
  authorizedFetch,
  onSelect,
}: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const search = async () => {
    if (!ingredientName?.trim()) {
      setError("성분명이 없어 제품을 검색할 수 없습니다.");
      return;
    }

    setOpen(true);
    setBusy(true);
    setError("");

    try {
      const response = await authorizedFetch(
        `${apiBaseUrl}/api/doctor/cases/mfds-products/?ingredient_name=${encodeURIComponent(ingredientName.trim())}`,
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "MFDS 제품 검색에 실패했습니다.");
      }
      setProducts(data.products ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "MFDS 제품 검색에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1 space-y-1">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <span>{selectedItemSeq ? "제품 연결됨" : "제품 미선택"}</span>
        <button type="button" onClick={() => void search()} className="rounded border px-2 py-1 text-xs">
          제품 선택
        </button>
      </div>
      {open && (
        <div className="space-y-1 rounded border bg-slate-50 p-2">
          {busy && <p className="text-sm text-slate-500">제품 검색 중...</p>}
          {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
          {!busy && !error && products.length === 0 && <p className="text-sm text-slate-500">검색 결과가 없습니다.</p>}
          {products.map((product) => (
            <button
              type="button"
              key={product.item_seq}
              onClick={() => void onSelect(product.item_seq)}
              className="block w-full rounded border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-blue-200 hover:bg-blue-50/40"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-800">
                    {product.item_name || "제품명 없음"} · {product.entp_name || "제조사 정보 없음"}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {product.item_ingr_name || "성분 정보 없음"}
                  </span>
                </span>
                {product.approval_status === "WITHDRAWN_OR_CANCELLED" && (
                  <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                    허가 취소·취하
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
