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

export function tariffBalanceAlert(
  remaining: number | null | undefined
): TariffBalanceAlert {
  if (remaining == null) return EMPTY_ALERT;
  if (remaining <= -1) {
    return {
      tone: "debt",
      message: "Занятие в долг — требуется продление",
      compactLabel: "Занятие в долг — требуется продление",
      needsRenewal: true,
      showRenewCta: true,
      allowsLastDebtLesson: false,
      allowsLearning: false,
      allowsDebit: false,
    };
  }
  if (remaining === 0) {
    return {
      tone: "zero",
      message:
        "Тариф закончился. Продлите его, чтобы продолжить обучение без перерыва",
      compactLabel: "Тариф закончился",
      needsRenewal: true,
      showRenewCta: true,
      allowsLastDebtLesson: true,
      allowsLearning: true,
      allowsDebit: true,
    };
  }
  if (remaining === 1) {
    return {
      tone: "warn1",
      message:
        "Осталось последнее занятие. Скоро потребуется продление тарифа",
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
  return EMPTY_ALERT;
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
  return !assignmentTariffAlert({
    lessonsRemaining: remaining,
    packageStatus: packageStatus ?? undefined,
  }).allowsLearning;
}

export function canDebitFromRemaining(remaining: number | null | undefined) {
  return tariffBalanceAlert(remaining).allowsDebit;
}

export function allowsLearningFromRemaining(
  remaining: number | null | undefined
) {
  return tariffBalanceAlert(remaining).allowsLearning;
}
