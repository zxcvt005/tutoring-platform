/** Договорённость и факт проведения — независимые поля. */
export const TRIAL_AGREEMENT_STATUSES = [
  "not_discussed",
  "agreed",
  "not_agreed",
] as const;

export type TrialAgreementStatus = (typeof TRIAL_AGREEMENT_STATUSES)[number];

export const TRIAL_LESSON_STATUSES = [
  "planned",
  "completed",
  "cancelled",
  "no_show",
] as const;

export type TrialLessonStatus = (typeof TRIAL_LESSON_STATUSES)[number];

export const TRIAL_EVENT_TYPES = [
  "created",
  "updated",
  "rescheduled",
  "agreement_changed",
  "status_changed",
  "cancelled",
  "owner_changed",
] as const;

export type TrialEventType = (typeof TRIAL_EVENT_TYPES)[number];

export type TrialLesson = {
  id: string;
  teacherId: string;
  teacherName?: string;
  prospectName: string;
  startsAt: string;
  endsAt: string;
  teacherNotes: string;
  salesNotes?: string;
  agreementStatus: TrialAgreementStatus;
  lessonStatus: TrialLessonStatus;
  createdByUserId: string | null;
  createdByName?: string | null;
  ownerUserId: string | null;
  ownerName?: string | null;
  cancelReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Поля, которые можно отдать преподавателю и показать в расписании. */
export type TrialLessonPublic = {
  id: string;
  teacherId: string;
  prospectName: string;
  startsAt: string;
  endsAt: string;
  teacherNotes: string;
  lessonStatus: TrialLessonStatus;
};

export const trialAgreementStatusLabel: Record<TrialAgreementStatus, string> = {
  not_discussed: "Не договаривались",
  agreed: "Договорились",
  not_agreed: "Не договорились",
};

export const trialLessonStatusLabel: Record<TrialLessonStatus, string> = {
  planned: "Запланирован",
  completed: "Проведён",
  cancelled: "Отменён",
  no_show: "Неявка",
};

export function isTrialAgreementStatus(
  value: string
): value is TrialAgreementStatus {
  return (TRIAL_AGREEMENT_STATUSES as readonly string[]).includes(value);
}

export function isTrialLessonStatus(value: string): value is TrialLessonStatus {
  return (TRIAL_LESSON_STATUSES as readonly string[]).includes(value);
}

/** Только запланированный пробный занимает слот. */
export function trialOccupiesSlot(status: TrialLessonStatus): boolean {
  return status === "planned";
}

export function lessonOccupiesSlot(status: string): boolean {
  return status !== "cancelled";
}

export function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export type OccupancyBlock = {
  kind: "lesson" | "trial";
  id: string;
  startsAt: string;
  endsAt: string;
  label: string;
};

export function findOccupancyConflict(
  blocks: OccupancyBlock[],
  draft: { id?: string; startsAt: string; endsAt: string }
): OccupancyBlock | null {
  const a0 = new Date(draft.startsAt).getTime();
  const a1 = new Date(draft.endsAt).getTime();
  for (const block of blocks) {
    if (draft.id && block.id === draft.id) continue;
    const b0 = new Date(block.startsAt).getTime();
    const b1 = new Date(block.endsAt).getTime();
    if (rangesOverlap(a0, a1, b0, b1)) return block;
  }
  return null;
}

export function occupancyConflictMessage(block: OccupancyBlock): string {
  const from = new Date(block.startsAt);
  const to = new Date(block.endsAt);
  const fmt = (d: Date) =>
    d.toLocaleString("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  const kindLabel =
    block.kind === "trial" ? "пробным уроком" : "обычным занятием";
  return `Слот занят ${kindLabel} ${fmt(from)}–${fmt(to)}${
    block.label ? ` (${block.label})` : ""
  }`;
}
