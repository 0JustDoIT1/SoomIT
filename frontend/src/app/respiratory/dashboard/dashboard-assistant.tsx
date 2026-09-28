"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./dashboard.module.css";

import { LoadingIndicator } from "@/components/common/loading-indicator";
import { API_BASE_URL } from "../_lib/respiratory-api";
import type { DashboardCase } from "./dashboard-work-queues";

type AuthorizedFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
  references?: CaseReference[];
  display?: "quick";
};

type CaseReference = {
  case_code: string;
  current_stage: string;
  status: string;
  short_status: string;
};

type AssistantResponse = {
  answer?: unknown;
  case_references?: unknown;
};

const QUICK_ACTIONS = [
  "오늘 확인할 Case",
  "결과 대기 Case",
  "치료 결정 대기",
  "처방 단계 Case",
] as const;

const ERROR_MESSAGE = "AI Assistant 응답을 불러오지 못했습니다.";

export function DashboardAssistant({
  cases,
  authorizedFetch,
  onOpenCase,
}: {
  cases: DashboardCase[];
  authorizedFetch: AuthorizedFetch;
  onOpenCase: (caseId: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(true);
  const requestController = useRef<AbortController | null>(null);

  useEffect(
    () => () => requestController.current?.abort(),
    [],
  );

  async function sendQuestion(
    rawQuestion: string,
    { replaceConversation = false }: { replaceConversation?: boolean } = {},
  ) {
    const message = rawQuestion.trim();
    if (!message || loading) return;

    const history = (replaceConversation ? [] : messages.slice(-20)).map(({ role, content }) => ({
      role,
      content,
    }));
    const userMessage: AssistantMessage = { role: "user", content: message, display: replaceConversation ? "quick" : undefined };
    setMessages((current) => replaceConversation ? [userMessage] : [...current, userMessage]);
    setQuestion("");
    setError("");
    setLoading(true);

    const controller = new AbortController();
    requestController.current?.abort();
    requestController.current = controller;

    try {
      const response = await authorizedFetch(
        `${API_BASE_URL}/api/doctor/cases/dashboard-assistant/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, history }),
          signal: controller.signal,
        },
      );
      const payload: AssistantResponse = await response.json().catch(() => ({}));
      if (controller.signal.aborted || requestController.current !== controller) return;
      if (!response.ok || typeof payload.answer !== "string" || !payload.answer.trim()) {
        throw new Error(ERROR_MESSAGE);
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: payload.answer as string,
          references: readCaseReferences(payload.case_references),
        },
      ]);
    } catch (cause) {
      if (!controller.signal.aborted && requestController.current === controller && !(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(ERROR_MESSAGE);
      }
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
        setLoading(false);
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendQuestion(question);
  }

  function closeAssistant() {
    requestController.current?.abort();
    requestController.current = null;
    setLoading(false);
    setIsOpen(false);
  }

  if (!isOpen) {
    return (
      <section
        aria-labelledby="dashboard-assistant-title"
        className="w-full min-w-0 rounded-xl border border-blue-100 bg-gradient-to-r from-white to-blue-50/60 px-4 py-3 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="dashboard-assistant-title" className="text-base font-semibold text-slate-900">
            의사 AI Assistant
          </h3>
          <button
            type="button"
            aria-expanded="false"
            aria-controls="dashboard-assistant-content"
            onClick={() => setIsOpen(true)}
            className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
          >
            AI Assistant 열기
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="dashboard-assistant-title"
      className="w-full min-w-0 overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm"
    >
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 border-b border-blue-100 bg-gradient-to-r from-blue-50/80 via-white to-cyan-50/50 px-3.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-700 to-cyan-500 text-white shadow-sm" aria-hidden="true">
            <AssistantIcon />
          </span>
          <div>
          <h3 id="dashboard-assistant-title" className="text-sm font-bold text-slate-900">
            의사 AI Assistant
          </h3>
            <p className="text-[11px] text-slate-500">담당 Case 조회 및 업무 요약</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-blue-100 bg-white/90 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-blue-700 shadow-sm">
          Read-only
        </span>
        <button
          type="button"
          aria-expanded="true"
          aria-controls="dashboard-assistant-content"
          onClick={closeAssistant}
          className="ml-auto rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:border-blue-200 hover:text-blue-700"
        >
          대화 닫기
        </button>
      </div>

      <div id="dashboard-assistant-content" className="grid gap-2.5 p-3">
      <div className="flex min-h-8 items-center gap-2 overflow-x-auto" aria-label="빠른 질문">
          <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">빠른 질문</span>
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              disabled={loading}
              onClick={() => void sendQuestion(action, { replaceConversation: true })}
              className="shrink-0 rounded-full border border-blue-100 bg-blue-50/60 px-3 py-1.5 text-[11px] font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 disabled:opacity-50"
            >
              {action}
            </button>
          ))}
      </div>

      {(messages.length > 0 || loading || error) && (
        <div
          aria-live="polite"
          className="max-h-[310px] space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-3 [overflow-wrap:anywhere]"
        >
          {messages.map((message, index) => message.display === "quick" ? (
            <p key={`${message.role}-${index}`} className="sr-only">{message.content}</p>
          ) : (
            <article
              key={`${message.role}-${index}`}
              className={
                message.role === "user"
                  ? "ml-auto max-w-[70%] rounded-xl rounded-tr-sm bg-[#2f6f9f] px-3.5 py-2 text-sm leading-6 text-white"
                  : "rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700"
              }
            >
              {message.role === "assistant" ? (
                <div>
                  <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-blue-600" aria-hidden="true"><AssistantIcon small /></span>
                    <span className="text-[11px] font-bold text-blue-700">AI 요약</span>
                  </div>
                  <AssistantText content={message.content} />
                </div>
              ) : (
                <p>{message.content}</p>
              )}

              {message.references?.map((reference) => {
                const caseItem = cases.find(
                  (item) => item.case_code === reference.case_code,
                );
                if (!caseItem) return null;
                return (
                  <div
                    key={reference.case_code}
                    className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 transition hover:border-blue-200"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800">{reference.case_code}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {reference.current_stage} · {reference.short_status}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenCase(caseItem.id)}
                      className="shrink-0 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-600 hover:text-white"
                    >
                      Case 열기
                    </button>
                  </div>
                );
              })}
            </article>
          ))}

          {loading && (
            <LoadingIndicator
              label="AI Assistant가 담당 Case를 확인하고 있습니다."
              className="min-h-14 border-0 bg-white text-xs"
            />
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {error}
            </p>
          )}
        </div>
      )}

      <form onSubmit={submit} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-1.5 shadow-inner focus-within:border-blue-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 max-sm:flex-col max-sm:items-stretch">
        <label className="sr-only" htmlFor="dashboard-assistant-question">
          Assistant 질문
        </label>
        <input
          id="dashboard-assistant-question"
          value={question}
          disabled={loading}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="담당 Case에 대해 질문하세요"
          maxLength={4000}
          className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:text-slate-400"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="shrink-0 rounded-lg bg-gradient-to-r from-blue-700 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-blue-800 hover:to-blue-700 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
        >
          전송
        </button>
      </form>
      </div>
    </section>
  );
}

function AssistantIcon({ small = false }: { small?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={small ? "h-3.5 w-3.5" : "h-5 w-5"}>
      <path d="M12 3v3M5.6 5.6l2.1 2.1M18.4 5.6l-2.1 2.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="4" y="8" width="16" height="12" rx="4" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9" cy="13" r="1" fill="currentColor" />
      <circle cx="15" cy="13" r="1" fill="currentColor" />
      <path d="M9 17h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function AssistantText({ content }: { content: string }) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          hr: () => null,
          a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
          table: ({ children }) => <div className="overflow-x-auto"><table>{children}</table></div>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function readCaseReferences(value: unknown): CaseReference[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CaseReference => {
    if (!item || typeof item !== "object") return false;
    const reference = item as Partial<CaseReference>;
    return (
      typeof reference.case_code === "string" &&
      typeof reference.current_stage === "string" &&
      typeof reference.status === "string" &&
      typeof reference.short_status === "string"
    );
  });
}
