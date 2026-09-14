export const CASES_PER_PAGE = 10;

export function getCasePageCount(totalItems: number, pageSize = CASES_PER_PAGE) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function paginateCases<T>(items: T[], page: number, pageSize = CASES_PER_PAGE) {
  const pageCount = getCasePageCount(items.length, pageSize);
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  return { page: safePage, pageCount, items: items.slice(start, start + pageSize) };
}

export function getVisiblePageNumbers(currentPage: number, pageCount: number) {
  const start = Math.max(1, Math.min(currentPage - 2, pageCount - 4));
  const end = Math.min(pageCount, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
