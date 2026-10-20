import { asc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { hashPassword } from "@/server/auth/password";
import {
  memberships,
  organizations,
  students,
  teachers,
  users,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db/types";
import { conflict, validationError } from "@/server/errors";
import { createSession } from "@/server/auth/session";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

async function resolvePublicOrganizationId(db: AppDb): Promise<string> {
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  if (!org) {
    throw validationError(
      "Школа ещё не настроена. Дождитесь первичной настройки администратора."
    );
  }
  return org.id;
}

async function assertUniqueEmail(db: AppDb, email: string) {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) throw conflict("Пользователь с таким email уже зарегистрирован");
}

function normalizeEmail(email: string) {
  const e = email.trim().toLowerCase();
  if (!e.includes("@") || e.length > 320) {
    throw validationError("Некорректный email");
  }
  return e;
}

function assertPasswordsMatch(password: string, passwordConfirm: string) {
  if (!password || !passwordConfirm) {
    throw validationError("Укажите пароль и подтверждение");
  }
  if (password !== passwordConfirm) {
    throw validationError("Пароль и подтверждение не совпадают");
  }
}

export type RegisterTeacherInput = {
  fullName: string;
  email: string;
  password: string;
  passwordConfirm: string;
  phone?: string;
  subjects?: string[];
  specializations?: string[];
  userAgent?: string | null;
  ip?: string | null;
};

export async function registerTeacher(db: AppDb, input: RegisterTeacherInput) {
  assertPasswordsMatch(input.password, input.passwordConfirm);
  const email = normalizeEmail(input.email);
  const fullName = input.fullName.trim();
  if (!fullName) throw validationError("Укажите ФИО");

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(input.password);
  } catch (e) {
    throw validationError(e instanceof Error ? e.message : "Слабый пароль");
  }

  await assertUniqueEmail(db, email);
  const organizationId = await resolvePublicOrganizationId(db);

  const userId = newId("user");
  const teacherId = newId("t");
  const phone = input.phone?.trim() || null;
  const subjects = (input.subjects ?? []).map((s) => s.trim()).filter(Boolean);
  const specializations = (input.specializations ?? [])
    .map((s) => s.trim())
    .filter(Boolean);

  await db.insert(users).values({
    id: userId,
    email,
    passwordHash,
    fullName,
    phone,
    status: "active",
  });

  await db.insert(memberships).values({
    id: newId("mem"),
    organizationId,
    userId,
    role: "teacher",
  });

  await db.insert(teachers).values({
    id: teacherId,
    organizationId,
    userId,
    fullName,
    phone,
    email,
    subjects,
    specializations: specializations.length ? specializations : null,
    status: "active",
    avatarInitials: initials(fullName),
  });

  const session = await createSession(db, {
    userId,
    userAgent: input.userAgent,
    ip: input.ip,
  });

  return {
    user: { id: userId, email, fullName },
    role: "teacher" as const,
    teacherId,
    organizationId,
    session,
  };
}

export type RegisterStudentInput = {
  fullName: string;
  email: string;
  password: string;
  passwordConfirm: string;
  contacts?: string;
  userAgent?: string | null;
  ip?: string | null;
};

export async function registerStudent(db: AppDb, input: RegisterStudentInput) {
  assertPasswordsMatch(input.password, input.passwordConfirm);
  const email = normalizeEmail(input.email);
  const fullName = input.fullName.trim();
  if (!fullName) throw validationError("Укажите ФИО");

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(input.password);
  } catch (e) {
    throw validationError(e instanceof Error ? e.message : "Слабый пароль");
  }

  await assertUniqueEmail(db, email);
  const organizationId = await resolvePublicOrganizationId(db);

  const userId = newId("user");
  const studentId = newId("s");
  const contacts = input.contacts?.trim() || null;

  await db.insert(users).values({
    id: userId,
    email,
    passwordHash,
    fullName,
    status: "active",
  });

  await db.insert(memberships).values({
    id: newId("mem"),
    organizationId,
    userId,
    role: "student",
  });

  // primaryTeacherId намеренно null — назначает Дирекция / преподаватель
  await db.insert(students).values({
    id: studentId,
    organizationId,
    userId,
    fullName,
    contacts,
    status: "active",
    primaryTeacherId: null,
  });

  const session = await createSession(db, {
    userId,
    userAgent: input.userAgent,
    ip: input.ip,
  });

  return {
    user: { id: userId, email, fullName },
    role: "student" as const,
    studentId,
    organizationId,
    session,
  };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
