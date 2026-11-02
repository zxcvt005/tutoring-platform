import type {
  StudentPackageStatus,
  StudentTariffAssignment,
} from "@/lib/types";

export function suggestDurationDays(
  lessonsLimit: number,
  weeklyFrequency: number
): number {
  const freq = Math.max(1, weeklyFrequency || 1);
  const lessons = Math.max(0, lessonsLimit || 0);
  return Math.ceil(lessons / freq) * 7;
}

export function currentAssignmentForStudent(
  assignments: StudentTariffAssignment[],
  studentId: string
): StudentTariffAssignment | null {
  const list = assignments
    .filter((a) => a.studentId === studentId)
    .sort(
      (a, b) =>
        new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
    );
  const activePaid = list.find(
    (a) => a.status === "active" && a.paymentStatus === "paid"
  );
  return activePaid ?? list[0] ?? null;
}

/** Тариф из назначения или из выбранного для будущей оплаты каталожного тарифа. */
export function studentTariffLabel(input: {
  assignments: StudentTariffAssignment[];
  studentId: string;
  tariffs: { id: string; name: string }[];
  purchaseTariffId?: string | null;
}): {
  name: string;
  awaitingPayment: boolean;
  assignment: StudentTariffAssignment | null;
} | null {
  const assignment = currentAssignmentForStudent(
    input.assignments,
    input.studentId
  );
  if (assignment) {
    const unpaid =
      assignment.paymentStatus !== "paid" ||
      assignment.status === "pending_payment";
    return {
      name: assignment.tariffName ?? "Тариф",
      awaitingPayment: unpaid,
      assignment,
    };
  }
  const purchaseId = input.purchaseTariffId?.trim();
  if (!purchaseId) return null;
  const tariff = input.tariffs.find((item) => item.id === purchaseId);
  if (!tariff) return null;
  return {
    name: tariff.name,
    awaitingPayment: true,
    assignment: null,
  };
}

export const packageStatusLabel: Record<StudentPackageStatus, string> = {
  none: "Нет тарифа",
  unpaid: "Ожидает оплаты",
  active: "Оплачен",
  queued: "В очереди",
  exhausted: "Тариф закончился",
  debt: "Занятие в долг — требуется продление",
  paused: "Приостановлен",
  cancelled: "Отменён",
};
