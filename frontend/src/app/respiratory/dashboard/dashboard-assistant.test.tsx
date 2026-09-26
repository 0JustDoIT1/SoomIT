import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DashboardAssistant } from "./dashboard-assistant";

const cases = [
  {
    id: "case-id-1",
    case_code: "RADPT0002",
    patient_name: "환자 A",
    patient_code: "P-1",
    current_stage: "CT",
    case_status: "ACTIVE",
  },
];

describe("DashboardAssistant", () => {
  it("renders quick actions, shows local loading, and opens a referenced known Case", async () => {
    let resolveRequest!: (response: Response) => void;
    const authorizedFetch = vi.fn(
      () => new Promise<Response>((resolve) => { resolveRequest = resolve; }),
    );
    const onOpenCase = vi.fn();

    render(
      <DashboardAssistant
        cases={cases}
        authorizedFetch={authorizedFetch}
        onOpenCase={onOpenCase}
      />,
    );

    expect(screen.getByRole("heading", { name: "의사 AI Assistant" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "결과 대기 Case" }));

    expect(screen.getByRole("status")).toHaveTextContent("AI Assistant가 담당 Case를 확인하고 있습니다.");
    expect(authorizedFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/doctor/cases/dashboard-assistant/"),
      expect.objectContaining({ method: "POST" }),
    );

    await act(async () => {
      resolveRequest(new Response(JSON.stringify({
        answer: "확인이 필요한 Case 1건\n* RADPT0002 — CT 검사 결과 대기",
        case_references: [{
          case_code: "RADPT0002",
          current_stage: "CT",
          status: "ACTIVE",
          short_status: "CT 검사 결과 대기",
        }],
      }), { status: 200 }));
    });

    expect(await screen.findByText("확인이 필요한 Case 1건")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Case 열기" }));
    expect(onOpenCase).toHaveBeenCalledWith("case-id-1");
  });

  it("submits a typed question and includes prior conversation as history", async () => {
    const authorizedFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ answer: "첫 답변", case_references: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ answer: "두 번째 답변", case_references: [] }), { status: 200 }));

    render(
      <DashboardAssistant cases={cases} authorizedFetch={authorizedFetch} onOpenCase={vi.fn()} />,
    );

    const input = screen.getByLabelText("Assistant 질문");
    fireEvent.change(input, { target: { value: "첫 질문" } });
    fireEvent.click(screen.getByRole("button", { name: "전송" }));
    expect(await screen.findByText("첫 답변")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "후속 질문" } });
    fireEvent.click(screen.getByRole("button", { name: "전송" }));
    await screen.findByText("두 번째 답변");

    const secondRequest = JSON.parse(String(authorizedFetch.mock.calls[1][1]?.body));
    expect(secondRequest).toMatchObject({
      message: "후속 질문",
      history: [
        { role: "user", content: "첫 질문" },
        { role: "assistant", content: "첫 답변" },
      ],
    });
  });

  it("shows a non-blocking error while keeping the assistant usable", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "upstream failure" }), { status: 502 }),
    );

    render(
      <DashboardAssistant cases={cases} authorizedFetch={authorizedFetch} onOpenCase={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Assistant 질문"), { target: { value: "상태 알려줘" } });
    fireEvent.click(screen.getByRole("button", { name: "전송" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("AI Assistant 응답을 불러오지 못했습니다.");
    await waitFor(() => expect(screen.getByLabelText("Assistant 질문")).toBeEnabled());
  });

  it("renders basic Markdown response structure without exposing Markdown syntax", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        answer: "## Cases needing review\n---\n- **RADPT0002** — result pending",
        case_references: [],
      }), { status: 200 }),
    );

    render(
      <DashboardAssistant cases={cases} authorizedFetch={authorizedFetch} onOpenCase={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText("Assistant 질문"), { target: { value: "Show cases" } });
    fireEvent.click(screen.getByRole("button", { name: "전송" }));

    expect(await screen.findByText("Cases needing review")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === "RADPT0002 — result pending")).toBeInTheDocument();
    expect(screen.queryByText("---")).not.toBeInTheDocument();
  });
});
