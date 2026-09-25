import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RespiratoryNotificationsPage from "./page";
import { publishNotificationSnapshot } from "../_lib/notification-state";

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(),
  push: vi.fn(),
  requestCaseNavigation: vi.fn(() => true),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("../_components/respiratory-auth-provider", () => ({
  useRespiratoryAuth: () => ({ authorizedFetch: mocks.authorizedFetch }),
}));

vi.mock("../_lib/respiratory-api", () => ({ API_BASE_URL: "http://api.test" }));
vi.mock("../_lib/case-navigation-guard", () => ({
  requestCaseNavigation: mocks.requestCaseNavigation,
}));

type RowOverrides = Partial<{
  id: string;
  notification_type: string;
  title: string;
  message: string;
  payload: Record<string, unknown>;
  case_id: string | null;
  case_code: string | null;
  created_at: string;
  read_at: string | null;
}>;

function row(overrides: RowOverrides = {}) {
  return {
    id: "notification-1",
    notification_type: "EXAMINATION_ORDER",
    title: "CT 검사 오더",
    message: "확인이 필요합니다.",
    payload: {},
    case_id: "case-1",
    case_code: "CASE-1",
    created_at: "2026-09-25T00:00:00Z",
    read_at: null,
    ...overrides,
  };
}

function response(body: unknown, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function load(rows: ReturnType<typeof row>[], unreadCount: number) {
  mocks.authorizedFetch.mockResolvedValueOnce(
    response({ unread_count: unreadCount, results: rows }),
  );
  render(<RespiratoryNotificationsPage />);
}

describe("respiratory notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestCaseNavigation.mockReturnValue(true);
  });

  it("renders unread count and visually distinguishes read rows", async () => {
    load([
      row(),
      row({ id: "notification-2", title: "읽은 알림", read_at: "2026-09-25T01:00:00Z" }),
    ], 1);

    expect(await screen.findByText("새 알림 1")).toBeInTheDocument();
    expect(screen.getByText("읽지 않음")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "읽지 않음 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /CT 검사 오더/ })).toHaveClass("bg-blue-50/40");
    expect(screen.getByRole("button", { name: /읽은 알림/ })).toHaveClass("bg-white");
  });

  it("marks read once on rapid clicks, updates count, then navigates", async () => {
    let resolveRead!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { resolveRead = resolve; });
    load([row()], 1);
    mocks.authorizedFetch.mockReturnValueOnce(pending);

    const button = await screen.findByRole("button", { name: /CT 검사 오더/ });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(mocks.authorizedFetch).toHaveBeenCalledTimes(2);
    expect(mocks.push).not.toHaveBeenCalled();

    await act(async () => {
      resolveRead(response({ read_at: "2026-09-25T02:00:00Z" }));
      await pending;
    });

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/respiratory/cases/case-1"));
    expect(screen.queryByText("새 알림 1")).not.toBeInTheDocument();
  });

  it("does not call the read endpoint for an already-read notification", async () => {
    load([row({ read_at: "2026-09-25T01:00:00Z" })], 0);

    fireEvent.click(await screen.findByRole("button", { name: /CT 검사 오더/ }));

    expect(mocks.authorizedFetch).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith("/respiratory/cases/case-1");
  });

  it("keeps a failed read unread and allows a successful retry", async () => {
    load([row()], 1);
    mocks.authorizedFetch
      .mockResolvedValueOnce(response({ detail: "읽음 처리 실패" }, false))
      .mockResolvedValueOnce(response({ read_at: "2026-09-25T02:00:00Z" }));

    const button = await screen.findByRole("button", { name: /CT 검사 오더/ });
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("읽음 처리 실패");
    expect(screen.getByText("새 알림 1")).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();

    fireEvent.click(button);
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/respiratory/cases/case-1"));
  });

  it("opens a case-chat notification at the referenced message", async () => {
    load([row({
      notification_type: "CASE_CHAT",
      payload: { chat_message_id: "message/1" },
      read_at: "2026-09-25T01:00:00Z",
    })], 0);

    fireEvent.click(await screen.findByRole("button", { name: /CT 검사 오더/ }));

    expect(mocks.push).toHaveBeenCalledWith(
      "/respiratory/cases/case-1?openChat=1&chatMessage=message%2F1",
    );
  });

  it("merges a newly polled notification without dropping the existing list", async () => {
    load([row({ read_at: "2026-09-25T01:00:00Z" })], 0);
    expect(await screen.findByText("CT 검사 오더")).toBeInTheDocument();

    act(() => publishNotificationSnapshot({
      unread_count: 1,
      results: [
        row({ id: "notification-new", title: "새 협진 요청", notification_type: "CONSULTATION" }),
        row({ read_at: "2026-09-25T01:00:00Z" }),
      ],
    }));

    expect(screen.getByText("새 협진 요청")).toBeInTheDocument();
    expect(screen.getByText("CT 검사 오더")).toBeInTheDocument();
    expect(screen.getByText("새 알림 1")).toBeInTheDocument();
  });

  it("shows loading, request error, and empty states separately", async () => {
    let resolveLoad!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { resolveLoad = resolve; });
    mocks.authorizedFetch.mockReturnValueOnce(pending);
    const { unmount } = render(<RespiratoryNotificationsPage />);
    expect(screen.getByText("알림을 불러오는 중입니다.")).toBeInTheDocument();

    await act(async () => {
      resolveLoad(response({}, false));
      await pending;
    });
    expect(await screen.findByText("알림을 불러오지 못했습니다.")).toBeInTheDocument();
    unmount();

    load([], 0);
    expect(await screen.findByText("해당 알림이 없습니다.")).toBeInTheDocument();
  });
});
