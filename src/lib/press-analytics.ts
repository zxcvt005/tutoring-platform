import { isContactOverdue, type ContactTaskStatus } from "@/lib/press-contacts";
import type {
  TrialAgreementStatus,
  TrialLessonStatus,
} from "@/lib/trial-lessons";

export type PressAnalyticsTrial = {
  id: string;
  teacherId: string;
  ownerUserId: string | null;
  createdByUserId: string | null;
  createdAt: string;
  startsAt: string;
  agreementStatus: TrialAgreementStatus;
  lessonStatus: TrialLessonStatus;
};

export type PressAnalyticsContact = {
  id: string;
  studentId: string;
  dueAt: string;
  status: ContactTaskStatus;
  completedAt: string | null;
  createdByUserId: string | null;
};

export type PressAnalyticsFilters = {
  from: Date;
  to: Date;
  teacherId?: string | null;
  ownerUserId?: string | null;
  now?: Date;
};

export type PressFunnelStep = {
  key: string;
  label: string;
  count: number;
  /** Процент от указанного знаменателя; null если знаменатель 0. */
  percent: number | null;
  denominator: number;
  denominatorLabel: string;
};

export type PressAnalyticsResult = {
  created: number;
  agreed: number;
  notAgreed: number;
  notDiscussed: number;
  completed: number;
  cancelled: number;
  noShow: number;
  agreementRate: number | null;
  completionRate: number | null;
  cancelOrNoShowRate: number | null;
  occurredDenominator: number;
  contactsActive: number;
  contactsCompleted: number;
  contactsOverdue: number;
  funnel: PressFunnelStep[];
  byDay: { dateKey: string; created: number; completed: number }[];
  byTeacher: {
    teacherId: string;
    assigned: number;
    completed: number;
  }[];
  byAgreement: Record<TrialAgreementStatus, number>;
  byLessonStatus: Record<TrialLessonStatus, number>;
  byOwner: {
    ownerUserId: string | null;
    created: number;
    agreed: number;
    completed: number;
  }[];
};

function inRange(iso: string, from: Date, to: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

function pct(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
}

function dateKeyMoscow(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const bag: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") bag[p.type] = p.value;
  }
  return `${bag.year}-${bag.month}-${bag.day}`;
}

export function computePressAnalytics(
  trials: PressAnalyticsTrial[],
  contacts: PressAnalyticsContact[],
  filters: PressAnalyticsFilters
): PressAnalyticsResult {
  const now = filters.now ?? new Date();
  const scopedTrials = trials.filter((t) => {
    if (!inRange(t.createdAt, filters.from, filters.to)) return false;
    if (filters.teacherId && t.teacherId !== filters.teacherId) return false;
    if (filters.ownerUserId && t.ownerUserId !== filters.ownerUserId) {
      return false;
    }
    return true;
  });

  const created = scopedTrials.length;
  const agreed = scopedTrials.filter((t) => t.agreementStatus === "agreed").length;
  const notAgreed = scopedTrials.filter(
    (t) => t.agreementStatus === "not_agreed"
  ).length;
  const notDiscussed = scopedTrials.filter(
    (t) => t.agreementStatus === "not_discussed"
  ).length;
  const completed = scopedTrials.filter(
    (t) => t.lessonStatus === "completed"
  ).length;
  const cancelled = scopedTrials.filter(
    (t) => t.lessonStatus === "cancelled"
  ).length;
  const noShow = scopedTrials.filter((t) => t.lessonStatus === "no_show").length;

  const occurred = scopedTrials.filter((t) => {
    if (t.lessonStatus === "completed") return true;
    if (t.lessonStatus === "cancelled" || t.lessonStatus === "no_show") {
      return true;
    }
    return t.lessonStatus === "planned" && new Date(t.startsAt) <= now;
  });
  const occurredDenominator = occurred.length;
  const occurredCompleted = occurred.filter(
    (t) => t.lessonStatus === "completed"
  ).length;
  const occurredCancelOrNoShow = occurred.filter(
    (t) => t.lessonStatus === "cancelled" || t.lessonStatus === "no_show"
  ).length;

  const scopedContacts = contacts.filter((c) => {
    if (filters.ownerUserId && c.createdByUserId !== filters.ownerUserId) {
      return false;
    }
    const at = c.status === "completed" && c.completedAt ? c.completedAt : c.dueAt;
    return inRange(at, filters.from, filters.to);
  });

  const contactsActive = contacts.filter((c) => {
    if (c.status !== "scheduled") return false;
    if (filters.ownerUserId && c.createdByUserId !== filters.ownerUserId) {
      return false;
    }
    return true;
  }).length;
  const contactsCompleted = scopedContacts.filter(
    (c) => c.status === "completed"
  ).length;
  const contactsOverdue = contacts.filter((c) => {
    if (filters.ownerUserId && c.createdByUserId !== filters.ownerUserId) {
      return false;
    }
    return isContactOverdue(c, now);
  }).length;

  const funnel: PressFunnelStep[] = [
    {
      key: "created",
      label: "Создан пробный урок",
      count: created,
      percent: pct(created, created),
      denominator: created,
      denominatorLabel: "созданных пробных за период",
    },
    {
      key: "agreed",
      label: "Договорённость достигнута",
      count: agreed,
      percent: pct(agreed, created),
      denominator: created,
      denominatorLabel: "созданных пробных за период",
    },
    {
      key: "completed",
      label: "Пробный урок проведён",
      count: completed,
      percent: pct(occurredCompleted, occurredDenominator),
      denominator: occurredDenominator,
      denominatorLabel: "запланированных и уже наступивших пробных за период",
    },
    {
      key: "cancelled",
      label: "Отменён",
      count: cancelled,
      percent: pct(
        occurred.filter((t) => t.lessonStatus === "cancelled").length,
        occurredDenominator
      ),
      denominator: occurredDenominator,
      denominatorLabel: "запланированных и уже наступивших пробных за период",
    },
    {
      key: "no_show",
      label: "Неявка",
      count: noShow,
      percent: pct(
        occurred.filter((t) => t.lessonStatus === "no_show").length,
        occurredDenominator
      ),
      denominator: occurredDenominator,
      denominatorLabel: "запланированных и уже наступивших пробных за период",
    },
  ];

  const byDayMap = new Map<string, { created: number; completed: number }>();
  for (const t of scopedTrials) {
    const key = dateKeyMoscow(t.createdAt);
    const row = byDayMap.get(key) ?? { created: 0, completed: 0 };
    row.created += 1;
    if (t.lessonStatus === "completed") row.completed += 1;
    byDayMap.set(key, row);
  }
  const byDay = [...byDayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, v]) => ({ dateKey, ...v }));

  const byTeacherMap = new Map<string, { assigned: number; completed: number }>();
  for (const t of scopedTrials) {
    const row = byTeacherMap.get(t.teacherId) ?? { assigned: 0, completed: 0 };
    row.assigned += 1;
    if (t.lessonStatus === "completed") row.completed += 1;
    byTeacherMap.set(t.teacherId, row);
  }
  const byTeacher = [...byTeacherMap.entries()].map(([teacherId, v]) => ({
    teacherId,
    ...v,
  }));

  const byAgreement: Record<TrialAgreementStatus, number> = {
    not_discussed: notDiscussed,
    agreed,
    not_agreed: notAgreed,
  };
  const byLessonStatus: Record<TrialLessonStatus, number> = {
    planned: scopedTrials.filter((t) => t.lessonStatus === "planned").length,
    completed,
    cancelled,
    no_show: noShow,
  };

  const byOwnerMap = new Map<
    string,
    { created: number; agreed: number; completed: number }
  >();
  for (const t of scopedTrials) {
    const key = t.ownerUserId ?? "";
    const row = byOwnerMap.get(key) ?? { created: 0, agreed: 0, completed: 0 };
    row.created += 1;
    if (t.agreementStatus === "agreed") row.agreed += 1;
    if (t.lessonStatus === "completed") row.completed += 1;
    byOwnerMap.set(key, row);
  }
  const byOwner = [...byOwnerMap.entries()].map(([id, v]) => ({
    ownerUserId: id || null,
    ...v,
  }));

  return {
    created,
    agreed,
    notAgreed,
    notDiscussed,
    completed,
    cancelled,
    noShow,
    agreementRate: pct(agreed, created),
    completionRate: pct(occurredCompleted, occurredDenominator),
    cancelOrNoShowRate: pct(occurredCancelOrNoShow, occurredDenominator),
    occurredDenominator,
    contactsActive,
    contactsCompleted,
    contactsOverdue,
    funnel,
    byDay,
    byTeacher,
    byAgreement,
    byLessonStatus,
    byOwner,
  };
}
