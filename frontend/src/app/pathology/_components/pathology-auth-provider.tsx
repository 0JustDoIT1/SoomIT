"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type PathologyAuthContextValue = {
  username: string;
  password: string;
  isConnected: boolean;
  setUsername: (username: string) => void;
  setPassword: (password: string) => void;
  markConnected: () => void;
  disconnect: () => void;
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const PathologyAuthContext = createContext<PathologyAuthContextValue | null>(
  null,
);

export function PathologyAuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState("pathology_local");
  const [password, setPassword] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  const authorizedFetch = useCallback(
    (input: RequestInfo | URL, init: RequestInit = {}) => {
      if (!username || !password) {
        return Promise.reject(
          new Error("API 조회를 위해 로컬 테스트 계정을 입력해 주세요."),
        );
      }

      const token = btoa(
        unescape(encodeURIComponent(`${username}:${password}`)),
      );
      const headers = new Headers(init.headers);

      headers.set("Accept", "application/json");
      headers.set("Authorization", `Basic ${token}`);

      return fetch(input, { ...init, headers, cache: "no-store" });
    },
    [password, username],
  );

  const disconnect = useCallback(() => {
    setPassword("");
    setIsConnected(false);
  }, []);

  const value = useMemo(
    () => ({
      username,
      password,
      isConnected,
      setUsername,
      setPassword,
      markConnected: () => setIsConnected(true),
      disconnect,
      authorizedFetch,
    }),
    [authorizedFetch, disconnect, isConnected, password, username],
  );

  return (
    <PathologyAuthContext.Provider value={value}>
      {children}
    </PathologyAuthContext.Provider>
  );
}

export function usePathologyAuth() {
  const context = useContext(PathologyAuthContext);

  if (!context) {
    throw new Error("usePathologyAuth must be used within PathologyAuthProvider.");
  }

  return context;
}
