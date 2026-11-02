import type { Student } from "@/lib/types";

/** Рабочие корзины списка «Пресса». Не путать со статусом карточки ученика. */
export type PressStudentBucket = "new" | "active" | "archived";

export const pressStudentBucketLabel: Record<PressStudentBucket, string> = {
  new: "Новые",
  active: "Действующие",
  archived: "Архивные",
};

/**
 * Новые — не в архиве и без назначенного преподавателя.
 * Действующие — не в архиве, преподаватель назначен (включая паузу).
 * Архивные — status=archived.
 */
export function pressStudentBucket(student: {
  status: Student["status"];
  teacherId?: string | null;
}): PressStudentBucket {
  if (student.status === "archived") return "archived";
  if (!student.teacherId) return "new";
  return "active";
}

export type PressStudentSort = "name" | "status";

export function comparePressStudents<
  T extends {
    fullName: string;
    bucket: PressStudentBucket;
  },
>(a: T, b: T, sort: PressStudentSort): number {
  if (sort === "status") {
    const order: Record<PressStudentBucket, number> = {
      new: 0,
      active: 1,
      archived: 2,
    };
    const d = order[a.bucket] - order[b.bucket];
    return d !== 0 ? d : a.fullName.localeCompare(b.fullName, "ru");
  }
  return a.fullName.localeCompare(b.fullName, "ru");
}
