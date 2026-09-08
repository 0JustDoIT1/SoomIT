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
  authorizationHeader: string | null;
  setUsername: (username: string) => void;
  setPassword: (password: string) => void;
  markConnected: () => void;
  disconnect: () => void;
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

export class PathologyApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly kind: "authentication" | "permission" | "network" | "response",
  ) {
    super(message);
    this.name = "PathologyApiError";
  }
}

const PathologyAuthContext = createContext<PathologyAuthContextValue | null>(
  null,
);

export function PathologyAuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState("pathology_local");
  const [password, setPassword] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  const authorizedFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      if (!username || !password) {
        throw new PathologyApiError(
          "API 조회를 위해 로컬 테스트 계정을 입력해 주세요.",
          null,
          "authentication",
        );
      }

      const token = btoa(
        unescape(encodeURIComponent(`${username}:${password}`)),
      );
      const headers = new Headers(init.headers);

      headers.set("Accept", "application/json");
      headers.set("Authorization", `Basic ${token}`);

      let response: Response;

      try {
        response = await fetch(input, { ...init, headers, cache: "no-store" });
      } catch {
        throw new PathologyApiError(
          "병리 API 서버에 연결할 수 없습니다. 서버 실행 상태와 네트워크를 확인해 주세요.",
          null,
          "network",
        );
      }

      if (response.status === 401) {
        setPassword("");
        setIsConnected(false);
        throw new PathologyApiError(
          "인증 정보가 올바르지 않거나 만료되었습니다. 계정 정보를 다시 입력해 주세요.",
          response.status,
          "authentication",
        );
      }

      if (response.status === 403) {
        throw new PathologyApiError(
          "이 병리 정보에 접근할 권한이 없습니다. 계정 권한을 확인해 주세요.",
          response.status,
          "permission",
        );
      }

      if (!response.ok) {
        throw new PathologyApiError(
          `병리 API 요청에 실패했습니다. (${response.status})`,
          response.status,
          "response",
        );
      }

      return response;
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
      authorizationHeader:
        username && password
          ? `Basic ${btoa(unescape(encodeURIComponent(`${username}:${password}`)))}`
          : null,
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
