/**
 * Список и разрешение демо-аккаунтов (только при isDemoLoginAllowed).
 * Предпочитает org_school_qa, иначе org_demo.
 */
import { and, eq, inArray } from "drizzle-orm";

import { DEMO_ORG_ID, DEMO_PASSWORD } from "@/server/db/seed";
import {
  SCHOOL_ORG_ID,
  schoolStudents,
  schoolTeachers,
} from "@/server/db/seed-school";
import {
  memberships,
  organizations,
  students,
  teachers,
  users,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { notFound } from "@/server/errors";

export const DEMO_LOGIN_PASSWORD = DEMO_PASSWORD;

export type DemoAccount = {
  id: string;
  role: "director" | "teacher" | "student";
  fullName: string;
  email: string;
  teacherId?: string;
  studentId?: string;
  href: string;
  group: "director" | "teachers" | "students";
  note?: string;
};

async function orgExists(db: AppDb, orgId: string) {
  const [row] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return Boolean(row);
}

export async function resolvePreferredDemoOrgId(db: AppDb): Promise<string> {
  if (await orgExists(db, SCHOOL_ORG_ID)) return SCHOOL_ORG_ID;
  if (await orgExists(db, DEMO_ORG_ID)) return DEMO_ORG_ID;
  throw notFound("Нет демо-организации. Запустите npm run start:local или db:seed:school");
}

export async function listDemoAccounts(db: AppDb): Promise<{
  organizationId: string;
  accounts: DemoAccount[];
}> {
  const organizationId = await resolvePreferredDemoOrgId(db);
  const accounts: DemoAccount[] = [];

  const dirs = await db
    .select({
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.role, "director")
      )
    )
    .limit(5);

  for (const d of dirs) {
    accounts.push({
      id: `dir_${d.userId}`,
      role: "director",
      fullName: d.fullName,
      email: d.email,
      href: "/direkciya",
      group: "director",
    });
  }

  const teacherRows = await db
    .select()
    .from(teachers)
    .where(eq(teachers.organizationId, organizationId));

  for (const t of teacherRows) {
    accounts.push({
      id: `tch_${t.id}`,
      role: "teacher",
      fullName: t.fullName,
      email: t.email ?? `${t.id}@demo.local`,
      teacherId: t.id,
      href: "/kafedra",
      group: "teachers",
      note: (t.subjects as string[] | null)?.[0],
    });
  }

  const studentRows = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      primaryTeacherId: students.primaryTeacherId,
      userId: students.userId,
      email: users.email,
    })
    .from(students)
    .leftJoin(users, eq(users.id, students.userId))
    .where(eq(students.organizationId, organizationId));

  for (const s of studentRows) {
    accounts.push({
      id: `stu_${s.id}`,
      role: "student",
      fullName: s.fullName,
      email: s.email ?? `${s.id}@demo.local`,
      studentId: s.id,
      href: "/auditoria",
      group: "students",
      note: s.primaryTeacherId ? undefined : "без преподавателя",
    });
  }

  accounts.sort((a, b) => {
    const order = { director: 0, teachers: 1, students: 2 };
    const g = order[a.group] - order[b.group];
    if (g !== 0) return g;
    return a.fullName.localeCompare(b.fullName, "ru");
  });

  return { organizationId, accounts };
}

/**
 * Email для демо-входа по роли и опциональным id профиля.
 */
export async function resolveDemoLoginEmail(
  db: AppDb,
  input: {
    role: "director" | "teacher" | "student";
    teacherId?: string;
    studentId?: string;
    email?: string;
  }
): Promise<string> {
  if (input.email?.trim()) {
    return input.email.trim().toLowerCase();
  }

  const orgId = await resolvePreferredDemoOrgId(db);

  if (input.role === "director") {
    const [d] = await db
      .select({ email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.organizationId, orgId),
          eq(memberships.role, "director")
        )
      )
      .limit(1);
    if (d?.email) return d.email;
    return orgId === SCHOOL_ORG_ID
      ? "director@umba-school.test"
      : "director@demo.local";
  }

  if (input.role === "teacher") {
    let tid = input.teacherId;
    let [t] = tid
      ? await db.select().from(teachers).where(eq(teachers.id, tid)).limit(1)
      : [];
    if (!t) {
      [t] = await db
        .select()
        .from(teachers)
        .where(eq(teachers.organizationId, orgId))
        .limit(1);
      tid = t?.id;
    }
    if (!t || !tid) throw notFound("Преподаватель не найден в демо-данных");
    if (t.email) return t.email.toLowerCase();
    if (t.userId) {
      const [u] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, t.userId))
        .limit(1);
      if (u?.email) return u.email.toLowerCase();
    }
    throw notFound("Преподаватель не найден в демо-данных");
  }

  let sid = input.studentId;
  let [s] = sid
    ? await db.select().from(students).where(eq(students.id, sid)).limit(1)
    : [];
  if (!s) {
    [s] = await db
      .select()
      .from(students)
      .where(eq(students.organizationId, orgId))
      .limit(1);
    sid = s?.id;
  }
  if (!s || !sid) throw notFound("Ученик не найден в демо-данных");
  if (s.userId) {
    const [u] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, s.userId))
      .limit(1);
    if (u?.email) return u.email.toLowerCase();
  }
  if (orgId === SCHOOL_ORG_ID) {
    const n = sid.replace(/^sch_s/, "");
    return `student${n}@umba-school.test`;
  }
  return `${sid}@demo.local`;
}

/** Для тестов: убедиться, что в school seed ожидаемые email на месте. */
export function schoolSeedLoginHints() {
  return {
    director: "director@umba-school.test",
    teachers: schoolTeachers().map((t) => t.email),
    students: schoolStudents().map((s) => s.email),
    password: "(DEMO_PASSWORD / SCHOOL_PASSWORD — не логировать)",
  };
}

export async function countSchoolSeed(db: AppDb) {
  const orgId = SCHOOL_ORG_ID;
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return null;

  const teacherIds = schoolTeachers().map((t) => t.id);
  const studentIds = schoolStudents().map((s) => s.id);

  const teacherRows =
    teacherIds.length > 0
      ? await db
          .select({ id: teachers.id })
          .from(teachers)
          .where(inArray(teachers.id, teacherIds))
      : [];
  const studentRows =
    studentIds.length > 0
      ? await db
          .select({
            id: students.id,
            primaryTeacherId: students.primaryTeacherId,
          })
          .from(students)
          .where(inArray(students.id, studentIds))
      : [];

  return {
    teachers: teacherRows.length,
    students: studentRows.length,
    unassigned: studentRows.filter((s) => !s.primaryTeacherId).length,
  };
}
