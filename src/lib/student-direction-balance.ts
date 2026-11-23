import type { Student, StudentDirectionBalance } from "@/lib/types";

export function minDirectionBalance(
  student: Pick<Student, "directionBalances"> | {
    directionBalances?: StudentDirectionBalance[];
  }
): number | null {
  const balances = student.directionBalances ?? [];
  if (!balances.length) return null;
  return Math.min(...balances.map((b) => b.balance));
}

export function directionBalancesLabel(
  student: Pick<Student, "directionBalances"> | {
    directionBalances?: StudentDirectionBalance[];
  }
): string {
  const balances = student.directionBalances ?? [];
  if (!balances.length) return "—";
  return balances
    .map((b) => `${b.directionName ?? b.directionSlug ?? "…"}: ${b.balance}`)
    .join(" · ");
}

export function packageStatusFromBalance(
  balance: number | null
): "active" | "exhausted" | "debt" | "none" {
  if (balance == null) return "none";
  if (balance <= -1) return "debt";
  if (balance <= 0) return "exhausted";
  return "active";
}

/** Форматирование суммы оплаты (как в доходах дирекции). */
export function formatRubAmount(n: number): string {
  const abs = Math.abs(n).toLocaleString("ru-RU");
  return n < 0 ? `−${abs} ₽` : `${abs} ₽`;
}
