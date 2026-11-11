import type { PersonStatus } from "@/lib/types";

type StudentLike = {
  teacherId?: string | null;
  status?: PersonStatus | string | null;
};

/**
 * Active work-list «без преподавателя»: no primary teacher and not archived.
 * Archive clears primaryTeacherId, so archived rows must be excluded or the
 * Director overview/sidebar inflate the counter.
 */
export function isUnassignedActiveStudent(student: StudentLike): boolean {
  if (student.status === "archived") return false;
  return !student.teacherId;
}

export function countUnassignedActiveStudents(
  students: readonly StudentLike[]
): number {
  let n = 0;
  for (const student of students) {
    if (isUnassignedActiveStudent(student)) n += 1;
  }
  return n;
}
