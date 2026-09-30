"use client";

import { useEffect, useState } from "react";

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type MfdsProduct = {
  item_seq: string;
  item_name: string | null;
  item_ingr_name: string | null;
  main_item_ingr: string | null;
  main_ingr_eng: string | null;
};

export function useMfdsMedicationSearch(base: string, fetcher: AuthorizedFetch, enabled = true) {
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<MfdsProduct[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [settledQuery, setSettledQuery] = useState("");
  const query = search.trim();

  useEffect(() => {
    const controller = new AbortController();
    if (!enabled || query.length < 2) return () => controller.abort();
    const timer = window.setTimeout(() => {
      setLoading(true);
      void fetcher(`${base}/api/doctor/cases/mfds-products/?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(async response => {
          if (!response.ok) throw new Error("MFDS 약품 검색에 실패했습니다.");
          const data = await response.json() as { products?: MfdsProduct[] };
          if (!controller.signal.aborted) {
            setProducts((data.products ?? []).filter(product => product.item_seq && product.item_name));
            setSettledQuery(query);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) { setProducts([]); setError("MFDS 약품 검색에 실패했습니다."); }
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [base, enabled, fetcher, query]);

  const changeSearch = (value: string) => {
    setSearch(value);
    setProducts([]);
    setError("");
    setLoading(false);
    setSettledQuery("");
  };
  return { search, changeSearch, products, error, loading, query, settledQuery };
}

export function mfdsIngredient(product: MfdsProduct) {
  return product.item_ingr_name || product.main_item_ingr || product.main_ingr_eng || "";
}
