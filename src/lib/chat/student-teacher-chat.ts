export const OPEN_TEACHER_CHAT_EVENT = "neodin:open-teacher-chat";

export function requestOpenTeacherChat(teacherId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(OPEN_TEACHER_CHAT_EVENT, { detail: { teacherId } })
  );
}

/**
 * Ученик открывает только чат со своим преподавателем.
 * Чужой teacherId не подменяется и не создаёт новую пару.
 */
export function resolveStudentTeacherChat(input: {
  primaryTeacherId: string | null | undefined;
  requestedTeacherId?: string | null;
}):
  | { ok: true; teacherId: string }
  | { ok: false; code: "no-teacher" | "foreign-teacher" } {
  const primary = input.primaryTeacherId?.trim() ?? "";
  if (!primary) return { ok: false, code: "no-teacher" };
  const requested = input.requestedTeacherId?.trim() ?? "";
  if (requested && requested !== primary) {
    return { ok: false, code: "foreign-teacher" };
  }
  return { ok: true, teacherId: primary };
}
