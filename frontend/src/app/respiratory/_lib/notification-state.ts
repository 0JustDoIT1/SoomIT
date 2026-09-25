export type StaffNotification = {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  payload?: Record<string, unknown> | null;
  case_id: string | null;
  case_code: string | null;
  created_at: string;
  read_at: string | null;
};

export type NotificationState = {
  unread_count: number;
  results: StaffNotification[];
};

export const NOTIFICATION_READ_EVENT = "soomit-notification-read";
export const NOTIFICATION_SNAPSHOT_EVENT = "soomit-notification-snapshot";

export function readNotificationPayload(payload: unknown): NotificationState {
  if (!payload || typeof payload !== "object") return { unread_count: 0, results: [] };
  const value = payload as { unread_count?: unknown; results?: unknown };
  return {
    unread_count: Math.max(0, Number(value.unread_count) || 0),
    results: Array.isArray(value.results) ? value.results as StaffNotification[] : [],
  };
}

export function markNotificationRead(state: NotificationState, id: string, readAt: string): NotificationState {
  const target = state.results.find((item) => item.id === id);
  if (!target || target.read_at) return state;
  return {
    unread_count: Math.max(0, state.unread_count - 1),
    results: state.results.map((item) => item.id === id ? { ...item, read_at: readAt } : item),
  };
}

export function mergeNotificationSnapshot(current: NotificationState, incoming: NotificationState): NotificationState {
  const locallyRead = new Map(current.results.filter((item) => item.read_at).map((item) => [item.id, item.read_at as string]));
  let staleUnread = 0;
  const results = incoming.results.map((item) => {
    const readAt = locallyRead.get(item.id);
    if (!item.read_at && readAt) {
      staleUnread += 1;
      return { ...item, read_at: readAt };
    }
    return item;
  });
  return { unread_count: Math.max(0, incoming.unread_count - staleUnread), results };
}

export function publishNotificationRead(id: string, readAt: string) {
  window.dispatchEvent(new CustomEvent(NOTIFICATION_READ_EVENT, { detail: { id, read_at: readAt } }));
}

export function subscribeNotificationRead(callback: (id: string, readAt: string) => void) {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ id?: unknown; read_at?: unknown }>).detail;
    if (typeof detail?.id === "string" && typeof detail.read_at === "string") callback(detail.id, detail.read_at);
  };
  window.addEventListener(NOTIFICATION_READ_EVENT, listener);
  return () => window.removeEventListener(NOTIFICATION_READ_EVENT, listener);
}

export function publishNotificationSnapshot(snapshot: NotificationState) {
  window.dispatchEvent(new CustomEvent(NOTIFICATION_SNAPSHOT_EVENT, { detail: snapshot }));
}

export function subscribeNotificationSnapshot(callback: (snapshot: NotificationState) => void) {
  const listener = (event: Event) => {
    const snapshot = readNotificationPayload(
      (event as CustomEvent<unknown>).detail,
    );
    callback(snapshot);
  };
  window.addEventListener(NOTIFICATION_SNAPSHOT_EVENT, listener);
  return () => window.removeEventListener(NOTIFICATION_SNAPSHOT_EVENT, listener);
}
