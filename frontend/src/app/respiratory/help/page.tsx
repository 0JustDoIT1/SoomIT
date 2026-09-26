"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const QUICK_LINKS = [
  { href: "/respiratory/dashboard", icon: "⌂", title: "오늘 업무 시작", description: "우선순위 Case와 현재 대기 업무를 확인합니다." },
  { href: "/respiratory/cases", icon: "▤", title: "환자 Case 찾기", description: "환자·Case 번호로 검색하고 현재 단계를 엽니다." },
  { href: "/respiratory/schedules", icon: "□", title: "진료 일정 확인", description: "예약과 검사 일정을 월간 화면에서 확인합니다." },
  { href: "/respiratory/consultations", icon: "↔", title: "협진 요청 확인", description: "요청·진행·완료된 협진을 확인합니다." },
];

const WORKFLOW = [
  { code: "XRAY", label: "X-ray", hint: "영상과 AI 후보 검토" },
  { code: "CT", label: "CT", hint: "결절 위치·크기 확정" },
  { code: "PET_CT_TNM", label: "PET-CT · TNM", hint: "TNM 및 병기 확정" },
  { code: "PATHOLOGY_GENE", label: "조직 · 유전자", hint: "병리·유전자 결과 확정" },
  { code: "PDL1", label: "PD-L1", hint: "TPS 결과 확정" },
  { code: "TREATMENT", label: "치료 결정", hint: "치료 계획·Regimen 확정" },
  { code: "PRESCRIPTION", label: "처방", hint: "Safety Check 후 최종 확정" },
];

const GUIDES = [
  {
    id: "result-trust",
    category: "결과 해석",
    title: "AI 결과와 의료진 확정 결과는 어떻게 구분하나요?",
    summary: "AI 표시는 검토 후보이며, 진료 흐름을 진행시키는 기준은 의료진이 확정한 임상 결과입니다.",
    points: [
      "‘AI 후보’, 점선 박스, 확률 표시는 확정 진단이 아닙니다.",
      "‘확정 결과’ 배지와 확정 시각이 있는 값만 다음 단계의 근거로 사용합니다.",
      "AI와 확정 결과가 다르면 확정 결과를 우선하고, 상세 근거에서 차이를 확인합니다.",
    ],
  },
  {
    id: "lesion-display",
    category: "영상",
    title: "대시보드 병변 표시는 무엇을 의미하나요?",
    summary: "흉부 그림의 번호는 확정 CT에 기록된 폐엽 위치를 간단히 보여주는 요약입니다.",
    points: [
      "우상엽·우중엽·우하엽·좌상엽·좌하엽 위치만 해부도에 대응합니다.",
      "X-ray 박스는 AI 검출 후보이므로 영상 상세에서 의료진 확인이 필요합니다.",
      "정확한 좌표·윤곽·크기는 Case의 CT DICOM/분할 화면에서 확인합니다.",
    ],
  },
  {
    id: "stage-blocked",
    category: "진료 흐름",
    title: "다음 단계로 넘어가지 않을 때 무엇을 확인하나요?",
    summary: "현재 단계의 필수 결과가 확정됐는지, 필요한 검사 오더가 활성 상태인지 확인합니다.",
    points: [
      "상단 현재 단계와 화면에 선택된 과거 검사 탭은 서로 다를 수 있습니다.",
      "DRAFT나 AI 완료 상태만으로는 다음 단계가 열리지 않습니다.",
      "오더가 취소·실패 상태이면 현재 단계에서 재검사 또는 다음 처리 버튼을 확인합니다.",
    ],
  },
  {
    id: "treatment-prescription",
    category: "치료 · 처방",
    title: "치료 결정과 처방 확정 순서는 어떻게 되나요?",
    summary: "치료 계획을 확정한 뒤 처방을 작성하고, Safety Check를 통과한 처방만 최종 확정합니다.",
    points: [
      "약물 치료는 현재 후보 중 Regimen을 선택해야 치료 계획을 확정할 수 있습니다.",
      "처방을 수정하면 기존 Safety Check 결과가 더 이상 최신인지 다시 확인합니다.",
      "최종 확정된 처방은 조회 전용이며, 임의로 수정할 수 없습니다.",
    ],
  },
  {
    id: "consultation-notification",
    category: "협업",
    title: "협진과 알림은 어떻게 사용하나요?",
    summary: "협진 질문에는 필요한 임상 맥락을 적고, 알림을 열어 해당 Case로 바로 이동할 수 있습니다.",
    points: [
      "협진 요청 전 현재 단계, 질문, 우선순위를 확인합니다.",
      "읽지 않은 알림 수는 왼쪽 메뉴와 상단 알림 버튼에 동기화됩니다.",
      "Case 채팅 알림은 해당 대화 위치로 이동하며, 비공개 수신자 설정을 확인합니다.",
    ],
  },
  {
    id: "retry-errors",
    category: "문제 해결",
    title: "이미지나 결과를 불러오지 못하면 어떻게 하나요?",
    summary: "현재 입력을 유지한 채 재시도하고, 반복되면 Case 번호와 발생 시각을 함께 기록합니다.",
    points: [
      "먼저 카드 또는 패널의 ‘다시 시도’를 사용합니다.",
      "페이지를 새로고침한 뒤에도 현재 단계와 확정 상태가 같은지 확인합니다.",
      "반복 오류 신고 시 환자 이름 대신 Case 번호, 화면 주소, 시각, 오류 문구를 전달합니다.",
    ],
  },
];

export default function RespiratoryHelpPage() {
  const [query, setQuery] = useState("");
  const keyword = query.trim().toLocaleLowerCase("ko-KR");
  const guides = useMemo(() => keyword ? GUIDES.filter((guide) => [guide.category, guide.title, guide.summary, ...guide.points].join(" ").toLocaleLowerCase("ko-KR").includes(keyword)) : GUIDES, [keyword]);

  return (
    <div className="h-full overflow-y-auto bg-[#f3f7fd]">
      <div className="mx-auto w-full max-w-[1380px] px-4 py-6 lg:px-7 lg:py-8">
        <header className="overflow-hidden rounded-2xl border border-blue-100 bg-[linear-gradient(120deg,#ffffff_0%,#eff8ff_55%,#e8f7f4_100%)] p-6 shadow-sm lg:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">SoomIT Clinical Guide</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 lg:text-3xl">호흡기내과 도움말</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">진료 단계, 영상 근거, AI 후보와 확정 결과의 차이를 빠르게 확인하세요.</p>
            </div>
            <label className="block w-full max-w-md">
              <span className="sr-only">도움말 검색</span>
              <span className="flex h-11 items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
                <span aria-hidden="true" className="text-slate-400">⌕</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="예: 다음 단계, 병변, Safety Check" className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" />
              </span>
            </label>
          </div>
        </header>

        <section aria-labelledby="quick-start-title" className="mt-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-blue-700">QUICK START</p>
              <h2 id="quick-start-title" className="mt-1 text-lg font-black text-slate-900">바로 시작하기</h2>
            </div>
            <p className="hidden text-xs text-slate-500 md:block">원하는 화면으로 이동합니다.</p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {QUICK_LINKS.map((item) => <Link key={item.href} href={item.href} className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-lg font-bold text-blue-700 transition group-hover:bg-blue-600 group-hover:text-white">{item.icon}</span>
              <span className="mt-3 block text-sm font-bold text-slate-800">{item.title}</span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span>
            </Link>)}
          </div>
        </section>

        <section aria-labelledby="workflow-title" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold text-teal-700">WORKFLOW</p>
              <h2 id="workflow-title" className="mt-1 text-lg font-black text-slate-900">진료 단계 한눈에 보기</h2>
            </div>
            <p className="text-xs text-slate-500">각 단계의 확정 결과가 다음 단계 진행의 기준입니다.</p>
          </div>
          <ol className="mt-5 grid gap-2 md:grid-cols-4 xl:grid-cols-7">
            {WORKFLOW.map((step, index) => <li key={step.code} className="relative rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-black text-white">{index + 1}</span>
                <p className="text-xs font-bold text-slate-800">{step.label}</p>
              </div>
              <p className="mt-2 text-[11px] leading-4 text-slate-500">{step.hint}</p>
              {index < WORKFLOW.length - 1 && <span aria-hidden="true" className="absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 text-xs font-bold text-slate-300 xl:block">›</span>}
            </li>)}
          </ol>
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-labelledby="guide-title">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-blue-700">GUIDE</p>
                <h2 id="guide-title" className="mt-1 text-lg font-black text-slate-900">업무별 안내</h2>
              </div>
              <span className="text-xs font-semibold text-slate-500">{guides.length}개 항목</span>
            </div>
            {guides.length ? <div className="mt-3 space-y-2">
              {guides.map((guide) => <details key={guide.id} className="group rounded-xl border border-slate-200 bg-white shadow-sm open:border-blue-200 open:ring-1 open:ring-blue-50">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 marker:hidden">
                  <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">{guide.category}</span>
                  <span className="min-w-0 flex-1 text-sm font-bold text-slate-800">{guide.title}</span>
                  <span aria-hidden="true" className="text-lg text-slate-400 transition group-open:rotate-45">＋</span>
                </summary>
                <div className="border-t border-slate-100 px-4 py-4">
                  <p className="text-sm font-medium leading-6 text-slate-700">{guide.summary}</p>
                  <ul className="mt-3 space-y-2">
                    {guide.points.map((point) => <li key={point} className="flex gap-2 text-xs leading-5 text-slate-600"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />{point}</li>)}
                  </ul>
                </div>
              </details>)}
            </div> : <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
              <p className="text-sm font-bold text-slate-700">검색 결과가 없습니다.</p>
              <p className="mt-1 text-xs text-slate-500">다른 단어로 검색하거나 검색어를 지워보세요.</p>
            </div>}
          </section>

          <aside className="space-y-4">
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <p className="text-xs font-black text-amber-800">환자 안전 원칙</p>
              <p className="mt-2 text-xs leading-5 text-amber-900">이 시스템의 AI 결과와 시각화는 의료진 검토를 돕는 자료입니다. 확정 진단·처방·응급 판단은 원본 자료와 기관 지침을 기준으로 결정하세요.</p>
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black text-slate-900">문제 신고 전 준비</h2>
              <ol className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
                <li><strong className="text-slate-800">1.</strong> Case 번호와 현재 단계</li>
                <li><strong className="text-slate-800">2.</strong> 오류가 발생한 시각과 화면 주소</li>
                <li><strong className="text-slate-800">3.</strong> 직전에 수행한 버튼 또는 작업</li>
                <li><strong className="text-slate-800">4.</strong> 표시된 오류 문구</li>
              </ol>
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-500">불필요한 환자 이름·민감정보는 화면 캡처에 포함하지 마세요.</p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
