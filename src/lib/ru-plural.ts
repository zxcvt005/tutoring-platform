/**
 * Русское склонение по числу: 1 / 2–4 / 5+ (с учётом 11–14).
 */
export function pluralRu(
  count: number,
  one: string,
  few: string,
  many: string
): string {
  const n = Math.abs(Math.trunc(count));
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** «1 занятие», «2 занятия», «5 занятий», «21 занятие». */
export function lessonsCountLabel(count: number): string {
  const n = Math.trunc(count);
  return `${n} ${pluralRu(n, "занятие", "занятия", "занятий")}`;
}
