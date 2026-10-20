/**
 * PostgreSQL schema (Drizzle) — этап 1.
 * Эволюционирует через SQL-миграции; не считать финальной моделью продукта.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

/** Школа / тенант */
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  ...timestamps,
}, (t) => [
  uniqueIndex("organizations_slug_uidx").on(t.slug),
]);

/** Учётные записи входа (общие для всех кабинетов) */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  /** bcrypt-хеш; placeholder-строки с префиксом `!` не принимаются verifyPassword */
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  status: text("status").notNull().default("active"),
  ...timestamps,
}, (t) => [
  uniqueIndex("users_email_uidx").on(t.email),
  check(
    "users_status_check",
    sql`${t.status} in ('active', 'paused', 'disabled')`
  ),
]);

export const memberships = pgTable("memberships", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  ...timestamps,
}, (t) => [
  uniqueIndex("memberships_org_user_uidx").on(t.organizationId, t.userId),
  index("memberships_user_idx").on(t.userId),
  check(
    "memberships_role_check",
    sql`${t.role} in ('director', 'teacher', 'student')`
  ),
]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  userAgent: text("user_agent"),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  index("sessions_user_idx").on(t.userId),
  index("sessions_expires_idx").on(t.expiresAt),
]);

export const teachers = pgTable("teachers", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  fullName: text("full_name").notNull(),
  avatarInitials: text("avatar_initials"),
  subjects: jsonb("subjects").$type<string[]>().notNull().default([]),
  specializations: jsonb("specializations").$type<string[]>(),
  phone: text("phone"),
  email: text("email"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  status: text("status").notNull().default("active"),
  lessonPrice: numeric("lesson_price", { precision: 12, scale: 2 }),
  teacherPay: numeric("teacher_pay", { precision: 12, scale: 2 }),
  defaultDurationMin: integer("default_duration_min"),
  workDays: jsonb("work_days").$type<number[]>(),
  workIntervals: jsonb("work_intervals").$type<
    { start: string; end: string }[]
  >(),
  adminNotes: text("admin_notes"),
  ...timestamps,
}, (t) => [
  index("teachers_org_idx").on(t.organizationId),
  uniqueIndex("teachers_org_user_uidx").on(t.organizationId, t.userId),
  check(
    "teachers_status_check",
    sql`${t.status} in ('active', 'inactive', 'archived')`
  ),
]);

export const students = pgTable("students", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  primaryTeacherId: text("primary_teacher_id").references(() => teachers.id, {
    onDelete: "set null",
  }),
  fullName: text("full_name").notNull(),
  contacts: text("contacts"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  ...timestamps,
}, (t) => [
  index("students_org_idx").on(t.organizationId),
  index("students_teacher_idx").on(t.primaryTeacherId),
  uniqueIndex("students_org_user_uidx").on(t.organizationId, t.userId),
  check(
    "students_status_check",
    sql`${t.status} in ('active', 'paused')`
  ),
]);

export const topicSections = pgTable("topic_sections", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  teacherId: text("teacher_id")
    .notNull()
    .references(() => teachers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
}, (t) => [
  index("topic_sections_teacher_idx").on(t.teacherId),
]);

export const topics = pgTable("topics", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  teacherId: text("teacher_id")
    .notNull()
    .references(() => teachers.id, { onDelete: "cascade" }),
  sectionId: text("section_id").references(() => topicSections.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  subject: text("subject").notNull(),
  description: text("description"),
  programNote: text("program_note"),
  status: text("status").notNull().default("active"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
}, (t) => [
  index("topics_teacher_idx").on(t.teacherId),
  index("topics_section_idx").on(t.sectionId),
  check(
    "topics_status_check",
    sql`${t.status} in ('active', 'archived')`
  ),
]);

/**
 * Шаблон теста / ДЗ.
 * questionsPublic — вопросы без ключей ответов (можно отдавать ученику после политики).
 */
export const tests = pgTable("tests", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  topicId: text("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "restrict" }),
  teacherId: text("teacher_id")
    .notNull()
    .references(() => teachers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  maxScore: numeric("max_score", { precision: 10, scale: 2 }),
  questionsPublic: jsonb("questions_public").$type<unknown[]>().notNull().default([]),
  ...timestamps,
}, (t) => [
  index("tests_topic_idx").on(t.topicId),
  index("tests_teacher_idx").on(t.teacherId),
  check(
    "tests_status_check",
    sql`${t.status} in ('draft', 'published', 'archived')`
  ),
]);

/** Ключи ответов — только сервер / преподаватель при редактировании */
export const testAnswerKeys = pgTable("test_answer_keys", {
  id: text("id").primaryKey(),
  testId: text("test_id")
    .notNull()
    .references(() => tests.id, { onDelete: "cascade" }),
  questionId: text("question_id").notNull(),
  /** correctOptionIds, correctAnswers, numericTolerance и т.п. */
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  ...timestamps,
}, (t) => [
  uniqueIndex("test_answer_keys_test_question_uidx").on(
    t.testId,
    t.questionId
  ),
]);

export const lessons = pgTable("lessons", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  teacherId: text("teacher_id")
    .notNull()
    .references(() => teachers.id, { onDelete: "cascade" }),
  topicId: text("topic_id").references(() => topics.id, {
    onDelete: "set null",
  }),
  subject: text("subject"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("planned"),
  ...timestamps,
}, (t) => [
  index("lessons_teacher_starts_idx").on(t.teacherId, t.startsAt),
  index("lessons_org_starts_idx").on(t.organizationId, t.startsAt),
  check(
    "lessons_status_check",
    sql`${t.status} in ('planned', 'done', 'cancelled')`
  ),
  check("lessons_time_check", sql`${t.endsAt} > ${t.startsAt}`),
]);

export const lessonStudents = pgTable("lesson_students", {
  lessonId: text("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  studentId: text("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.lessonId, t.studentId] }),
  index("lesson_students_student_idx").on(t.studentId),
]);

export const attendances = pgTable("attendances", {
  lessonId: text("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  studentId: text("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.lessonId, t.studentId] }),
  check(
    "attendances_status_check",
    sql`${t.status} in ('present', 'absent', 'cancelled', 'rescheduled')`
  ),
]);

export const testAssignments = pgTable("test_assignments", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  testId: text("test_id")
    .notNull()
    .references(() => tests.id, { onDelete: "restrict" }),
  topicId: text("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "restrict" }),
  teacherId: text("teacher_id")
    .notNull()
    .references(() => teachers.id, { onDelete: "cascade" }),
  studentId: text("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  lessonId: text("lesson_id").references(() => lessons.id, {
    onDelete: "set null",
  }),
  dueAt: timestamp("due_at", { withTimezone: true }),
  status: text("status").notNull().default("assigned"),
  score: numeric("score", { precision: 10, scale: 2 }),
  maxScore: numeric("max_score", { precision: 10, scale: 2 }),
  feedback: text("feedback"),
  answerText: text("answer_text"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [
  index("test_assignments_student_status_idx").on(t.studentId, t.status),
  index("test_assignments_teacher_idx").on(t.teacherId),
  index("test_assignments_test_idx").on(t.testId),
  check(
    "test_assignments_status_check",
    sql`${t.status} in ('assigned', 'in_progress', 'completed', 'reviewed', 'overdue')`
  ),
]);

/**
 * Immutable снимок на момент назначения.
 * answerKeys — серверные ключи для автопроверки этого назначения.
 */
export const assignmentSnapshots = pgTable("assignment_snapshots", {
  assignmentId: text("assignment_id")
    .primaryKey()
    .references(() => testAssignments.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  questions: jsonb("questions").$type<unknown[]>().notNull(),
  maxScore: numeric("max_score", { precision: 10, scale: 2 }).notNull(),
  answerKeys: jsonb("answer_keys").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const assignmentAnswers = pgTable("assignment_answers", {
  id: text("id").primaryKey(),
  assignmentId: text("assignment_id")
    .notNull()
    .references(() => testAssignments.id, { onDelete: "cascade" }),
  questionId: text("question_id").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  autoScore: numeric("auto_score", { precision: 10, scale: 2 }),
  manualScore: numeric("manual_score", { precision: 10, scale: 2 }),
  needsManualReview: boolean("needs_manual_review").notNull().default(false),
  isCorrect: boolean("is_correct"),
  teacherComment: text("teacher_comment"),
  ...timestamps,
}, (t) => [
  uniqueIndex("assignment_answers_assignment_question_uidx").on(
    t.assignmentId,
    t.questionId
  ),
]);

export const gradeEvents = pgTable("grade_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  assignmentId: text("assignment_id")
    .notNull()
    .references(() => testAssignments.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  actorUserId: text("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  index("grade_events_assignment_idx").on(t.assignmentId, t.createdAt),
  check(
    "grade_events_type_check",
    sql`${t.eventType} in ('assigned', 'draft_saved', 'submitted', 'auto_graded', 'reviewed', 'score_overridden')`
  ),
]);

export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  actorUserId: text("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  index("audit_log_org_created_idx").on(t.organizationId, t.createdAt),
  index("audit_log_entity_idx").on(t.entityType, t.entityId),
]);

/**
 * Идемпотентность критических мутаций (submit / review / assign).
 * Уникальность: (user_id, route_key, request_key).
 */
export const idempotencyKeys = pgTable("idempotency_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  routeKey: text("route_key").notNull(),
  requestKey: text("request_key").notNull(),
  responseStatus: integer("response_status").notNull(),
  responseBody: jsonb("response_body").$type<unknown>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  uniqueIndex("idempotency_keys_user_route_req_uidx").on(
    t.userId,
    t.routeKey,
    t.requestKey
  ),
  index("idempotency_keys_created_idx").on(t.createdAt),
]);

/** Учёт попыток входа (анти-bruteforce). */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: text("id").primaryKey(),
    /** email:… или ip:… */
    key: text("key").notNull(),
    email: text("email"),
    ip: text("ip"),
    success: boolean("success").notNull().default(false),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("login_attempts_key_time_idx").on(t.key, t.attemptedAt),
  ]
);

export const schema = {
  organizations,
  users,
  memberships,
  sessions,
  teachers,
  students,
  topicSections,
  topics,
  tests,
  testAnswerKeys,
  lessons,
  lessonStudents,
  attendances,
  testAssignments,
  assignmentSnapshots,
  assignmentAnswers,
  gradeEvents,
  auditLog,
  idempotencyKeys,
  loginAttempts,
};
