/**
 * Единый часовой пояс приложения: Europe/Moscow.
 * Календарные даты и «настенное» время интерпретируются в Москве,
 * абсолютные моменты хранятся как timestamptz / ISO.
 */

export const APP_TIME_ZONE = "Europe/Moscow";
export const APP_TIME_ZONE_LABEL = "Время указано по Москве";

export type AppZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 1 = понедельник … 7 = воскресенье */
  weekday: number;
};

const pad = (n: number) => String(n).padStart(2, "0");

function asDate(input: string | Date): Date {
  return input instanceof Date ? input : new Date(input);
}

function tzOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== "literal") bag[p.type] = p.value;
  }
  const asUtc = Date.UTC(
    Number(bag.year),
    Number(bag.month) - 1,
    Number(bag.day),
    Number(bag.hour),
    Number(bag.minute),
    Number(bag.second)
  );
  return asUtc - instant.getTime();
}

/** Настенные часы Москвы → абсолютный момент. Без ручного ±часов. */
export function fromAppWall(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  let offset = tzOffsetMs(new Date(utcGuess), APP_TIME_ZONE);
  let utc = Date.UTC(year, month - 1, day, hour, minute, second) - offset;
  offset = tzOffsetMs(new Date(utc), APP_TIME_ZONE);
  utc = Date.UTC(year, month - 1, day, hour, minute, second) - offset;
  return new Date(utc);
}

export function fromAppDateTime(dateKey: string, hm: string): Date {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(hm.trim());
  if (!dm || !tm) {
    throw new Error("Некорректная дата или время (ожидается YYYY-MM-DD и HH:MM)");
  }
  return fromAppWall(
    Number(dm[1]),
    Number(dm[2]),
    Number(dm[3]),
    Number(tm[1]),
    Number(tm[2]),
    Number(tm[3] ?? 0)
  );
}

export function appZonedParts(input: string | Date): AppZonedParts {
  const d = asDate(input);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const p of dtf.formatToParts(d)) {
    if (p.type !== "literal") bag[p.type] = p.value;
  }
  const wdMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
    weekday: wdMap[bag.weekday ?? ""] ?? 1,
  };
}

export function appDateKey(input: string | Date): string {
  const p = appZonedParts(input);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function appTimeHm(input: string | Date): string {
  const p = appZonedParts(input);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function addAppDateKey(dateKey: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) throw new Error("Некорректный ключ даты");
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days);
  const d = new Date(utc);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function startOfAppDay(input: string | Date): Date {
  return fromAppDateTime(appDateKey(input), "00:00");
}

export function startOfAppWeek(input: string | Date): Date {
  const p = appZonedParts(input);
  const key = appDateKey(input);
  return fromAppDateTime(addAppDateKey(key, -(p.weekday - 1)), "00:00");
}

export function startOfAppMonth(input: string | Date): Date {
  const p = appZonedParts(input);
  return fromAppWall(p.year, p.month, 1, 0, 0, 0);
}

export function addAppMonths(input: string | Date, n: number): Date {
  const p = appZonedParts(input);
  return fromAppWall(p.year, p.month + n, 1, 0, 0, 0);
}

export function sameAppDay(a: string | Date, b: string | Date): boolean {
  return appDateKey(a) === appDateKey(b);
}

export function minutesSinceAppMidnight(input: string | Date): number {
  const p = appZonedParts(input);
  return p.hour * 60 + p.minute;
}

export function formatInAppZone(
  input: string | Date,
  options: Intl.DateTimeFormatOptions
): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: APP_TIME_ZONE,
      ...options,
    }).format(asDate(input));
  } catch {
    return String(input);
  }
}

/** Значение для <input type="datetime-local"> — настенные часы Москвы. */
export function toAppDateTimeLocalValue(iso: string): string {
  const p = appZonedParts(iso);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Разбор datetime-local как московского настенного времени. */
export function fromAppDateTimeLocalValue(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!m) {
    throw new Error("Некорректное значение даты и времени");
  }
  return fromAppWall(
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? 0)
  ).toISOString();
}

/** Дата без времени: не сдвигать день через toISOString(). */
export function fromAppDateOnly(dateKey: string): Date {
  return fromAppDateTime(dateKey, "00:00");
}

/**
 * Разбор входной даты: календарный день Москвы, datetime-local Москвы
 * или абсолютный ISO-момент. Не смешивает локаль браузера с UTC.
 */
export function parseAppInstant(value: string, endOfDay = false): Date {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return fromAppDateTime(trimmed, endOfDay ? "23:59" : "00:00");
  }
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed) &&
    !/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)
  ) {
    return new Date(fromAppDateTimeLocalValue(trimmed));
  }
  return new Date(trimmed);
}
