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
  const requestController = useRef<AbortController | null>(null);

  useEffect(
    () => () => requestController.current?.abort(),
    [],
  );

  async function sendQuestion(rawQuestion: string) {
    const message = rawQuestion.trim();
    if (!message || loading) return;

    const history = messages.slice(-20).map(({ role, content }) => ({
      role,
      content,
    }));
    const userMessage: AssistantMessage = { role: "user", content: message };
    setMessages((current) => [...current, userMessage]);
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
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
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

  return (
    <section
      aria-labelledby="dashboard-assistant-title"
      className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-4 sm:px-5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 id="dashboard-assistant-title" className="text-base font-semibold text-slate-900">
            의사 AI Assistant
          </h3>
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-blue-600">
            Read-only AI
          </span>
        </div>
        <span className="shrink-0 rounded-full bg-blue-100/70 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
          조회 전용
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2" aria-label="빠른 질문">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              disabled={loading}
              onClick={() => void sendQuestion(action)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
            >
              {action}
            </button>
          ))}
      </div>

      {(messages.length > 0 || loading || error) && (
        <div
          aria-live="polite"
          className="mt-4 max-h-80 space-y-3 overflow-auto rounded-xl border border-slate-200 bg-white p-4 [overflow-wrap:anywhere]"
        >
          {messages.map((message, index) => (
            <article
              key={`${message.role}-${index}`}
              className={
                message.role === "user"
                  ? "ml-8 rounded-lg bg-blue-600 px-3 py-2 text-sm leading-6 text-white"
                  : "mr-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm leading-6 text-slate-700"
              }
            >
              {message.role === "assistant" ? (
                <AssistantText content={message.content} />
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
                    className="mt-2 flex items-center justify-between gap-3 rounded-md border border-blue-100 bg-blue-50/70 px-3 py-2"
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
                      className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
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

      <form onSubmit={submit} className="mt-3 flex gap-2 max-sm:flex-col">
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
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          전송
        </button>
      </form>
    </section>
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
