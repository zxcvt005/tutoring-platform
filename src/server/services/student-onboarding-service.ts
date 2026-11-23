import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import type { AuthContext } from "@/server/authz/context";
import { requireRoles } from "@/server/authz/require";
import {
  accountInvitations,
  studentAvailabilitySlots,
  students,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import {
  conflict,
  forbidden,
  notFound,
  validationError,
} from "@/server/errors";
import {
  buildInviteUrl,
  createProfileInvitation,
  hashInviteToken,
  INVITE_TTL_MS,
} from "@/server/services/invitation-service";
import {
  MIN_AVAILABILITY_SLOTS,
  normalizeAvailabilitySlots,
} from "@/lib/students/availability";
import type {
  StudentAvailabilitySlot,
  StudentGrade,
  StudentOnboardingStatus,
} from "@/lib/types";

/** Внутренний placeholder: не показывается в основном списке учеников. */
export const ENROLLMENT_PLACEHOLDER_NAME = "Новый ученик";

export type EnrollmentInviteStatus =
  | "awaiting_registration"
  | "filling_profile"
  | "picking_schedule"
  | "completed";

export const ENROLLMENT_STATUS_LABEL: Record<EnrollmentInviteStatus, string> = {
  awaiting_registration: "Ожидает регистрации",
  filling_profile: "Заполняет анкету",
  picking_schedule: "Выбирает расписание",
  completed: "Регистрация завершена",
};

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

function createInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

function trimRequired(value: string | null | undefined, label: string) {
  const v = (value ?? "").trim();
  if (!v) throw validationError(`Укажите ${label}`);
  return v;
}

function assertGrade(grade: string): StudentGrade {
  if (
    grade !== "7" &&
    grade !== "8" &&
    grade !== "9" &&
    grade !== "10" &&
    grade !== "11"
  ) {
    throw validationError("Укажите класс (7–11)");
  }
  return grade;
}

function enrollmentStatusFromStudent(
  onboardingStatus: string
): EnrollmentInviteStatus {
  if (onboardingStatus === "invited") return "awaiting_registration";
  if (onboardingStatus === "profile_pending") return "filling_profile";
  if (onboardingStatus === "availability_pending") return "picking_schedule";
  return "completed";
}

async function loadOwnStudent(db: AppDb, ctx: AuthContext) {
  if (ctx.role !== "student" || !ctx.studentId) throw forbidden();
  const [row] = await db
    .select()
    .from(students)
    .where(
      and(
        eq(students.id, ctx.studentId),
        eq(students.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!row) throw notFound("Ученик не найден");
  return row;
}

async function loadStudentForStaff(
  db: AppDb,
  ctx: AuthContext,
  studentId: string
) {
  requireRoles(ctx, ["director", "teacher", "assistant", "press"]);
  const [row] = await db
    .select()
    .from(students)
    .where(
      and(
        eq(students.id, studentId),
        eq(students.organizationId, ctx.organizationId)
      )
    )
    .limit(1);
  if (!row) throw notFound("Ученик не найден");
  if (ctx.role === "teacher") {
    if (row.primaryTeacherId !== ctx.teacherId) {
      throw forbidden("Доступны только ваши ученики");
    }
    // В общем списке только после анкеты (complete / legacy availability_pending).
    if (
      row.onboardingStatus !== "complete" &&
      row.onboardingStatus !== "availability_pending"
    ) {
      throw forbidden("Регистрация ученика ещё не завершена");
    }
  }
  return row;
}

/**
 * Создаёт enrollment-приглашение без ручной карточки директора.
 * Технически нужен student_id в account_invitations — создаётся скрытый
 * placeholder (onboardingStatus=invited), который не попадает в основной список.
 */
export async function createStudentEnrollmentInvitation(
  db: AppDb,
  ctx: AuthContext
) {
  requireRoles(ctx, ["director", "press"]);
  const studentId = newId("st");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  const rawToken = createInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const inviteId = newId("inv");

  await db.transaction(async (tx) => {
    await tx.insert(students).values({
      id: studentId,
      organizationId: ctx.organizationId,
      userId: null,
      primaryTeacherId: null,
      fullName: ENROLLMENT_PLACEHOLDER_NAME,
      grade: null,
      telegram: null,
      phone: null,
      parentName: null,
      parentContacts: null,
      learningGoal: null,
      onboardingStatus: "invited",
      status: "active",
      notes: null,
      createdAt: now,
      updatedAt: now,
    });

    await tx.insert(accountInvitations).values({
      id: inviteId,
      organizationId: ctx.organizationId,
      kind: "student",
      teacherId: null,
      studentId,
      tokenHash,
      rawToken,
      createdByUserId: ctx.userId,
      expiresAt,
    });
  });

  return {
    studentId,
    invitationId: inviteId,
    inviteUrl: buildInviteUrl(rawToken),
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
    status: "awaiting_registration" as const,
    statusLabel: ENROLLMENT_STATUS_LABEL.awaiting_registration,
    onboardingStatus: "invited" as const,
  };
}

export async function listStudentEnrollmentInvitations(
  db: AppDb,
  ctx: AuthContext
) {
  requireRoles(ctx, ["director", "press", "assistant"]);

  const incomplete = await db
    .select()
    .from(students)
    .where(
      and(
        eq(students.organizationId, ctx.organizationId),
        ne(students.onboardingStatus, "complete")
      )
    )
    .orderBy(desc(students.createdAt));

  const usedInvites = await db
    .select({
      id: accountInvitations.id,
      studentId: accountInvitations.studentId,
      createdAt: accountInvitations.createdAt,
      expiresAt: accountInvitations.expiresAt,
      usedAt: accountInvitations.usedAt,
      revokedAt: accountInvitations.revokedAt,
      rawToken: accountInvitations.rawToken,
    })
    .from(accountInvitations)
    .where(
      and(
        eq(accountInvitations.organizationId, ctx.organizationId),
        eq(accountInvitations.kind, "student")
      )
    )
    .orderBy(desc(accountInvitations.createdAt));

  const inviteByStudent = new Map<
    string,
    (typeof usedInvites)[number]
  >();
  for (const inv of usedInvites) {
    if (!inv.studentId) continue;
    if (inviteByStudent.has(inv.studentId)) continue;
    inviteByStudent.set(inv.studentId, inv);
  }

  const completedIds = [...inviteByStudent.entries()]
    .filter(([, inv]) => inv.usedAt)
    .map(([sid]) => sid)
    .filter((sid) => !incomplete.some((s) => s.id === sid));

  const completedRows =
    completedIds.length === 0
      ? []
      : await db
          .select()
          .from(students)
          .where(
            and(
              eq(students.organizationId, ctx.organizationId),
              eq(students.onboardingStatus, "complete"),
              inArray(students.id, completedIds.slice(0, 40))
            )
          )
          .orderBy(desc(students.updatedAt))
          .limit(30);

  const allStudents = [...incomplete, ...completedRows];

  return {
    invitations: allStudents.map((s) => {
      const status = enrollmentStatusFromStudent(s.onboardingStatus);
      const invite = inviteByStudent.get(s.id);
      const displayName =
        s.fullName === ENROLLMENT_PLACEHOLDER_NAME || !s.fullName.trim()
          ? "Без имени"
          : s.fullName;
      const canCopyLink =
        status === "awaiting_registration" &&
        Boolean(invite?.rawToken) &&
        !invite?.revokedAt &&
        !invite?.usedAt;
      return {
        studentId: s.id,
        invitationId: invite?.id ?? null,
        displayName,
        status,
        statusLabel: ENROLLMENT_STATUS_LABEL[status],
        onboardingStatus: s.onboardingStatus as StudentOnboardingStatus,
        createdAt: (invite?.createdAt ?? s.createdAt).toISOString(),
        expiresAt: invite?.expiresAt?.toISOString() ?? null,
        inviteUrl:
          canCopyLink && invite?.rawToken
            ? buildInviteUrl(invite.rawToken)
            : null,
        canCopyLink,
      };
    }),
  };
}

export async function markStudentProfilePendingAfterInvite(
  db: AppDb,
  studentId: string,
  organizationId: string
) {
  const [row] = await db
    .select({
      id: students.id,
      onboardingStatus: students.onboardingStatus,
    })
    .from(students)
    .where(
      and(
        eq(students.id, studentId),
        eq(students.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!row) return;
  if (row.onboardingStatus === "invited") {
    await db
      .update(students)
      .set({ onboardingStatus: "profile_pending", updatedAt: new Date() })
      .where(eq(students.id, studentId));
  }
}

export async function getStudentOnboardingState(db: AppDb, ctx: AuthContext) {
  const row = await loadOwnStudent(db, ctx);
  const slots = await listAvailabilitySlots(db, row.id);
  return {
    studentId: row.id,
    onboardingStatus: row.onboardingStatus as StudentOnboardingStatus,
    profile: {
      fullName: row.fullName === ENROLLMENT_PLACEHOLDER_NAME ? "" : row.fullName,
      telegram: row.telegram ?? "",
      parentName: row.parentName ?? "",
      parentContacts: row.parentContacts ?? "",
      grade: (row.grade as StudentGrade | null) ?? null,
      learningGoal: row.learningGoal ?? "",
      notes: row.notes ?? "",
    },
    availabilitySlots: slots,
  };
}

export async function saveStudentOnboardingProfile(
  db: AppDb,
  ctx: AuthContext,
  input: {
    fullName: string;
    telegram: string;
    parentName: string;
    parentContacts: string;
    grade: string;
    learningGoal: string;
    notes?: string | null;
  }
) {
  const row = await loadOwnStudent(db, ctx);
  if (
    row.onboardingStatus !== "profile_pending" &&
    row.onboardingStatus !== "availability_pending" &&
    row.onboardingStatus !== "complete"
  ) {
    throw conflict("Сначала завершите регистрацию по ссылке приглашения");
  }

  const fullName = trimRequired(input.fullName, "ФИО ученика");
  const telegram = trimRequired(input.telegram, "Telegram ученика");
  const parentName = trimRequired(input.parentName, "ФИО родителя");
  const parentContacts = trimRequired(
    input.parentContacts,
    "контакт родителя (Telegram или телефон)"
  );
  const grade = assertGrade(String(input.grade ?? "").trim());
  const learningGoal = trimRequired(input.learningGoal, "цель обучения");
  const notes = (input.notes ?? "").trim() || null;

  // Анкета = появление в общем списке. Удобное время опционально.
  const nextStatus: StudentOnboardingStatus = "complete";

  await db
    .update(students)
    .set({
      fullName,
      telegram,
      parentName,
      parentContacts,
      grade,
      learningGoal,
      notes,
      onboardingStatus: nextStatus,
      updatedAt: new Date(),
    })
    .where(eq(students.id, row.id));

  return { ok: true as const, onboardingStatus: nextStatus };
}

export async function listAvailabilitySlots(db: AppDb, studentId: string) {
  const rows = await db
    .select({
      weekday: studentAvailabilitySlots.weekday,
      hourStart: studentAvailabilitySlots.hourStart,
    })
    .from(studentAvailabilitySlots)
    .where(eq(studentAvailabilitySlots.studentId, studentId));
  return normalizeAvailabilitySlots(rows);
}

export async function replaceAvailabilitySlots(
  db: AppDb,
  organizationId: string,
  studentId: string,
  slots: StudentAvailabilitySlot[],
  opts?: { requireMin?: boolean }
) {
  const normalized = normalizeAvailabilitySlots(slots);
  if (opts?.requireMin !== false && normalized.length < MIN_AVAILABILITY_SLOTS) {
    throw validationError(
      `Выберите минимум ${MIN_AVAILABILITY_SLOTS} свободных слота`
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(studentAvailabilitySlots)
      .where(eq(studentAvailabilitySlots.studentId, studentId));
    if (normalized.length) {
      await tx.insert(studentAvailabilitySlots).values(
        normalized.map((slot) => ({
          id: newId("sav"),
          organizationId,
          studentId,
          weekday: slot.weekday,
          hourStart: slot.hourStart,
        }))
      );
    }
  });

  return normalized;
}

export async function saveStudentOnboardingAvailability(
  db: AppDb,
  ctx: AuthContext,
  slots: StudentAvailabilitySlot[]
) {
  const row = await loadOwnStudent(db, ctx);
  if (
    row.onboardingStatus !== "availability_pending" &&
    row.onboardingStatus !== "complete"
  ) {
    throw conflict("Сначала заполните анкету");
  }

  // Опциональный шаг: можно сохранить пустой набор (очистить) или слоты.
  const saved = await replaceAvailabilitySlots(
    db,
    ctx.organizationId,
    row.id,
    slots,
    { requireMin: false }
  );

  await db
    .update(students)
    .set({ onboardingStatus: "complete", updatedAt: new Date() })
    .where(eq(students.id, row.id));

  return {
    ok: true as const,
    onboardingStatus: "complete" as const,
    availabilitySlots: saved,
  };
}

export async function getStudentAvailabilityForViewer(
  db: AppDb,
  ctx: AuthContext,
  studentId: string
) {
  const row = await loadStudentForStaff(db, ctx, studentId);
  const slots = await listAvailabilitySlots(db, row.id);
  return {
    studentId: row.id,
    fullName: row.fullName,
    onboardingStatus: row.onboardingStatus as StudentOnboardingStatus,
    availabilitySlots: slots,
    profile: {
      fullName: row.fullName,
      telegram: row.telegram,
      parentName: row.parentName,
      parentContacts: row.parentContacts,
      grade: row.grade,
      learningGoal: row.learningGoal,
      notes: row.notes,
    },
  };
}

export async function updateStudentAvailabilityByStaff(
  db: AppDb,
  ctx: AuthContext,
  studentId: string,
  slots: StudentAvailabilitySlot[]
) {
  requireRoles(ctx, ["director", "assistant", "press"]);
  const row = await loadStudentForStaff(db, ctx, studentId);
  const saved = await replaceAvailabilitySlots(
    db,
    ctx.organizationId,
    row.id,
    slots,
    { requireMin: false }
  );
  return { ok: true as const, availabilitySlots: saved };
}

/** Re-export for callers that create invite for existing incomplete student. */
export { createProfileInvitation };
