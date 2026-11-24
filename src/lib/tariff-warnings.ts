import type { StudentPackageStatus, StudentTariffAssignment } from "@/lib/types";

export type TariffBalanceTone = "ok" | "warn2" | "warn1" | "zero" | "debt";

export type TariffBalanceAlert = {
  tone: TariffBalanceTone;
  message: string | null;
  compactLabel: string | null;
  needsRenewal: boolean;
  showRenewCta: boolean;
  allowsLastDebtLesson: boolean;
  allowsLearning: boolean;
  allowsDebit: boolean;
};

/**
 * Минимальный остаток, при котором теория / ДЗ / тренажёр формул ещё открыты.
 * При −3 и ниже материалы закрываются; расписание и списание занятий продолжаются.
 */
export const LEARNING_MATERIALS_MIN_REMAINING = -2;

const EMPTY_ALERT: TariffBalanceAlert = {
  tone: "ok",
  message: null,
  compactLabel: null,
  needsRenewal: false,
  showRenewCta: false,
  allowsLastDebtLesson: false,
  allowsLearning: true,
  allowsDebit: true,
};

/** Учебные материалы доступны при остатке ≥ −2. */
export function allowsLearningMaterials(
  remaining: number | null | undefined
): boolean {
  if (remaining == null) return true;
  return remaining >= LEARNING_MATERIALS_MIN_REMAINING;
}

/** Остаток занятий по направлению (SUM журнала). */
export function tariffBalanceAlert(
  remaining: number | null | undefined
): TariffBalanceAlert {
  if (remaining == null) return EMPTY_ALERT;

  const allowsLearning = allowsLearningMaterials(remaining);
  // Посещаемость списывается при любом долге — иначе баланс «залипает».
  const allowsDebit = true;
  const allowsLastDebtLesson = remaining >= -2 && remaining <= 0;

  if (remaining <= -3) {
    return {
      tone: "debt",
      message:
        "Материалы закрыты: баланс занятий −3 и ниже. Пополните пакет, чтобы снова открыть теорию, домашние задания и тренажёр формул.",
      compactLabel: "Пополните баланс занятий",
      needsRenewal: true,
      showRenewCta: true,
      allowsLastDebtLesson: false,
      allowsLearning: false,
      allowsDebit,
    };
  }
  if (remaining === -2 || remaining === -1) {
    return {
      tone: "debt",
      message:
        remaining === -1
          ? "Занятие в долг — рекомендуется продлить пакет"
          : "Баланс −2 — ещё есть полный доступ. При −3 закроются теория, ДЗ и тренажёр формул",
      compactLabel:
        remaining === -1
          ? "Занятие в долг"
          : "Баланс −2 — скоро ограничение материалов",
      needsRenewal: true,
      showRenewCta: true,
      allowsLastDebtLesson,
      allowsLearning: true,
      allowsDebit,
    };
  }
  if (remaining === 0) {
    return {
      tone: "zero",
      message:
        "Оплаченные занятия закончились. До −2 включительно доступ полный; при −3 закроются теория, ДЗ и тренажёр формул",
      compactLabel: "Занятия закончились",
      needsRenewal: true,
      showRenewCta: true,
      allowsLastDebtLesson: true,
      allowsLearning: true,
      allowsDebit,
    };
  }
  if (remaining === 1) {
    return {
      tone: "warn1",
      message: "Осталось последнее занятие. Скоро потребуется продление",
      compactLabel: "Осталось последнее занятие",
      needsRenewal: false,
      showRenewCta: true,
      allowsLastDebtLesson: false,
      allowsLearning: true,
      allowsDebit,
    };
  }
  if (remaining === 2) {
    return {
      tone: "warn2",
      message: "Скоро закончатся занятия — осталось 2",
      compactLabel: "Скоро закончатся занятия — осталось 2",
      needsRenewal: false,
      showRenewCta: true,
      allowsLastDebtLesson: false,
      allowsLearning: true,
      allowsDebit,
    };
  }
  return {
    ...EMPTY_ALERT,
    allowsLearning: true,
    allowsDebit: true,
  };
}

export function assignmentTariffAlert(
  assignment:
    | Pick<StudentTariffAssignment, "lessonsRemaining" | "packageStatus">
    | null
    | undefined
): TariffBalanceAlert {
  if (!assignment) return tariffBalanceAlert(null);
  if (assignment.packageStatus === "debt") return tariffBalanceAlert(-1);
  if (assignment.packageStatus === "exhausted") return tariffBalanceAlert(0);
  return tariffBalanceAlert(assignment.lessonsRemaining);
}

export function studentLearningLocked(
  remaining: number | null | undefined,
  packageStatus?: StudentPackageStatus | null
) {
  if (packageStatus === "unpaid" || packageStatus === "cancelled") return true;
  return remaining != null && !allowsLearningMaterials(remaining);
}

/**
 * Списание за посещаемость не ограничивается долгом.
 * Лимит −2 для ручных корректировок остаётся в lesson-balance-rules.
 */
export function canDebitFromRemaining(
  _remaining?: number | null | undefined
) {
  return true;
}

export function allowsLearningFromRemaining(
  remaining: number | null | undefined
) {
  return allowsLearningMaterials(remaining);
}
