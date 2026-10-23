export type AssignmentWorkKind = "homework" | "theory";

export function assignmentWorkKind(
  value?: string | null
): AssignmentWorkKind {
  return value === "theory" ? "theory" : "homework";
}

export function isHomeworkWork(value?: { sourceKind?: string | null } | string | null): boolean {
  if (value && typeof value === "object") {
    return assignmentWorkKind(value.sourceKind) === "homework";
  }
  return assignmentWorkKind(value) === "homework";
}

export function gradeWorkLabel(
  kind: AssignmentWorkKind,
  title: string
): string {
  const prefix = kind === "theory" ? "Теория" : "ДЗ";
  return `${prefix} — ${title}`;
}
