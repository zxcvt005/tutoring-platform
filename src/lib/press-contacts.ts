export const CONTACT_TASK_STATUSES = [
  "scheduled",
  "completed",
  "cancelled",
] as const;

export type ContactTaskStatus = (typeof CONTACT_TASK_STATUSES)[number];

export type StudentContactTask = {
  id: string;
  studentId: string;
  dueAt: string;
  reason: string;
  status: ContactTaskStatus;
  completedAt: string | null;
  reminderKey: string;
  createdByUserId: string | null;
  createdAt: string;
};

export function isContactOverdue(
  task: { status: ContactTaskStatus; dueAt: string },
  now: Date = new Date()
): boolean {
  return (
    task.status === "scheduled" && new Date(task.dueAt).getTime() <= now.getTime()
  );
}

export function contactReminderKey(taskId: string, dueAt: Date | string): string {
  const iso = dueAt instanceof Date ? dueAt.toISOString() : dueAt;
  return `contact:${taskId}:${iso}`;
}
