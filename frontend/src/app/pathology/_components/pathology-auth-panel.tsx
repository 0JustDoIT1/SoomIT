"use client";

import { usePathologyAuth } from "./pathology-auth-provider";

type PathologyAuthPanelProps = {
  loading: boolean;
  onConnect: () => void;
};

export function PathologyAuthPanel({
  loading,
  onConnect,
}: PathologyAuthPanelProps) {
  const {
    username,
    password,
    isConnected,
    setUsername,
    setPassword,
    disconnect,
  } = usePathologyAuth();

  if (isConnected) {
    return (
      <section className="mt-6 flex items-center justify-between border border-slate-200 bg-white px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">로컬 API 연결됨</p>
          <p className="mt-1 text-xs text-slate-500">
            개발용 Basic Auth · {username} · 비밀번호는 메모리에만 유지됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={disconnect}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          인증 변경
        </button>
      </section>
    );
  }

  return (
    <section className="mt-6 border border-slate-200 bg-white p-5">
      <p className="text-sm font-semibold text-slate-800">로컬 API 인증</p>

      <div className="mt-3 flex flex-wrap gap-3">
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          aria-label="API 사용자 이름"
          placeholder="Username"
          className="w-52 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />

        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          aria-label="API 비밀번호"
          placeholder="Password"
          onKeyDown={(event) => {
            if (event.key === "Enter") onConnect();
          }}
          className="w-52 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />

        <button
          type="button"
          onClick={onConnect}
          disabled={loading || !username || !password}
          className="rounded-md border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "연결 중..." : "API 연결"}
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        현재 개발용 Basic Auth를 사용합니다. 비밀번호는 저장하지 않으며, 인증
        컨텍스트를 교체해 JWT 방식으로 전환할 수 있습니다.
      </p>
    </section>
  );
}
