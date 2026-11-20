/** Раскладка сетки учеников в групповом звонке (без LiveKit). */

export type GroupGridViewport = "mobile" | "tablet" | "desktop";

/** Сколько карточек учеников показывать на одной странице. */
export function groupStudentPageSize(
  studentCount: number,
  viewport: GroupGridViewport
): number {
  if (studentCount <= 0) return 0;
  const cap = viewport === "mobile" ? 4 : viewport === "tablet" ? 6 : 8;
  return Math.min(studentCount, cap);
}

/** Число колонок для видимых карточек на странице. */
export function groupStudentColumns(
  visibleCount: number,
  viewport: GroupGridViewport
): number {
  if (visibleCount <= 1) return 1;
  if (viewport === "mobile") {
    return visibleCount === 1 ? 1 : 2;
  }
  if (visibleCount <= 2) return 2;
  if (visibleCount === 3) return 3;
  if (visibleCount === 4) return 2;
  if (visibleCount <= 6) return 3;
  return viewport === "desktop" ? 4 : 3;
}

export function groupStudentPages(
  studentCount: number,
  viewport: GroupGridViewport
): number {
  const size = groupStudentPageSize(studentCount, viewport);
  if (size <= 0) return 0;
  return Math.ceil(studentCount / size);
}

export function sliceStudentPage<T>(
  items: T[],
  pageIndex: number,
  viewport: GroupGridViewport
): T[] {
  const size = groupStudentPageSize(items.length, viewport);
  if (size <= 0) return [];
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(Math.max(0, pageIndex), pages - 1);
  const start = page * size;
  return items.slice(start, start + size);
}

export function resolveGroupViewport(widthPx: number): GroupGridViewport {
  if (widthPx < 640) return "mobile";
  if (widthPx < 1024) return "tablet";
  return "desktop";
}
