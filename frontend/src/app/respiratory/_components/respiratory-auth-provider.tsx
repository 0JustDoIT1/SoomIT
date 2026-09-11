"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { staffAuthenticatedFetch } from "../../../lib/api";
import type { LoginUser } from "@/types/auth";

type ContextValue = { user: LoginUser | null; isAuthenticated: boolean; isReady: boolean; logout: () => void; authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> };
const Context = createContext<ContextValue | null>(null);
const PREVIEW_ENABLED =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_RESPIRATORY_PREVIEW === "true";

export function RespiratoryAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<LoginUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let nextUser: LoginUser | null = null;
    const storedUser = sessionStorage.getItem("user");
    const accessToken = sessionStorage.getItem("accessToken");

    if (storedUser && accessToken) {
      try {
        nextUser = JSON.parse(storedUser) as LoginUser;
      } catch {
        sessionStorage.removeItem("user");
      }
    }

    const initializationTimer = window.setTimeout(() => {
      setUser(nextUser);
      setIsReady(true);
      if (!nextUser && !PREVIEW_ENABLED) router.replace("/login");
    }, 0);

    return () => window.clearTimeout(initializationTimer);
  }, [router]);

  const logout = useCallback(() => {
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("refreshToken");
    sessionStorage.removeItem("user");
    setUser(null);
    router.replace("/login");
  }, [router]);

  const authorizedFetch = useCallback((input: RequestInfo | URL, init: RequestInit = {}) => {
    if (PREVIEW_ENABLED && !sessionStorage.getItem("accessToken")) {
      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");
      return fetch(input, { ...init, headers, cache: "no-store" });
    }

    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    return staffAuthenticatedFetch(input, {
      ...init,
      headers,
      cache: "no-store",
    });
  }, []);

  const value = useMemo(
    () => ({ user, isAuthenticated: Boolean(user) || PREVIEW_ENABLED, isReady, logout, authorizedFetch }),
    [authorizedFetch, isReady, logout, user],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useRespiratoryAuth() { const value = useContext(Context); if (!value) throw new Error("RespiratoryAuthProvider가 필요합니다."); return value; }
