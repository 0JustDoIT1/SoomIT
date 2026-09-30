import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SoomChatPanel } from "./SoomChatPanel";

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];
  readyState = MockWebSocket.OPEN;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor() {
    MockWebSocket.instances.push(this);
    queueMicrotask(() => this.onopen?.());
  }

  send(value: string) { this.sent.push(value); }
  close() { this.readyState = 3; }
}

afterEach(() => {
  MockWebSocket.instances = [];
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SoomChatPanel", () => {
  it("keeps a live badge when an older participant response arrives and deduplicates events", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    window.sessionStorage.setItem("accessToken", "staff-token");
    const participant = { id: "user-2", name: "검사자", department: "RADIOLOGY", role: "TECHNOLOGIST", unread_count: 0 };
    const pending: Array<(response: Response) => void> = [];
    const authorizedFetch = vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve)));
    render(<SoomChatPanel authorizedFetch={authorizedFetch} />);
    await waitFor(() => expect(pending.length).toBeGreaterThan(0));
    const event = { data: JSON.stringify({ type: "chat.message.created", message: { id: "live-1", body: "hello", sender: participant, recipient_id: "me", created_at: "2026-09-30T01:00:00Z" } }) } as MessageEvent;
    act(() => { MockWebSocket.instances[0].onmessage?.(event); MockWebSocket.instances[0].onmessage?.(event); });
    expect(screen.getByLabelText("읽지 않은 채팅 1개")).toBeInTheDocument();
    await act(async () => { pending.forEach((resolve) => resolve(new Response(JSON.stringify([participant]), { status: 200 }))); });
    expect(screen.getByLabelText("읽지 않은 채팅 1개")).toBeInTheDocument();
  });
  it("shows an unread badge when a message arrives while the launcher is closed", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    const participant = { id: "user-2", name: "김태윤", department: "RADIOLOGY", role: "TECHNOLOGIST", unread_count: 0 };
    let unreadCount = 0;
    const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/participants/")) {
        return new Response(JSON.stringify([{ ...participant, unread_count: unreadCount }]), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    window.sessionStorage.setItem("accessToken", "staff-token");

    render(<SoomChatPanel authorizedFetch={authorizedFetch} />);
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    unreadCount = 1;
    MockWebSocket.instances[0].onmessage?.({
      data: JSON.stringify({
        type: "chat.message.created",
        message: {
          id: "message-1",
          body: "새 메시지",
          sender: participant,
          recipient_id: "user-1",
          created_at: "2026-09-30T01:00:00Z",
        },
      }),
    } as MessageEvent);

    expect(await screen.findByLabelText("읽지 않은 채팅 1개")).toBeInTheDocument();
    expect(MockWebSocket.instances[0].sent).toHaveLength(0);
  });

  it("selects a hospital participant and sends a direct message only to that user", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    const participant = { id: "user-2", name: "김태윤", department: "RADIOLOGY", role: "TECHNOLOGIST", unread_count: 1 };
    const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/participants/")) return new Response(JSON.stringify([participant]), { status: 200 });
      if (url.includes("/messages/read/")) return new Response(JSON.stringify({ marked_count: 1 }), { status: 200 });
      if (url.includes("/messages/?")) return new Response(JSON.stringify({ results: [{ id: "message-1", body: "검사 완료했습니다.", sender: participant, recipient_id: "user-1", created_at: "2026-09-27T10:00:00Z" }], next_cursor: null }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 404 });
    });
    const user = userEvent.setup();
    window.sessionStorage.setItem("accessToken", "staff-token");

    render(<SoomChatPanel authorizedFetch={authorizedFetch} />);
    await user.click(await screen.findByRole("button", { name: /숨챗/ }));

    expect(await screen.findByText("검사 완료했습니다.")).toBeInTheDocument();
    expect(screen.getAllByText("김태윤")).toHaveLength(2);
    await user.type(screen.getByPlaceholderText("김태윤님에게 메시지 보내기"), "확인했습니다.");
    const sendButton = screen.getByRole("button", { name: "전송" });
    await waitFor(() => expect(sendButton).toBeEnabled());
    await user.click(sendButton);

    await waitFor(() => expect(MockWebSocket.instances[0]?.sent).toHaveLength(1));
    expect(JSON.parse(MockWebSocket.instances[0].sent[0])).toMatchObject({
      type: "chat.message.create",
      recipient_id: "user-2",
      body: "확인했습니다.",
    });
  });
});
