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

/** Остаток занятий по направлению (SUM журнала). */
export function tariffBalanceAlert(
  remaining: number | null | undefined
): TariffBalanceAlert {
  if (remaining == null) return EMPTY_ALERT;

  const allowsDebit = remaining > -2;
  const allowsLearning = remaining > 0;
  const allowsLastDebtLesson = remaining === 0 || remaining === -1;

  if (remaining <= -1) {
    return {
      tone: "debt",
      message:
        remaining === -1
          ? "Занятие в долг — требуется продление"
          : "Лимит долга исчерпан — продлите пакет занятий",
      compactLabel:
        remaining === -1
          ? "Занятие в долг — требуется продление"
          : "Лимит долга исчерпан",
      needsRenewal: true,
      showRenewCta: true,
      allowsLastDebtLesson,
      allowsLearning,
      allowsDebit,
    };
  }
  if (remaining === 0) {
    return {
      tone: "zero",
      message:
        "Занятия по направлению закончились. Продлите пакет, чтобы снова открыть материалы",
      compactLabel: "Занятия закончились",
      needsRenewal: true,
      showRenewCta: true,
      allowsLastDebtLesson: true,
      allowsLearning: false,
      allowsDebit: true,
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
      allowsDebit: true,
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
      allowsDebit: true,
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
  return remaining != null && remaining <= 0;
}

export function canDebitFromRemaining(remaining: number | null | undefined) {
  if (remaining == null) return true;
  return remaining > -2;
}

export function allowsLearningFromRemaining(
  remaining: number | null | undefined
) {
  return tariffBalanceAlert(remaining).allowsLearning;
}