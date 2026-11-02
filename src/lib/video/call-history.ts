import { appZonedParts, formatInAppZone, fromAppWall } from "@/lib/app-time";

/** Звонок в схеме не связан с занятием расписания. */
export const CALL_WITHOUT_LESSON_MESSAGE =
  "Этот звонок не привязан к занятию. Откройте «История занятий» и выберите урок вручную.";

export function callDurationMs(
  createdAt: string,
  endedAt: string | null
): number | null {
  if (!endedAt) return null;
  const start = new Date(createdAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start;
}

/** «45 мин» или «28 ч 15 мин». Неизвестная длительность — «—». */
export function formatCallDuration(ms: number | null): string {
  if (ms == null) return "—";
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} мин`;
  if (minutes === 0) return `${hours} ч`;
  return `${hours} ч ${minutes} мин`;
}

export function totalKnownCallDurationMs(
  calls: { createdAt: string; endedAt: string | null }[]
): number | null {
  let total = 0;
  let known = false;
  for (const call of calls) {
    const ms = callDurationMs(call.createdAt, call.endedAt);
    if (ms == null) continue;
    known = true;
    total += ms;
  }
  return known ? total : null;
}

/** Ключ месяца в часовом поясе приложения: YYYY-MM. */
export function callMonthKey(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = appZonedParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

export function callMonthLabel(key: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return key;
  const label = formatInAppZone(
    fromAppWall(Number(match[1]), Number(match[2]), 1, 12),
    { month: "long", year: "numeric" }
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function callMonthOptions(
  createdAts: string[],
  now = new Date()
): { key: string; label: string }[] {
  const keys = new Set<string>();
  const current = callMonthKey(now.toISOString());
  if (current) keys.add(current);
  for (const iso of createdAts) {
    const key = callMonthKey(iso);
    if (key) keys.add(key);
  }
  return [...keys]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((key) => ({ key, label: callMonthLabel(key) }));
}

export function defaultCallMonth(
  createdAts: string[],
  now = new Date()
): string {
  const current = callMonthKey(now.toISOString()) ?? "";
  if (createdAts.some((iso) => callMonthKey(iso) === current)) return current;
  const withCalls = createdAts
    .map((iso) => callMonthKey(iso))
    .filter((key): key is string => Boolean(key))
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return withCalls[0] || current;
}
