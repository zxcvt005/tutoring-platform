import { tariffBalanceAlert } from "@/lib/tariff-warnings";
import type {
  HomeworkAssignmentStatus,
  LessonOrder,
  StudentDirectionBalanceRow,
  TariffFeatureKey,
} from "@/lib/types";

export type MaterialsLearningLock = {
  locked: boolean;
  alert: ReturnType<typeof tariffBalanceAlert>;
  message: string | null;
  remaining: number | null;
};

/**
 * Блокировка только учебных материалов (теория, ДЗ, тесты) — не истории, расписания и оплаты.
 * Доступ: оплаченный заказ с нужной возможностью + положительный баланс по направлению заказа.
 */
export function materialsLearningLock(input: {
  remaining: number | null | undefined;
  hasEntitlement?: boolean;
}): MaterialsLearningLock {
  const alert = tariffBalanceAlert(input.remaining);
  const hasEntitlement = input.hasEntitlement !== false;
  const remaining =
    input.remaining == null ? null : Number(input.remaining);
  const locked =
    !hasEntitlement || (remaining != null && remaining <= 0);

  let message: string | null = null;
  if (locked) {
    if (!hasEntitlement) {
      message =
        "Материалы недоступны: нет оплаченного тарифа с доступом к этому направлению.";
    } else if (remaining != null && remaining <= -1) {
      message =
        "Материалы закрыты: занятия по направлению исчерпаны. Купите занятия, чтобы снова открыть теорию, тесты и домашние задания.";
    } else {
      message =
        alert.message ??
        "Материалы закрыты: занятия по направлению закончились. Купите занятия, чтобы продолжить.";
    }
  }

  return { locked, alert, message, remaining };
}

function balanceMap(rows: StudentDirectionBalanceRow[] | undefined) {
  const map = new Map<string, number>();
  for (const row of rows ?? []) {
    map.set(`${row.studentId}:${row.directionId}`, Number(row.remaining));
  }
  return map;
}

/**
 * Клиентская проверка доступа к материалам по заказам и балансам направлений.
 * Сервер остаётся источником истины в API.
 */
export function studentLearningLock(
  data: {
    studentDirectionBalances?: StudentDirectionBalanceRow[];
    lessonOrders?: LessonOrder[];
  },
  studentId: string,
  feature: TariffFeatureKey = "homework"
) {
  const balances = balanceMap(data.studentDirectionBalances);
  const paidOrders = (data.lessonOrders ?? []).filter(
    (o) =>
      o.studentId === studentId &&
      o.status === "paid" &&
      !o.accessRevoked
  );

  let bestRemaining: number | null = null;
  let hasEntitlement = false;

  for (const order of paidOrders) {
    const features = order.featuresSnapshot ?? [];
    if (!features.includes(feature) && feature !== "individual_lessons") {
      // homework/theory historically gated by "homework"
      if (feature === "homework" && !features.includes("homework")) continue;
      if (feature !== "homework") continue;
    }
    if (feature === "homework" && !features.includes("homework")) continue;

    const rem = balances.get(`${studentId}:${order.directionId}`);
    if (rem == null) continue;
    if (rem > 0) {
      hasEntitlement = true;
      bestRemaining =
        bestRemaining == null ? rem : Math.max(bestRemaining, rem);
    } else if (bestRemaining == null || rem > bestRemaining) {
      // keep least-bad remaining for messaging when all exhausted
      bestRemaining = rem;
      hasEntitlement = true; // had paid feature, but balance exhausted
    }
  }

  // No paid feature orders at all
  if (
    paidOrders.every((o) => !(o.featuresSnapshot ?? []).includes(feature)) &&
    feature === "homework"
  ) {
    hasEntitlement = false;
    bestRemaining = bestRemaining ?? 0;
  }

  if (paidOrders.length === 0) {
    hasEntitlement = false;
    bestRemaining = null;
  }

  const lock = materialsLearningLock({
    remaining: hasEntitlement ? bestRemaining : null,
    hasEntitlement,
  });

  return {
    assignment: null as null,
    alert: lock.alert,
    locked: lock.locked,
    message: lock.message,
    remaining: lock.remaining,
  };
}

/** Минимальный остаток по направлениям ученика (для предупреждений в Кафедре). */
export function studentMinDirectionRemaining(
  balances: StudentDirectionBalanceRow[] | undefined,
  studentId: string
): number | null {
  const mine = (balances ?? []).filter((b) => b.studentId === studentId);
  if (mine.length === 0) return null;
  return Math.min(...mine.map((b) => Number(b.remaining)));
}

export function isHomeworkHistoryView(status: HomeworkAssignmentStatus) {
  return status === "completed" || status === "reviewed";
}
