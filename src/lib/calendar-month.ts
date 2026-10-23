import {
  addAppDateKey,
  addAppMonths,
  appDateKey,
  appZonedParts,
  formatInAppZone,
  fromAppDateTime,
  startOfAppMonth,
} from "@/lib/app-time";

/** Ключ календарного дня в часовом поясе приложения (Москва). */
export function dateKeyLocal(d: Date): string {
  return appDateKey(d);
}

export function parseIsoToLocalDateKey(iso: string): string {
  return appDateKey(iso);
}

export function startOfMonth(d: Date): Date {
  return startOfAppMonth(d);
}

export function addMonths(d: Date, n: number): Date {
  return addAppMonths(d, n);
}

export type CalendarCell = {
  date: Date;
  key: string;
  dayNumber: number;
  inMonth: boolean;
  isToday: boolean;
};

/** Сетка 6×7 для месяца, начиная с понедельника (Москва). */
export function buildMonthGrid(monthAnchor: Date, today = new Date()): CalendarCell[] {
  const first = startOfAppMonth(monthAnchor);
  const firstParts = appZonedParts(first);
  const startOffset = firstParts.weekday - 1;
  const firstKey = appDateKey(first);
  const gridStartKey = addAppDateKey(firstKey, -startOffset);
  const todayKey = appDateKey(today);
  const month = firstParts.month;
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const key = addAppDateKey(gridStartKey, i);
    const [, m, day] = key.split("-").map(Number) as [number, number, number];
    cells.push({
      date: fromAppDateTime(key, "12:00"),
      key,
      dayNumber: day,
      inMonth: m === month,
      isToday: key === todayKey,
    });
  }
  return cells;
}

export const WEEKDAY_LABELS_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function monthTitleRu(d: Date): string {
  return formatInAppZone(d, { month: "long", year: "numeric" });
}
