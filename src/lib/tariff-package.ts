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

export const packageStatusLabel: Record<StudentPackageStatus, string> = {
  none: "Нет тарифа",
  unpaid: "Ожидает оплаты",
  active: "Оплачен",
  exhausted: "Занятия закончились",
  paused: "Приостановлен",
  cancelled: "Отменён",
};
