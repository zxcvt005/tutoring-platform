/**
 * After creating/editing a student in Director work list, align the teacher
 * filter so the saved row stays visible (default filter is «unassigned»).
 * Returns the next filter value, or null if no change is needed.
 */
export function nextTeacherFilterAfterStudentSave(input: {
  mode: "direkciya" | "kafedra";
  listSection: "work" | "archive";
  savedTeacherId: string;
  currentFilter: string;
}): string | null {
  if (input.mode !== "direkciya" || input.listSection !== "work") return null;
  if (input.savedTeacherId) return input.savedTeacherId;
  if (input.currentFilter !== "unassigned" && input.currentFilter !== "all") {
    return "unassigned";
  }
  return null;
}
