/**
 * Деньги в целых копейках. Без арифметики с плавающей точкой.
 */

export function parseRubStringToKopecks(input: string): number {
  const trimmed = input.trim().replace(/\u00a0/g, " ").replace(/ /g, "");
  if (!trimmed) {
    throw new Error("Укажите сумму");
  }
  const normalized = trimmed.replace(",", ".");
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!m) {
    throw new Error("Сумма должна быть числом в рублях, например 1200 или 1200.50");
  }
  const negative = m[1] === "-";
  const rub = Number.parseInt(m[2]!, 10);
  const frac = (m[3] ?? "").padEnd(2, "0");
  const kop = Number.parseInt(frac, 10);
  const total = rub * 100 + kop;
  return negative ? -total : total;
}

export function kopecksToRubInput(kopecks: number): string {
  const sign = kopecks < 0 ? "-" : "";
  const abs = Math.abs(kopecks);
  const rub = Math.trunc(abs / 100);
  const kop = abs % 100;
  if (kop === 0) return `${sign}${rub}`;
  return `${sign}${rub}.${String(kop).padStart(2, "0")}`;
}

export function formatKopecksRu(kopecks: number): string {
  const sign = kopecks < 0 ? "−" : "";
  const abs = Math.abs(kopecks);
  const rub = Math.trunc(abs / 100);
  const kop = abs % 100;
  const rubFmt = rub.toLocaleString("ru-RU");
  if (kop === 0) return `${sign}${rubFmt} ₽`;
  return `${sign}${rubFmt},${String(kop).padStart(2, "0")} ₽`;
}

export function averageKopecks(total: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.trunc(total / count);
}
