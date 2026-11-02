import { currentAssignmentForStudent } from "@/lib/tariff-package";
import { assignmentTariffAlert } from "@/lib/tariff-warnings";
import type { HomeworkAssignmentStatus, StudentTariffAssignment } from "@/lib/types";

export function studentLearningLock(
  assignments: StudentTariffAssignment[],
  studentId: string
) {
  const assignment = currentAssignmentForStudent(assignments, studentId);
  const alert = assignmentTariffAlert(assignment);
  return {
    assignment,
    alert,
    locked: !alert.allowsLearning,
    message:
      alert.tone === "debt"
        ? "Тариф закончился: занятие в долг уже использовано. Продлите тариф, чтобы снова открыть теорию, тесты и домашние задания. История занятий и результаты сохранены."
        : alert.message,
  };
}

export function isHomeworkHistoryView(status: HomeworkAssignmentStatus) {
  return status === "completed" || status === "reviewed";
}
