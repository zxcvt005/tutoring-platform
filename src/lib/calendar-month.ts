/** Утилиты месячного календаря без сдвига даты из‑за UTC. */

export function dateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseIsoToLocalDateKey(iso: string): string {
  const d = new Date(iso);
  return dateKeyLocal(d);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Понедельник = 0 … воскресенье = 6 (RU-неделя). */
export function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export type CalendarCell = {
  date: Date;
  key: string;
  inMonth: boolean;
  isToday: boolean;
};

/** Сетка 6×7 для месяца, начиная с понедельника. */
export function buildMonthGrid(monthAnchor: Date, today = new Date()): CalendarCell[] {
  const first = startOfMonth(monthAnchor);
  const startOffset = mondayIndex(first);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startOffset);

  const todayKey = dateKeyLocal(today);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    const key = dateKeyLocal(date);
    cells.push({
      date,
      key,
      inMonth: date.getMonth() === monthAnchor.getMonth(),
      isToday: key === todayKey,
    });
  }
  return cells;
}

export const WEEKDAY_LABELS_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function monthTitleRu(d: Date): string {
  return d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}
