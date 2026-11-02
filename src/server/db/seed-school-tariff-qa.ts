/**
 * Намеренные QA-ученики с остатком тарифа 2 / 1 / 0 / −1.
 * Идемпотентно: не трогает Дмитрия Алексеева и не создаёт дубликаты.
 */
import { and, eq } from "drizzle-orm";

import { addAppDateKey, appDateKey, fromAppDateTime } from "@/lib/app-time";
import { hashPassword } from "@/server/auth/password";
import type { AuthContext } from "@/server/authz/context";
import {
  memberships,
  organizations,
  students,
  teachers,
  users,
} from "@/server/db/schema";
import {
  SCHOOL_ORG_ID,
  SCHOOL_PASSWORD,
  SCHOOL_TARIFF_QA_STUDENT_IDS,
} from "@/server/db/seed-school";
import type { AppDb } from "@/server/db/types";
import {
  findDebitAssignment,
  getAssignmentBalance,
} from "@/server/services/lesson-balance";
import {
  completeLesson,
  upsertLesson,
  upsertStudent,
} from "@/server/services/platform-mutations";
import {
  adminMarkPaymentPaid,
  assignTariffToStudent,
  upsertTariff,
} from "@/server/services/tariffs-service";

export const SCHOOL_TARIFF_QA_TARIFF_ID = "sch_tariff_qa_balance_2";
const TEACHER_ID = "sch_t1";

export type TariffQaSpec = {
  id: (typeof SCHOOL_TARIFF_QA_STUDENT_IDS)[number];
  fullName: string;
  email: string;
  targetRemaining: 2 | 1 | 0 | -1;
  lessonIds: string[];
};

export const SCHOOL_TARIFF_QA_SPECS: TariffQaSpec[] = [
  {
    id: "s_test_tariff_2",
    fullName: "ТЕСТ Тариф 2 занятия",
    email: "test-tariff-2@umba-school.test",
    targetRemaining: 2,
    lessonIds: [],
  },
  {
    id: "s_test_tariff_1",
    fullName: "ТЕСТ Тариф 1 занятие",
    email: "test-tariff-1@umba-school.test",
    targetRemaining: 1,
    lessonIds: ["l_test_tariff_1_d1"],
  },
  {
    id: "s_test_tariff_0",
    fullName: "ТЕСТ Тариф 0 занятий",
    email: "test-tariff-0@umba-school.test",
    targetRemaining: 0,
    lessonIds: ["l_test_tariff_0_d1", "l_test_tariff_0_d2"],
  },
  {
    id: "s_test_tariff_m1",
    fullName: "ТЕСТ Тариф -1 занятие",
    email: "test-tariff-m1@umba-school.test",
    targetRemaining: -1,
    lessonIds: [
      "l_test_tariff_m1_d1",
      "l_test_tariff_m1_d2",
      "l_test_tariff_m1_d3",
    ],
  },
];

export type TariffQaEnsureResult = {
  studentId: string;
  fullName: string;
  remaining: number | null;
  restored: boolean;
};

function directorCtx(user: {
  id: string;
  email: string;
  fullName: string;
}): AuthContext {
  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    organizationId: SCHOOL_ORG_ID,
    role: "director",
    teacherId: null,
    studentId: null,
    sessionId: "script_local_tariff_qa",
    impersonation: null,
  };
}

function futureSlot(daysAhead: number, hour: number, minute: number) {
  const key = addAppDateKey(appDateKey(new Date()), daysAhead);
  const start = fromAppDateTime(
    key,
    `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
  );
  return { startsAt: start, endsAt: new Date(start.getTime() + 45 * 60_000) };
}

/**
 * Создаёт или восстанавливает 4 QA-ученика. Если остаток уже верный — ничего
 * не списывает повторно. Не изменяет sch_s01 (Дмитрий Алексеев).
 */
export async function ensureSchoolTariffQaFixtures(
  db: AppDb
): Promise<TariffQaEnsureResult[]> {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, SCHOOL_ORG_ID))
    .limit(1);
  if (!org) {
    throw new Error(
      "Организация Неодин (org_school_qa) не найдена. Сначала заполните школу."
    );
  }

  const [teacher] = await db
    .select()
    .from(teachers)
    .where(eq(teachers.id, TEACHER_ID))
    .limit(1);
  if (!teacher || teacher.organizationId !== SCHOOL_ORG_ID) {
    throw new Error("Преподаватель sch_t1 не найден в org_school_qa");
  }

  const [directorUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, "director@umba-school.test"))
    .limit(1);
  if (!directorUser) {
    throw new Error("Директор director@umba-school.test не найден");
  }
  const ctx = directorCtx(directorUser);
  const passwordHash = await hashPassword(SCHOOL_PASSWORD);

  const tariff = await upsertTariff(db, ctx, {
    id: SCHOOL_TARIFF_QA_TARIFF_ID,
    name: "ТЕСТ пакет 2 занятия",
    price: 1000,
    durationDays: 14,
    lessonsLimit: 2,
    weeklyFrequency: 2,
    features: ["individual_lessons", "homework"],
    includesText: "QA-пакет для проверки остатка 2 / 1 / 0 / -1",
    adminNotes: "Тестовый тариф. Не использовать для реальных учеников.",
  });

  const results: TariffQaEnsureResult[] = [];
  for (const spec of SCHOOL_TARIFF_QA_SPECS) {
    await ensureStudent(db, ctx, spec, passwordHash);
    const current = await findDebitAssignment(db, SCHOOL_ORG_ID, spec.id);
    if (current) {
      const balance = await getAssignmentBalance(
        db,
        current.id,
        current.lessonsLimitSnapshot
      );
      if (balance.remaining === spec.targetRemaining) {
        results.push({
          studentId: spec.id,
          fullName: spec.fullName,
          remaining: balance.remaining,
          restored: false,
        });
        continue;
      }
    }

    await ensurePaidTwoLessonPackage(db, ctx, spec.id, tariff.id);
    await syncDebits(db, ctx, spec.id, spec);
    const restored = await findDebitAssignment(db, SCHOOL_ORG_ID, spec.id);
    const balance = restored
      ? await getAssignmentBalance(
          db,
          restored.id,
          restored.lessonsLimitSnapshot
        )
      : null;
    results.push({
      studentId: spec.id,
      fullName: spec.fullName,
      remaining: balance?.remaining ?? null,
      restored: true,
    });
  }
  return results;
}

async function ensureStudent(
  db: AppDb,
  ctx: AuthContext,
  spec: TariffQaSpec,
  passwordHash: string
) {
  const id = spec.id;
  await upsertStudent(db, ctx, {
    id,
    fullName: spec.fullName,
    grade: "11",
    status: "active",
    teacherId: TEACHER_ID,
    notes: `QA остаток занятий: ${spec.targetRemaining}. Тестовая карточка.`,
  });

  const uid = `user_${id}`;
  const [emailOwner] = await db
    .select()
    .from(users)
    .where(eq(users.email, spec.email))
    .limit(1);
  const userId = emailOwner?.id ?? uid;
  if (!emailOwner) {
    await db.insert(users).values({
      id: uid,
      email: spec.email,
      passwordHash,
      fullName: spec.fullName,
      status: "active",
    });
  } else {
    await db
      .update(users)
      .set({ fullName: spec.fullName, updatedAt: new Date() })
      .where(eq(users.id, emailOwner.id));
  }

  const [mem] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, SCHOOL_ORG_ID),
        eq(memberships.userId, userId)
      )
    )
    .limit(1);
  if (!mem) {
    await db.insert(memberships).values({
      id: `mem_${id}`,
      organizationId: SCHOOL_ORG_ID,
      userId,
      role: "student",
    });
  }

  await db
    .update(students)
    .set({ userId, updatedAt: new Date() })
    .where(eq(students.id, id));

  return id;
}

async function ensurePaidTwoLessonPackage(
  db: AppDb,
  ctx: AuthContext,
  studentId: string,
  tariffId: string
) {
  const current = await findDebitAssignment(db, SCHOOL_ORG_ID, studentId);
  if (
    current &&
    current.tariffId === tariffId &&
    Number(current.lessonsLimitSnapshot) === 2 &&
    current.paymentStatus === "paid"
  ) {
    return current;
  }

  const assigned = await assignTariffToStudent(db, ctx, {
    studentId,
    tariffId,
  });
  if (!assigned.paymentId) {
    throw new Error(`Не удалось создать платёж для ${studentId}`);
  }
  await adminMarkPaymentPaid(db, ctx, {
    paymentId: assigned.paymentId,
    reason: "Тестовая фиксация оплаты (QA остатка занятий)",
  });
  const paid = await findDebitAssignment(db, SCHOOL_ORG_ID, studentId);
  if (!paid) throw new Error(`Не удалось активировать тариф для ${studentId}`);
  return paid;
}

async function syncDebits(
  db: AppDb,
  ctx: AuthContext,
  studentId: string,
  spec: TariffQaSpec
) {
  const needed = 2 - spec.targetRemaining;
  for (let i = 0; i < spec.lessonIds.length; i++) {
    const lessonId = spec.lessonIds[i]!;
    const slot = futureSlot(3 + i * 2, 7, 10 + i);
    await upsertLesson(db, ctx, {
      id: lessonId,
      teacherId: TEACHER_ID,
      studentIds: [studentId],
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      status: "planned",
      subject: "ТЕСТ тариф",
    });
    if (i < needed) {
      await completeLesson(db, ctx, {
        lessonId,
        topics: [
          {
            title:
              i === needed - 1 && spec.targetRemaining === -1
                ? "ТЕСТ занятие в долг"
                : "ТЕСТ списание тарифа",
          },
        ],
        attendances: [{ studentId, status: "present" }],
      });
    }
  }
}
