import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CaseChatPanel, mergeChatMessages } from "./case-chat-panel";

type SocketHandler = ((event: Event) => void) | null;

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.OPEN;
  onopen: SocketHandler = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: SocketHandler = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  sent: string[] = [];

  constructor(public url: string, public protocols?: string | string[]) {
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }
}

const sender = { id: "user-1", name: "담당의", department: "PULMONOLOGY", role: "DOCTOR" };

function message(id: string, createdAt: string, body = id, clientMessageId?: string) {
  return {
    id,
    case_id: "case-a",
    client_message_id: clientMessageId,
    sender,
    body,
    created_at: createdAt,
  };
}

function jsonResponse(payload: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => payload } as Response);
}

function createAuthorizedFetch(history = [message("history-1", "2026-09-25T01:00:00Z", "기존 메시지")]) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/consultations/")) return jsonResponse([]);
    if (url.includes("/recipients/")) return jsonResponse([]);
    if (url.includes("/unread-count/")) return jsonResponse({ unread_count: 0 });
    if (url.includes("/messages/read/")) return jsonResponse({ marked_count: 0 });
    if (url.includes("/messages/")) return jsonResponse({ results: history, next_cursor: null });
    return jsonResponse({});
  });
}

describe("CaseChatPanel", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
    window.sessionStorage.setItem("accessToken", "staff.jwt.token");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  it("deduplicates REST and socket messages and orders them by server timestamp and id", () => {
    const merged = mergeChatMessages(
      [message("b", "2026-09-25T02:00:00Z")],
      [
        message("b", "2026-09-25T02:00:00Z", "updated"),
        message("c", "2026-09-25T02:00:00Z"),
        message("a", "2026-09-25T01:00:00Z"),
      ],
    );

    expect(merged.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(merged[1].body).toBe("updated");
  });

  it("keeps input until the persisted socket acknowledgement and blocks rapid duplicate submits", async () => {
    const authorizedFetch = createAuthorizedFetch();
    render(<CaseChatPanel caseId="case-a" authorizedFetch={authorizedFetch} initiallyOpen />);

    const socket = MockWebSocket.instances[0];
    expect(socket.url).not.toContain("token=");
    expect(socket.protocols).toEqual(["soomit-chat", "staff.jwt.token"]);

    await act(async () => socket.onopen?.(new Event("open")));
    expect(await screen.findByText("기존 메시지")).toBeInTheDocument();

    const input = screen.getByPlaceholderText("Case 메시지를 입력하세요.");
    fireEvent.change(input, { target: { value: "  새 메시지  " } });
    const sendButton = screen.getByRole("button", { name: "메시지 전송" });
    fireEvent.click(sendButton);
    fireEvent.click(sendButton);

    const creates = socket.sent.map((item) => JSON.parse(item)).filter((item) => item.type === "chat.message.create");
    expect(creates).toHaveLength(1);
    expect(input).toHaveValue("  새 메시지  ");
    expect(sendButton).toBeDisabled();

    const stored = message("stored-1", "2026-09-25T03:00:00Z", "새 메시지", creates[0].client_message_id);
    await act(async () => socket.onmessage?.(new MessageEvent("message", {
      data: JSON.stringify({ type: "chat.message.created", message: stored }),
    })));
    await waitFor(() => expect(input).toHaveValue(""));
    expect(screen.getAllByText("새 메시지")).toHaveLength(1);

    await act(async () => socket.onmessage?.(new MessageEvent("message", {
      data: JSON.stringify({ type: "chat.message.created", message: stored }),
    })));
    expect(screen.getAllByText("새 메시지")).toHaveLength(1);
  });

  it("retains a failed message for retry instead of presenting it as saved", async () => {
    render(<CaseChatPanel caseId="case-a" authorizedFetch={createAuthorizedFetch([])} initiallyOpen />);
    const socket = MockWebSocket.instances[0];
    await act(async () => socket.onopen?.(new Event("open")));

    const input = screen.getByPlaceholderText("Case 메시지를 입력하세요.");
    fireEvent.change(input, { target: { value: "저장 실패 메시지" } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 전송" }));

    await act(async () => socket.onmessage?.(new MessageEvent("message", {
      data: JSON.stringify({ type: "chat.error", detail: "메시지를 저장할 수 없습니다." }),
    })));

    expect(input).toHaveValue("저장 실패 메시지");
    expect(input).not.toBeDisabled();
    expect(screen.getByText("메시지를 저장할 수 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("저장 실패 메시지", { selector: "p" })).not.toBeInTheDocument();
  });

  it("reconnects once, refetches missed history, and retries a pending client idempotently", async () => {
    vi.useFakeTimers();
    const authorizedFetch = createAuthorizedFetch([]);
    const { unmount } = render(
      <CaseChatPanel caseId="case-a" authorizedFetch={authorizedFetch} initiallyOpen />,
    );
    const firstSocket = MockWebSocket.instances[0];
    await act(async () => firstSocket.onopen?.(new Event("open")));

    const input = screen.getByPlaceholderText("Case 메시지를 입력하세요.");
    fireEvent.change(input, { target: { value: "재연결 메시지" } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 전송" }));
    const firstCreate = firstSocket.sent.map((item) => JSON.parse(item)).find((item) => item.type === "chat.message.create");

    await act(async () => {
      firstSocket.onclose?.({ code: 1006 } as CloseEvent);
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(MockWebSocket.instances).toHaveLength(2);

    const secondSocket = MockWebSocket.instances[1];
    await act(async () => secondSocket.onopen?.(new Event("open")));
    const retriedCreate = secondSocket.sent.map((item) => JSON.parse(item)).find((item) => item.type === "chat.message.create");
    expect(retriedCreate.client_message_id).toBe(firstCreate.client_message_id);
    expect(authorizedFetch.mock.calls.filter(([input]) => String(input).match(/\/messages\/$/))).toHaveLength(3);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
