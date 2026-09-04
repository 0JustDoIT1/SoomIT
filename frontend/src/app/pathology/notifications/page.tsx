"use client";

import { useState } from "react";

const categories = [
  "전체",
  "읽지 않음",
  "검체 적정성",
  "WSI",
  "AI 작업",
  "의사 판정",
  "보고서",
];

export default function PathologyNotificationsPage() {
  const [category, setCategory] = useState("전체");
  const [period, setPeriod] = useState("TODAY");

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          병리과 알림 센터
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          병리 업무 알림과 관련 작업의 처리 상태를 확인하는 화면입니다.
        </p>
      </div>

      <div className="mt-6 border border-blue-200 bg-blue-50 px-5 py-4">
        <p className="text-sm font-semibold text-blue-900">
          알림 API 연결 대기 중
        </p>
        <p className="mt-1 text-xs leading-5 text-blue-700">
          현재 백엔드에는 알림 데이터 조회 API가 없습니다. 실제 알림 API가
          제공되면 읽음 상태, 우선순위, 관련 Case 및 작업 링크를 연결합니다.
        </p>
      </div>

      <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {["읽지 않음", "오늘 수신", "업무 연결", "추가 확인"].map((label) => (
          <div key={label} className="border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-sm font-semibold text-slate-400">
              데이터 연결 전
            </p>
          </div>
        ))}
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)_340px]">
        <aside className="border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-4">
            <h2 className="text-sm font-semibold text-slate-900">알림 분류</h2>
          </div>
          <nav aria-label="알림 분류" className="space-y-1 p-3">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={`block w-full rounded-md px-3 py-2.5 text-left text-sm ${
                  category === item
                    ? "bg-blue-50 font-semibold text-blue-800"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {item}
              </button>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
            <label className="relative min-w-56 flex-1">
              <span className="sr-only">알림 검색</span>
              <input
                disabled
                placeholder="알림 내용·환자·Case 검색"
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm placeholder:text-slate-400"
              />
            </label>
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="TODAY">오늘</option>
              <option value="WEEK">최근 7일</option>
              <option value="MONTH">최근 30일</option>
            </select>
          </div>

          <div className="flex min-h-[440px] items-center justify-center px-6 text-center">
            <div>
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  className="h-6 w-6"
                >
                  <path d="M6 16h12l-1.5-2v-4.5a4.5 4.5 0 0 0-9 0V14L6 16ZM10 19h4" />
                </svg>
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-700">
                표시할 실제 알림 데이터가 없습니다.
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                선택 분류: {category} · 조회 기간: {period === "TODAY" ? "오늘" : period === "WEEK" ? "최근 7일" : "최근 30일"}
              </p>
            </div>
          </div>
        </section>

        <aside className="border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">알림 상세</h2>
          </div>
          <div className="px-5 py-16 text-center">
            <p className="text-sm font-semibold text-slate-600">
              선택된 알림이 없습니다.
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              알림 API 연결 후 유형, 수신 시각, 관련 환자·Case, 처리 상태를
              표시합니다.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
