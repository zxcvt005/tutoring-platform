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
  /** Если задан — сеанс открыт администратором «от имени» userId */
  impersonatorUserId: text("impersonator_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  userAgent: text("user_agent"),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  index("sessions_user_idx").on(t.userId),
  index("sessions_expires_idx").on(t.expiresAt),
  index("sessions_impersonator_idx").on(t.impersonatorUserId),
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
  /** Путь к файлу относительно каталога uploads, напр. teachers/t1.webp */
  photoKey: text("photo_key"),
  /** Публичное описание для учеников */
  bio: text("bio"),
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
  /** Класс: 8–11. null — не указан. */
  grade: text("grade"),
  /** Устаревшее свободное поле контакта; новые формы используют telegram/phone. */
  contacts: text("contacts"),
  telegram: text("telegram"),
  phone: text("phone"),
  /** Контакты родителей / представителей — только для дирекции. */
  parentContacts: text("parent_contacts"),
  status: text("status").notNull().default("active"),
  /** Внутренние заметки администрации — не для ученика. */
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
  check(
    "students_grade_check",
    sql`${t.grade} is null or ${t.grade} in ('8', '9', '10', '11')`
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
  /** Необязательно: тест из каталога тем. Каталог «Тесты» живёт в разделе. */
  topicId: text("topic_id").references(() => topics.id, {
    onDelete: "restrict",
  }),
  sectionId: text("section_id").references(() => topicSections.id, {
    onDelete: "set null",
  }),
  teacherId: text("teacher_id")
    .notNull()
    .references(() => teachers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  /** homework — каталог ДЗ; theory — тест, созданный для теории */
  purpose: text("purpose").notNull().default("homework"),
  maxScore: numeric("max_score", { precision: 10, scale: 2 }),
  questionsPublic: jsonb("questions_public").$type<unknown[]>().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
}, (t) => [
  index("tests_topic_idx").on(t.topicId),
  index("tests_teacher_idx").on(t.teacherId),
  index("tests_section_idx").on(t.sectionId),
  check(
    "tests_status_check",
    sql`${t.status} in ('draft', 'published', 'archived')`
  ),
  check(
    "tests_purpose_check",
    sql`${t.purpose} in ('homework', 'theory')`
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

/** Шаблон регулярного расписания (вторник/четверг 17:00 и т.п.). */
export const lessonSchedules = pgTable(
  "lesson_schedules",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    subject: text("subject"),
    /** Дни недели: 1=пн … 7=вс */
    weekdays: jsonb("weekdays").$type<number[]>().notNull(),
    /** Локальное время начала HH:MM */
    startTime: text("start_time").notNull(),
    durationMin: integer("duration_min").notNull().default(60),
    /** С этой даты (локальный день) шаблон действует */
    activeFrom: timestamp("active_from", { withTimezone: true }).notNull(),
    activeUntil: timestamp("active_until", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    index("lesson_schedules_org_idx").on(t.organizationId),
    index("lesson_schedules_teacher_idx").on(t.teacherId),
    check(
      "lesson_schedules_status_check",
      sql`${t.status} in ('active', 'paused', 'archived')`
    ),
  ]
);

export const lessonScheduleStudents = pgTable(
  "lesson_schedule_students",
  {
    scheduleId: text("schedule_id")
      .notNull()
      .references(() => lessonSchedules.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.scheduleId, t.studentId] }),
    index("lesson_schedule_students_student_idx").on(t.studentId),
  ]
);

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
  /** Шаблон, из которого материализовано занятие (null — разовое) */
  scheduleId: text("schedule_id").references(() => lessonSchedules.id, {
    onDelete: "set null",
  }),
  /** Ключ вхождения YYYY-MM-DD для идемпотентной генерации */
  scheduleOccurrenceKey: text("schedule_occurrence_key"),
  subject: text("subject"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("planned"),
  ...timestamps,
}, (t) => [
  index("lessons_teacher_starts_idx").on(t.teacherId, t.startsAt),
  index("lessons_org_starts_idx").on(t.organizationId, t.startsAt),
  index("lessons_schedule_idx").on(t.scheduleId),
  uniqueIndex("lessons_schedule_occurrence_uidx").on(
    t.scheduleId,
    t.scheduleOccurrenceKey
  ),
  check(
    "lessons_status_check",
    sql`${t.status} in ('planned', 'done', 'cancelled')`
  ),
  check("lessons_time_check", sql`${t.endsAt} > ${t.startsAt}`),
]);

export const lessonTopics = pgTable("lesson_topics", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  lessonId: text("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  topicId: text("topic_id").references(() => topics.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
}, (t) => [
  index("lesson_topics_lesson_idx").on(t.lessonId),
  index("lesson_topics_org_idx").on(t.organizationId),
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
      sql`${t.status} in ('present', 'absent_excused', 'absent_unexcused', 'cancelled', 'rescheduled')`
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
  topicId: text("topic_id").references(() => topics.id, {
    onDelete: "restrict",
  }),
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
  /** homework — ДЗ; theory — попытка теста по теории, не является ДЗ */
  sourceKind: text("source_kind").notNull().default("homework"),
  status: text("status").notNull().default("assigned"),
  attempt1Percent: numeric("attempt1_percent", { precision: 6, scale: 2 }),
  attempt2Percent: numeric("attempt2_percent", { precision: 6, scale: 2 }),
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
    sql`${t.status} in ('assigned', 'in_progress', 'remaining_questions', 'attempt1_submitted', 'attempt2_in_progress', 'completed', 'reviewed', 'overdue')`
  ),
  check(
    "test_assignments_source_kind_check",
    sql`${t.sourceKind} in ('homework', 'theory')`
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

/** Попытка прохождения назначенного теста (максимум две). */
export const testAttempts = pgTable(
  "test_attempts",
  {
    id: text("id").primaryKey(),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => testAssignments.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    status: text("status").notNull().default("in_progress"),
    score: numeric("score", { precision: 10, scale: 2 }),
    maxScore: numeric("max_score", { precision: 10, scale: 2 }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("test_attempts_assignment_number_uidx").on(
      t.assignmentId,
      t.attemptNumber
    ),
    index("test_attempts_assignment_idx").on(t.assignmentId),
    check("test_attempts_number_check", sql`${t.attemptNumber} in (1, 2)`),
    check(
      "test_attempts_status_check",
      sql`${t.status} in ('in_progress', 'submitted')`
    ),
  ]
);

export const attemptAnswers = pgTable(
  "attempt_answers",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => testAttempts.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    autoScore: numeric("auto_score", { precision: 10, scale: 2 }),
    manualScore: numeric("manual_score", { precision: 10, scale: 2 }),
    needsManualReview: boolean("needs_manual_review").notNull().default(false),
    isCorrect: boolean("is_correct"),
    teacherComment: text("teacher_comment"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("attempt_answers_attempt_question_uidx").on(
      t.attemptId,
      t.questionId
    ),
  ]
);

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

/** Продукт обучения (каталог). Не путать с назначением ученику. */
export const tariffs = pgTable(
  "tariffs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("RUB"),
    /** Прогнозируемая длительность пакета в днях (не дата сгорания). */
    durationDays: integer("duration_days").notNull(),
    /** Количество занятий в пакете */
    lessonsLimit: integer("lessons_limit"),
    /** Частота занятий в неделю (независимо от duration_days) */
    weeklyFrequency: integer("weekly_frequency").notNull().default(1),
    includesText: text("includes_text"),
    /** Структурированные возможности, напр. ["individual_lessons","homework"] */
    features: jsonb("features").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("active"),
    adminNotes: text("admin_notes"),
    ...timestamps,
  },
  (t) => [
    index("tariffs_org_idx").on(t.organizationId),
    check(
      "tariffs_status_check",
      sql`${t.status} in ('active', 'archived')`
    ),
    check("tariffs_currency_check", sql`${t.currency} in ('RUB')`),
  ]
);

/**
 * Назначение тарифа ученику (подписка / период).
 * priceSnapshot фиксирует цену на момент оформления.
 */
export const studentTariffAssignments = pgTable(
  "student_tariff_assignments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    tariffId: text("tariff_id")
      .notNull()
      .references(() => tariffs.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    priceSnapshot: numeric("price_snapshot", {
      precision: 12,
      scale: 2,
    }).notNull(),
    currency: text("currency").notNull().default("RUB"),
    status: text("status").notNull().default("pending_payment"),
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    /** Снимок каталога на момент назначения */
    lessonsLimitSnapshot: integer("lessons_limit_snapshot"),
    weeklyFrequencySnapshot: integer("weekly_frequency_snapshot"),
    durationDaysSnapshot: integer("duration_days_snapshot"),
    tariffNameSnapshot: text("tariff_name_snapshot"),
    ...timestamps,
  },
  (t) => [
    index("sta_org_student_idx").on(t.organizationId, t.studentId),
    index("sta_tariff_idx").on(t.tariffId),
    check(
      "sta_status_check",
      sql`${t.status} in ('pending_payment', 'active', 'expired', 'cancelled', 'paused')`
    ),
    check(
      "sta_payment_status_check",
      sql`${t.paymentStatus} in ('unpaid', 'paid', 'refunded')`
    ),
    check("sta_time_check", sql`${t.endsAt} > ${t.startsAt}`),
  ]
);

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => studentTariffAssignments.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("RUB"),
    status: text("status").notNull().default("pending"),
    provider: text("provider").notNull().default("stub"),
    externalId: text("external_id"),
    /** Защита от дублей при повторных запросах создания платежа */
    idempotencyKey: text("idempotency_key").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [
    index("payments_org_student_idx").on(t.organizationId, t.studentId),
    index("payments_assignment_idx").on(t.assignmentId),
    index("payments_org_paid_at_idx").on(t.organizationId, t.paidAt),
    uniqueIndex("payments_idempotency_uidx").on(
      t.organizationId,
      t.idempotencyKey
    ),
    check(
      "payments_status_check",
      sql`${t.status} in ('pending', 'paid', 'cancelled', 'failed')`
    ),
  ]
);

/**
 * Журнал списаний пакета. Append-only: сторно — новая строка с delta > 0.
 */
export const tariffLessonLedger = pgTable(
  "tariff_lesson_ledger",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => studentTariffAssignments.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").references(() => lessons.id, {
      onDelete: "set null",
    }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** -1 списание, +1 сторно */
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    attendanceStatus: text("attendance_status"),
    supersedesId: text("supersedes_id"),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("tll_assignment_idx").on(t.assignmentId),
    index("tll_lesson_student_idx").on(t.lessonId, t.studentId),
    check("tll_delta_check", sql`${t.delta} in (-1, 1)`),
    check(
      "tll_reason_check",
      sql`${t.reason} in ('present', 'absent_unexcused', 'reversal')`
    ),
  ]
);

/**
 * Текущее открытое списание по (занятие, ученик) — защита от двойного debit.
 */
export const tariffLessonDebitState = pgTable(
  "tariff_lesson_debit_state",
  {
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => studentTariffAssignments.id, { onDelete: "cascade" }),
    ledgerEntryId: text("ledger_entry_id")
      .notNull()
      .references(() => tariffLessonLedger.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.lessonId, t.studentId] }),
    uniqueIndex("tlds_ledger_uidx").on(t.ledgerEntryId),
  ]
);

/** Исключения шаблона: удалённый или перенесённый слот не материализуется снова. */
export const lessonScheduleExceptions = pgTable(
  "lesson_schedule_exceptions",
  {
    scheduleId: text("schedule_id")
      .notNull()
      .references(() => lessonSchedules.id, { onDelete: "cascade" }),
    occurrenceKey: text("occurrence_key").notNull(),
    reason: text("reason").notNull(),
    lessonId: text("lesson_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.scheduleId, t.occurrenceKey] }),
    check(
      "lse_reason_check",
      sql`${t.reason} in ('deleted', 'moved', 'cancelled')`
    ),
  ]
);

/**
 * Диалог пары «ученик — преподаватель» в организации.
 * Не привязан к текущему primary_teacher_id: смена преподавателя
 * сохраняет старый чат и открывает новый.
 */
export const chats = pgTable(
  "chats",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("chats_org_pair_uidx").on(
      t.organizationId,
      t.studentId,
      t.teacherId
    ),
    index("chats_teacher_activity_idx").on(
      t.organizationId,
      t.teacherId,
      t.lastMessageAt
    ),
    index("chats_student_activity_idx").on(
      t.organizationId,
      t.studentId,
      t.lastMessageAt
    ),
  ]
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    authorUserId: text("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body"),
    eventType: text("event_type"),
    eventPayload: jsonb("event_payload").$type<{
      eventType: string;
      title: string;
      lessonId?: string;
      assignmentId?: string;
      attendanceStatus?: string;
      topicTitle?: string;
      homeworkTitle?: string;
      hrefStudent?: string | null;
      hrefTeacher?: string | null;
      theoryAssignmentId?: string;
      theoryTitle?: string;
    } | null>(),
    eventKey: text("event_key"),
    clientRequestId: text("client_request_id"),
    relatedLessonId: text("related_lesson_id"),
    relatedAssignmentId: text("related_assignment_id"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("chat_messages_chat_created_idx").on(t.chatId, t.createdAt, t.id),
    uniqueIndex("chat_messages_request_uidx")
      .on(t.chatId, t.clientRequestId)
      .where(sql`${t.clientRequestId} is not null`),
    uniqueIndex("chat_messages_event_uidx")
      .on(t.chatId, t.eventKey)
      .where(sql`${t.eventKey} is not null`),
    index("chat_messages_org_idx").on(t.organizationId),
    check(
      "chat_messages_type_check",
      sql`${t.type} in ('user_message', 'system_event')`
    ),
  ]
);

export const chatAttachments = pgTable(
  "chat_attachments",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("chat_attachments_message_idx").on(t.messageId),
    uniqueIndex("chat_attachments_key_uidx").on(t.objectKey),
    check(
      "chat_attachments_size_check",
      sql`${t.sizeBytes} >= 0 AND ${t.sizeBytes} <= 20971520`
    ),
  ]
);

export const chatReadCursors = pgTable(
  "chat_read_cursors",
  {
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull(),
    lastReadMessageId: text("last_read_message_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.chatId, t.userId] }),
    index("chat_read_cursors_user_idx").on(t.userId),
  ]
);

/** Временные объекты хранилища до привязки к сообщению; чистятся по TTL. */
export const chatPendingObjects = pgTable(
  "chat_pending_objects",
  {
    objectKey: text("object_key").primaryKey(),
    organizationId: text("organization_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("chat_pending_created_idx").on(t.createdAt)]
);

export const userNotes = pgTable(
  "user_notes",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    content: text("content").notNull().default(""),
    ...timestamps,
  },
  (t) => [
    index("user_notes_owner_created_idx").on(
      t.organizationId,
      t.userId,
      t.createdAt
    ),
  ]
);

export const theoryMaterials = pgTable(
  "theory_materials",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    videoUrl: text("video_url"),
    videoProvider: text("video_provider"),
    videoEmbedUrl: text("video_embed_url"),
    embedAllowed: boolean("embed_allowed").notNull().default(false),
    videoWarning: text("video_warning"),
    status: text("status").notNull().default("draft"),
    testId: text("test_id").references(() => tests.id, {
      onDelete: "set null",
    }),
    currentVersionId: text("current_version_id"),
    ...timestamps,
  },
  (t) => [
    index("theory_materials_teacher_idx").on(t.teacherId),
    index("theory_materials_org_idx").on(t.organizationId),
    check(
      "theory_materials_status_check",
      sql`${t.status} in ('draft', 'published', 'archived')`
    ),
    check(
      "theory_materials_provider_check",
      sql`${t.videoProvider} is null or ${t.videoProvider} in ('vk', 'youtube', 'rutube', 'unknown')`
    ),
  ]
);

export const theoryMaterialVersions = pgTable(
  "theory_material_versions",
  {
    id: text("id").primaryKey(),
    materialId: text("material_id")
      .notNull()
      .references(() => theoryMaterials.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    videoUrl: text("video_url").notNull(),
    videoProvider: text("video_provider"),
    videoEmbedUrl: text("video_embed_url"),
    embedAllowed: boolean("embed_allowed").notNull().default(false),
    videoWarning: text("video_warning"),
    testId: text("test_id").references(() => tests.id, {
      onDelete: "set null",
    }),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("theory_versions_material_idx").on(t.materialId),
  ]
);

export const theoryFiles = pgTable(
  "theory_files",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    materialId: text("material_id")
      .notNull()
      .references(() => theoryMaterials.id, { onDelete: "cascade" }),
    /** null — текущие файлы черновика/редактора; иначе снимок версии */
    versionId: text("version_id").references(() => theoryMaterialVersions.id, {
      onDelete: "cascade",
    }),
    objectKey: text("object_key").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("theory_files_material_idx").on(t.materialId),
    index("theory_files_version_idx").on(t.versionId),
    index("theory_files_key_idx").on(t.objectKey),
    check(
      "theory_files_size_check",
      sql`${t.sizeBytes} >= 0 AND ${t.sizeBytes} <= 20971520`
    ),
  ]
);

export const theoryAssignments = pgTable(
  "theory_assignments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    materialId: text("material_id")
      .notNull()
      .references(() => theoryMaterials.id, { onDelete: "restrict" }),
    versionId: text("version_id")
      .notNull()
      .references(() => theoryMaterialVersions.id, { onDelete: "restrict" }),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    assignedByUserId: text("assigned_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("assigned"),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    testAssignmentId: text("test_assignment_id").references(
      () => testAssignments.id,
      { onDelete: "set null" }
    ),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("theory_assignments_material_student_uidx").on(
      t.materialId,
      t.studentId
    ),
    index("theory_assignments_student_idx").on(t.studentId, t.status),
    index("theory_assignments_teacher_idx").on(t.teacherId),
    index("theory_assignments_test_idx").on(t.testAssignmentId),
    check(
      "theory_assignments_status_check",
      sql`${t.status} in ('assigned', 'viewed', 'in_progress', 'awaiting_review', 'completed')`
    ),
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
  lessonSchedules,
  lessonScheduleStudents,
  lessons,
  lessonTopics,
  lessonStudents,
  attendances,
  testAssignments,
  assignmentSnapshots,
  assignmentAnswers,
  testAttempts,
  attemptAnswers,
  gradeEvents,
  auditLog,
  idempotencyKeys,
  loginAttempts,
  tariffs,
  studentTariffAssignments,
  payments,
  tariffLessonLedger,
  tariffLessonDebitState,
  lessonScheduleExceptions,
  chats,
  chatMessages,
  chatAttachments,
  chatReadCursors,
  chatPendingObjects,
  userNotes,
  theoryMaterials,
  theoryMaterialVersions,
  theoryFiles,
  theoryAssignments,
};
