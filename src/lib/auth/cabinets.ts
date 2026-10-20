export function cabinetHomeForRole(
  role: "director" | "teacher" | "student"
): string {
  if (role === "teacher") return "/kafedra";
  if (role === "student") return "/auditoria";
  return "/direkciya";
}
