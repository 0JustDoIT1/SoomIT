export function isSameLocalCalendarDay(value: string, reference = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

export function getTimestampOrOldest(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

export function sortByUpdatedAtDesc<T extends { updated_at: string }>(items: T[]) {
  return [...items].sort((left, right) => getTimestampOrOldest(right.updated_at) - getTimestampOrOldest(left.updated_at));
}
