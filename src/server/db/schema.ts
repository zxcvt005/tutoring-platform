/**
 * PostgreSQL schema (Drizzle) — этап 1.
 * Эволюционирует через SQL-миграции; не считать финальной моделью продукта.
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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
    sql`${t.role} in ('director', 'teacher', 'student', 'press', 'assistant')`
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
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  archivedReason: text("archived_reason"),
  archivedComment: text("archived_comment"),
  archivedByUserId: text("archived_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  previousTeacherId: text("previous_teacher_id").references(() => teachers.id, {
    onDelete: "set null",
  }),
  /** Каталожный тариф, который ученик может оплачивать сам. Не списывающий пакет. */
  purchaseTariffId: text("purchase_tariff_id"),
  ...timestamps,
}, (t) => [
  index("students_org_idx").on(t.organizationId),
  index("students_teacher_idx").on(t.primaryTeacherId),
  uniqueIndex("students_org_user_uidx").on(t.organizationId, t.userId),
  check(
    "students_status_check",
    sql`${t.status} in ('active', 'paused', 'archived')`
  ),
  check(
    "students_archived_reason_check",
    sql`${t.archivedReason} is null or ${t.archivedReason} in ('trial_not_continued', 'stopped', 'other')`
  ),
  check(
    "students_grade_check",
    sql`${t.grade} is null or ${t.grade} in ('8', '9', '10', '11')`
  ),
]);

/**
 * Одноразовые приглашения в кабинет для заранее созданных профилей.
 * В URL — сырой токен; в БД — sha256(token). Роль фиксируется kind, не клиентом.
 */
export const accountInvitations = pgTable(
  "account_invitations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** teacher | student — определяет membership.role при принятии */
    kind: text("kind").notNull(),
    teacherId: text("teacher_id").references(() => teachers.id, {
      onDelete: "cascade",
    }),
    studentId: text("student_id").references(() => students.id, {
      onDelete: "cascade",
    }),
    tokenHash: text("token_hash").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedByUserId: text("used_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("account_invitations_token_hash_uidx").on(t.tokenHash),
    index("account_invitations_org_idx").on(t.organizationId),
    index("account_invitations_teacher_idx").on(t.teacherId),
    index("account_invitations_student_idx").on(t.studentId),
    check(
      "account_invitations_kind_check",
      sql`${t.kind} in ('teacher', 'student')`
    ),
    check(
      "account_invitations_target_check",
      sql`(
        (${t.kind} = 'teacher' and ${t.teacherId} is not null and ${t.studentId} is null)
        or
        (${t.kind} = 'student' and ${t.studentId} is not null and ${t.teacherId} is null)
      )`
    ),
  ]
);

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

/**
 * Универсальные папки учебных материалов (иерархия без лимита глубины).
 * owner_scope=school → школьная база знаний; teacher → личное пространство преподавателя.
 * topic_sections сохраняются для совместимости; корневые teacher-папки зеркалятся туда.
 */
export const materialFolders = pgTable(
  "material_folders",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ownerScope: text("owner_scope").notNull().default("teacher"),
    teacherId: text("teacher_id").references(() => teachers.id, {
      onDelete: "cascade",
    }),
    parentId: text("parent_id").references((): AnyPgColumn => materialFolders.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    /**
     * Дерево раздела: topic | theory | test | intensive.
     * shared — наследие смешанных папок до разделения (видно во всех разделах до разборки).
     */
    contentKind: text("content_kind"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("material_folders_org_scope_idx").on(
      t.organizationId,
      t.ownerScope,
      t.teacherId
    ),
    index("material_folders_parent_idx").on(t.parentId),
    index("material_folders_teacher_parent_idx").on(t.teacherId, t.parentId),
    index("material_folders_content_kind_idx").on(t.contentKind),
    check(
      "material_folders_scope_check",
      sql`${t.ownerScope} in ('school', 'teacher')`
    ),
    check(
      "material_folders_owner_check",
      sql`(${t.ownerScope} = 'school' and ${t.teacherId} is null) or (${t.ownerScope} = 'teacher' and ${t.teacherId} is not null)`
    ),
    check(
      "material_folders_content_kind_check",
      sql`${t.contentKind} is null or ${t.contentKind} in ('topic', 'theory', 'test', 'intensive', 'shared')`
    ),
  ]
);

export const topics = pgTable("topics", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  /**
   * null только у оригинала базы знаний школы (library_scope = school).
   * Копия преподавателя всегда ссылается на его профиль.
   */
  teacherId: text("teacher_id").references(() => teachers.id, {
    onDelete: "cascade",
  }),
  libraryScope: text("library_scope").notNull().default("teacher"),
  /** @deprecated Используйте folderId; синхронизируется для корневых папок. */
  sectionId: text("section_id").references(() => topicSections.id, {
    onDelete: "set null",
  }),
  folderId: text("folder_id").references(() => materialFolders.id, {
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
  index("topics_folder_idx").on(t.folderId),
  check(
    "topics_status_check",
    sql`${t.status} in ('active', 'archived')`
  ),
  check(
    "topics_scope_check",
    sql`${t.libraryScope} in ('school', 'teacher')`
  ),
  check(
    "topics_owner_check",
    sql`(${t.libraryScope} = 'school' and ${t.teacherId} is null) or (${t.libraryScope} = 'teacher' and ${t.teacherId} is not null)`
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
  folderId: text("folder_id").references(() => materialFolders.id, {
    onDelete: "set null",
  }),
  /** null только у оригинала базы знаний школы. */
  teacherId: text("teacher_id").references(() => teachers.id, {
    onDelete: "cascade",
  }),
  libraryScope: text("library_scope").notNull().default("teacher"),
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
  index("tests_folder_idx").on(t.folderId),
  check(
    "tests_status_check",
    sql`${t.status} in ('draft', 'published', 'archived')`
  ),
  check(
    "tests_purpose_check",
    sql`${t.purpose} in ('homework', 'theory', 'intensive')`
  ),
  check(
    "tests_scope_check",
    sql`${t.libraryScope} in ('school', 'teacher')`
  ),
  check(
    "tests_owner_check",
    sql`(${t.libraryScope} = 'school' and ${t.teacherId} is null) or (${t.libraryScope} = 'teacher' and ${t.teacherId} is not null)`
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
      sql`${t.status} in ('assigned', 'in_progress', 'remaining_questions', 'attempt1_submitted', 'attempt2_in_progress', 'completed', 'reviewed', 'overdue', 'withdrawn')`
    ),
  check(
    "test_assignments_source_kind_check",
    sql`${t.sourceKind} in ('homework', 'theory', 'intensive')`
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
 * Каталог дополнительных продуктов школы (тренажёры и сервисы).
 * Доступ ученику считается по составу текущего тарифа, а не по отдельному гранту.
 */
export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("products_org_slug_uidx").on(t.organizationId, t.slug),
    index("products_org_idx").on(t.organizationId),
  ]
);

/** Связь тарифа с продуктами каталога (многие ко многим). */
export const tariffProducts = pgTable(
  "tariff_products",
  {
    tariffId: text("tariff_id")
      .notNull()
      .references(() => tariffs.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({
      columns: [t.tariffId, t.productId],
      name: "tariff_products_pk",
    }),
    index("tariff_products_org_idx").on(t.organizationId),
    index("tariff_products_product_idx").on(t.productId),
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
    uniqueIndex("sta_one_active_paid_uidx")
      .on(t.organizationId, t.studentId)
      .where(sql`${t.status} = 'active' and ${t.paymentStatus} = 'paid'`),
    check(
      "sta_status_check",
      sql`${t.status} in ('pending_payment', 'active', 'queued', 'expired', 'cancelled', 'paused')`
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
    uniqueIndex("payments_one_pending_student_uidx")
      .on(t.organizationId, t.studentId)
      .where(sql`${t.status} = 'pending'`),
    check(
      "payments_status_check",
      sql`${t.status} in ('pending', 'paid', 'cancelled', 'failed', 'rejected')`
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
    uniqueIndex("tll_debt_settlement_uidx")
      .on(t.assignmentId)
      .where(sql`${t.reason} = 'debt_settlement'`),
    check("tll_delta_check", sql`${t.delta} in (-1, 1)`),
    check(
      "tll_reason_check",
      sql`${t.reason} in ('present', 'absent_unexcused', 'reversal', 'debt_settlement')`
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
    /** null только у оригинала базы знаний школы. */
    teacherId: text("teacher_id").references(() => teachers.id, {
      onDelete: "cascade",
    }),
    libraryScope: text("library_scope").notNull().default("teacher"),
    folderId: text("folder_id").references(() => materialFolders.id, {
      onDelete: "set null",
    }),
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
    index("theory_materials_folder_idx").on(t.folderId),
    check(
      "theory_materials_status_check",
      sql`${t.status} in ('draft', 'published', 'archived')`
    ),
    check(
      "theory_materials_provider_check",
      sql`${t.videoProvider} is null or ${t.videoProvider} in ('vk', 'youtube', 'rutube', 'unknown')`
    ),
    check(
      "theory_materials_scope_check",
      sql`${t.libraryScope} in ('school', 'teacher')`
    ),
    check(
      "theory_materials_owner_check",
      sql`(${t.libraryScope} = 'school' and ${t.teacherId} is null) or (${t.libraryScope} = 'teacher' and ${t.teacherId} is not null)`
    ),
  ]
);

/**
 * Происхождение копии. Не ссылается на оригинал внешним ключом:
 * удаление исходного материала не удаляет копию и не стирает снимок источника.
 */
export const materialOrigins = pgTable(
  "material_origins",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    materialKind: text("material_kind").notNull(),
    materialId: text("material_id").notNull(),
    sourceKind: text("source_kind").notNull(),
    sourceId: text("source_id"),
    sourceTitle: text("source_title").notNull(),
    sourceAuthorName: text("source_author_name"),
    sourceVersionId: text("source_version_id"),
    sourceScope: text("source_scope").notNull().default("school"),
    copiedAt: timestamp("copied_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    copiedByUserId: text("copied_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    uniqueIndex("material_origins_material_uidx").on(t.materialKind, t.materialId),
    index("material_origins_source_idx").on(
      t.organizationId,
      t.sourceKind,
      t.sourceId
    ),
    check(
      "material_origins_kind_check",
      sql`${t.materialKind} in ('theory', 'test', 'topic')`
    ),
    check(
      "material_origins_source_kind_check",
      sql`${t.sourceKind} in ('theory', 'test', 'topic')`
    ),
    check(
      "material_origins_scope_check",
      sql`${t.sourceScope} in ('school', 'teacher')`
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
    videoUrl: text("video_url"),
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

/**
 * Текущие ставки заработка преподавателя за слот:
 * ключ — число фактически присутствовавших (1–5), значение — копейки.
 * Исторические начисления хранят снимок и не пересчитываются при смене ставок.
 */
export const teacherPayRates = pgTable(
  "teacher_pay_rates",
  {
    teacherId: text("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    presentCount: integer("present_count").notNull(),
    amountKopecks: integer("amount_kopecks").notNull(),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.teacherId, t.presentCount] }),
    check(
      "teacher_pay_rates_count_check",
      sql`${t.presentCount} between 1 and 5`
    ),
    check(
      "teacher_pay_rates_amount_check",
      sql`${t.amountKopecks} >= 0`
    ),
  ]
);

/**
 * Идентичность слота для зарплаты: преподаватель + московская дата + время начала.
 * Несколько одноместных занятий с одним startsAt схлопываются в один слот.
 */
export const teacherPayrollSlots = pgTable(
  "teacher_payroll_slots",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    slotDate: text("slot_date").notNull(),
    slotStartTime: text("slot_start_time").notNull(),
    slotStartsAt: timestamp("slot_starts_at", { withTimezone: true }).notNull(),
    canonicalLessonId: text("canonical_lesson_id"),
    lessonIds: jsonb("lesson_ids").$type<string[]>().notNull().default([]),
    attendanceClosed: boolean("attendance_closed").notNull().default(false),
    presentCount: integer("present_count"),
    blockedReason: text("blocked_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("tps_teacher_slot_uidx").on(
      t.teacherId,
      t.slotDate,
      t.slotStartTime
    ),
    index("tps_org_teacher_idx").on(t.organizationId, t.teacherId),
    index("tps_org_starts_idx").on(t.organizationId, t.slotStartsAt),
    check(
      "tps_blocked_reason_check",
      sql`${t.blockedReason} is null or ${t.blockedReason} in ('rates_not_configured', 'rate_missing_for_count', 'present_count_out_of_range')`
    ),
    check(
      "tps_present_count_check",
      sql`${t.presentCount} is null or ${t.presentCount} >= 0`
    ),
  ]
);

/**
 * Append-only журнал зарплаты. Исправления — новые строки, не UPDATE суммы.
 * amount_kopecks: для accrual/adjustment — знак эффекта на долг;
 * для payout — положительная сумма выплаты (долг уменьшается отдельно).
 */
export const teacherPayrollEntries = pgTable(
  "teacher_payroll_entries",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    slotId: text("slot_id").references(() => teacherPayrollSlots.id, {
      onDelete: "restrict",
    }),
    entryType: text("entry_type").notNull(),
    amountKopecks: integer("amount_kopecks").notNull(),
    presentCount: integer("present_count"),
    appliedRateKopecks: integer("applied_rate_kopecks"),
    ratesSnapshot: jsonb("rates_snapshot").$type<Record<string, number>>(),
    explanation: text("explanation").notNull(),
    comment: text("comment"),
    lessonIds: jsonb("lesson_ids").$type<string[]>(),
    slotDate: text("slot_date"),
    slotStartTime: text("slot_start_time"),
    slotStartsAt: timestamp("slot_starts_at", { withTimezone: true }),
    canonicalLessonId: text("canonical_lesson_id"),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    idempotencyKey: text("idempotency_key"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("tpe_accrual_slot_uidx")
      .on(t.slotId)
      .where(sql`${t.entryType} = 'accrual'`),
    uniqueIndex("tpe_idempotency_uidx")
      .on(t.organizationId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    index("tpe_teacher_occurred_idx").on(
      t.teacherId,
      t.occurredAt,
      t.createdAt,
      t.id
    ),
    index("tpe_org_occurred_idx").on(t.organizationId, t.occurredAt),
    index("tpe_slot_idx").on(t.slotId),
    check(
      "tpe_type_check",
      sql`${t.entryType} in ('accrual', 'adjustment', 'payout')`
    ),
    check(
      "tpe_amount_check",
      sql`(
        (${t.entryType} = 'accrual' and ${t.amountKopecks} >= 0) or
        (${t.entryType} = 'adjustment' and ${t.amountKopecks} <> 0) or
        (${t.entryType} = 'payout' and ${t.amountKopecks} > 0)
      )`
    ),
  ]
);

/**
 * Текущая карточка продажника по ученику: актуальное описание.
 * Следующий контакт и история звонков — отдельные таблицы.
 */
export const studentSalesProfiles = pgTable(
  "student_sales_profiles",
  {
    studentId: text("student_id")
      .primaryKey()
      .references(() => students.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    currentInfo: text("current_info").notNull().default(""),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [index("ssp_org_idx").on(t.organizationId)]
);

/** Append-only история взаимодействий продажника с учеником. */
export const studentInteractionNotes = pgTable(
  "student_interaction_notes",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("sin_student_created_idx").on(t.studentId, t.createdAt),
    index("sin_org_idx").on(t.organizationId),
  ]
);

/**
 * Напоминание о следующем контакте. Одновременно у ученика не больше
 * одной задачи со статусом scheduled.
 */
export const studentContactTasks = pgTable(
  "student_contact_tasks",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    reason: text("reason").notNull().default(""),
    status: text("status").notNull().default("scheduled"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    reminderKey: text("reminder_key").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("sct_reminder_key_uidx").on(t.reminderKey),
    uniqueIndex("sct_one_scheduled_uidx")
      .on(t.studentId)
      .where(sql`${t.status} = 'scheduled'`),
    index("sct_due_idx").on(t.organizationId, t.dueAt),
    index("sct_student_idx").on(t.studentId, t.status),
    check(
      "sct_status_check",
      sql`${t.status} in ('scheduled', 'completed', 'cancelled')`
    ),
  ]
);

/**
 * Пробный урок потенциальному ученику. Не связан с аккаунтом ученика
 * и не является записью в lessons — намеренно вне зарплаты и тарифов.
 */
export const trialLessons = pgTable(
  "trial_lessons",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "restrict" }),
    prospectName: text("prospect_name").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    teacherNotes: text("teacher_notes").notNull().default(""),
    salesNotes: text("sales_notes").notNull().default(""),
    agreementStatus: text("agreement_status").notNull().default("not_discussed"),
    lessonStatus: text("lesson_status").notNull().default("planned"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ownerUserId: text("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    cancelReason: text("cancel_reason"),
    ...timestamps,
  },
  (t) => [
    index("trial_lessons_teacher_starts_idx").on(t.teacherId, t.startsAt),
    index("trial_lessons_org_starts_idx").on(t.organizationId, t.startsAt),
    index("trial_lessons_owner_idx").on(t.organizationId, t.ownerUserId),
    check(
      "trial_lessons_agreement_check",
      sql`${t.agreementStatus} in ('not_discussed', 'agreed', 'not_agreed')`
    ),
    check(
      "trial_lessons_status_check",
      sql`${t.lessonStatus} in ('planned', 'completed', 'cancelled', 'no_show')`
    ),
    check("trial_lessons_time_check", sql`${t.endsAt} > ${t.startsAt}`),
  ]
);

export const trialLessonEvents = pgTable(
  "trial_lesson_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    trialLessonId: text("trial_lesson_id")
      .notNull()
      .references(() => trialLessons.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("tle_trial_created_idx").on(t.trialLessonId, t.createdAt),
    check(
      "tle_type_check",
      sql`${t.eventType} in ('created', 'updated', 'rescheduled', 'agreement_changed', 'status_changed', 'cancelled', 'owner_changed')`
    ),
  ]
);

/** Напоминания кабинета «Пресса». Уникальность — reminder_key источника. */
export const pressNotifications = pgTable(
  "press_notifications",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    href: text("href"),
    studentId: text("student_id").references(() => students.id, {
      onDelete: "cascade",
    }),
    sourceKey: text("source_key").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("press_notifications_source_uidx").on(t.sourceKey),
    index("press_notifications_user_idx").on(t.userId, t.createdAt),
    check(
      "press_notifications_kind_check",
      sql`${t.kind} in ('contact_due')`
    ),
  ]
);

/**
 * Личные напоминания продажника. Не смешиваются с контактами учеников,
 * пробными уроками и press_notifications.
 */
export const pressReminders = pgTable(
  "press_reminders",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    kind: text("kind").notNull(),
    frequency: text("frequency"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    currentDueAt: timestamp("current_due_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    index("press_reminders_user_due_idx").on(t.userId, t.status, t.currentDueAt),
    index("press_reminders_org_user_idx").on(t.organizationId, t.userId),
    check(
      "press_reminders_kind_check",
      sql`${t.kind} in ('once', 'recurring')`
    ),
    check(
      "press_reminders_frequency_check",
      sql`${t.frequency} is null or ${t.frequency} in ('daily', 'weekly', 'monthly')`
    ),
    check(
      "press_reminders_status_check",
      sql`${t.status} in ('active', 'disabled', 'archived')`
    ),
    check(
      "press_reminders_kind_frequency_check",
      sql`(${t.kind} = 'once' and ${t.frequency} is null) or (${t.kind} = 'recurring' and ${t.frequency} is not null)`
    ),
  ]
);

/** Выполненные повторения личного напоминания. Одно повторение — одна запись. */
export const pressReminderCompletions = pgTable(
  "press_reminder_completions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    reminderId: text("reminder_id")
      .notNull()
      .references(() => pressReminders.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    occurrenceAt: timestamp("occurrence_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("prc_reminder_occurrence_uidx").on(t.reminderId, t.occurrenceAt),
    index("prc_user_completed_idx").on(t.userId, t.completedAt),
  ]
);

/**
 * Ежемесячная обратная связь преподавателя по ученику.
 * Снимок метрик фиксируется только при отправке в «Прессу».
 */
export const monthlyFeedbackReports = pgTable(
  "monthly_feedback_reports",
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
    periodYear: integer("period_year").notNull(),
    periodMonth: integer("period_month").notNull(),
    teacherComment: text("teacher_comment").notNull().default(""),
    metricsSnapshot: jsonb("metrics_snapshot").$type<Record<string, unknown> | null>(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    submittedByUserId: text("submitted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    pressStatus: text("press_status"),
    pressStartedAt: timestamp("press_started_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processedByUserId: text("processed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    parentMessageText: text("parent_message_text").notNull().default(""),
    parentSentAt: timestamp("parent_sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("mfr_student_teacher_period_uidx").on(
      t.studentId,
      t.teacherId,
      t.periodYear,
      t.periodMonth
    ),
    index("mfr_teacher_period_idx").on(t.teacherId, t.periodYear, t.periodMonth),
    index("mfr_org_press_idx").on(t.organizationId, t.pressStatus, t.submittedAt),
    check(
      "mfr_period_month_check",
      sql`${t.periodMonth} >= 1 AND ${t.periodMonth} <= 12`
    ),
    check(
      "mfr_period_year_check",
      sql`${t.periodYear} >= 2020 AND ${t.periodYear} <= 2100`
    ),
    check(
      "mfr_press_status_check",
      sql`${t.pressStatus} is null or ${t.pressStatus} in ('pending', 'in_progress', 'processed')`
    ),
    check(
      "mfr_submit_press_check",
      sql`(${t.submittedAt} is null and ${t.pressStatus} is null) or (${t.submittedAt} is not null and ${t.pressStatus} is not null)`
    ),
  ]
);

/** Оценка учеником проведённого занятия. Одна запись на пару занятие + ученик. */
export const lessonRatings = pgTable(
  "lesson_ratings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "restrict" }),
    score: integer("score").notNull(),
    comment: text("comment").notNull().default(""),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("lesson_ratings_lesson_student_uidx").on(t.lessonId, t.studentId),
    index("lesson_ratings_org_submitted_idx").on(t.organizationId, t.submittedAt),
    index("lesson_ratings_teacher_submitted_idx").on(t.teacherId, t.submittedAt),
    index("lesson_ratings_student_idx").on(t.studentId),
    check(
      "lesson_ratings_score_check",
      sql`${t.score} >= 1 AND ${t.score} <= 10`
    ),
  ]
);

/**
 * Настройки тренажёра формул ученика (режим, разделы, слабые места, быстрый вопрос).
 * Каталог формул хранится в коде, не в БД.
 */
export const formulaTrainerSettings = pgTable(
  "formula_trainer_settings",
  {
    studentId: text("student_id")
      .primaryKey()
      .references(() => students.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** choice | manual | mixed */
    mode: text("mode").notNull().default("choice"),
    /** string[] subsection ids; пустой = все */
    selectedSubsections: jsonb("selected_subsections")
      .$type<string[]>()
      .notNull()
      .default([]),
    weakSpotsOnly: boolean("weak_spots_only").notNull().default(false),
    /**
     * Активный/последний быстрый вопрос на главной:
     * { questionId, formulaId, kind, options, correctOptionId, answered, selectedOptionId, seed }
     */
    quickQuestion: jsonb("quick_question").$type<Record<string, unknown> | null>(),
    /** Недавние formulaId для анти-повтора */
    recentFormulaIds: jsonb("recent_formula_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    ...timestamps,
  },
  (t) => [
    index("fts_org_idx").on(t.organizationId),
    check(
      "fts_mode_check",
      sql`${t.mode} in ('choice', 'manual', 'mixed')`
    ),
  ]
);

/** Прогресс ученика по каждой формуле каталога. */
export const formulaTrainerProgress = pgTable(
  "formula_trainer_progress",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    formulaId: text("formula_id").notNull(),
    attempts: integer("attempts").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    wrongCount: integer("wrong_count").notNull().default(0),
    /** new | needs_review | mastered */
    status: text("status").notNull().default("new"),
    streak: integer("streak").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("ftp_student_formula_uidx").on(t.studentId, t.formulaId),
    index("ftp_student_idx").on(t.studentId),
    index("ftp_org_idx").on(t.organizationId),
    index("ftp_status_idx").on(t.studentId, t.status),
    check(
      "ftp_status_check",
      sql`${t.status} in ('new', 'needs_review', 'mastered')`
    ),
    check("ftp_attempts_check", sql`${t.attempts} >= 0`),
    check("ftp_correct_check", sql`${t.correctCount} >= 0`),
    check("ftp_wrong_check", sql`${t.wrongCount} >= 0`),
    check("ftp_streak_check", sql`${t.streak} >= 0`),
  ]
);

/**
 * Одна незавершённая тренировка на ученика. Завершённые строки остаются историей.
 * Порядок вопросов фиксируется при старте и не пересобирается при продолжении.
 */
export const formulaTrainerSessions = pgTable(
  "formula_trainer_sessions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** active | completed */
    status: text("status").notNull().default("active"),
    mode: text("mode").notNull().default("choice"),
    weakSpotsOnly: boolean("weak_spots_only").notNull().default(false),
    selectedSubsections: jsonb("selected_subsections")
      .$type<string[]>()
      .notNull()
      .default([]),
    questionCount: integer("question_count").notNull(),
    /** Порядок formulaId. Повтор одной формулы в разных позициях допустим. */
    formulaIds: jsonb("formula_ids").$type<string[]>().notNull(),
    /** Индекс текущего неотвеченного вопроса. Равен questionCount после завершения. */
    currentIndex: integer("current_index").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("ftsess_student_idx").on(t.studentId, t.status),
    index("ftsess_org_idx").on(t.organizationId),
    uniqueIndex("ftsess_one_active_uidx")
      .on(t.studentId)
      .where(sql`${t.status} = 'active'`),
    check(
      "ftsess_status_check",
      sql`${t.status} in ('active', 'completed')`
    ),
    check(
      "ftsess_mode_check",
      sql`${t.mode} in ('choice', 'manual', 'mixed')`
    ),
    check("ftsess_count_check", sql`${t.questionCount} > 0`),
    check("ftsess_index_check", sql`${t.currentIndex} >= 0`),
  ]
);

/**
 * Открытый вопрос тренажёра (choice options + correct id только на сервере).
 * Используется для полноценного режима и быстрого старта.
 */
export const formulaTrainerQuestions = pgTable(
  "formula_trainer_questions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    formulaId: text("formula_id").notNull(),
    /** choice | manual */
    kind: text("kind").notNull(),
    /** Публичные варианты [{id, expression}] */
    options: jsonb("options").$type<{ id: string; expression: string }[] | null>(),
    /** Только сервер: id правильного варианта */
    correctOptionId: text("correct_option_id"),
    source: text("source").notNull().default("trainer"),
    /** Пусто у старых вопросов вне сохранённой тренировки. */
    sessionId: text("session_id").references(() => formulaTrainerSessions.id, {
      onDelete: "cascade",
    }),
    /** Позиция в тренировке, с нуля. */
    position: integer("position"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    isCorrect: boolean("is_correct"),
    studentAnswer: text("student_answer"),
    selectedOptionId: text("selected_option_id"),
    explanation: text("explanation"),
    ...timestamps,
  },
  (t) => [
    index("ftq_student_idx").on(t.studentId, t.createdAt),
    index("ftq_org_idx").on(t.organizationId),
    index("ftq_session_idx").on(t.sessionId, t.position),
    uniqueIndex("ftq_session_position_uidx")
      .on(t.sessionId, t.position)
      .where(sql`${t.sessionId} is not null`),
    check(
      "ftq_kind_check",
      sql`${t.kind} in ('choice', 'manual')`
    ),
    check(
      "ftq_source_check",
      sql`${t.source} in ('quick', 'trainer')`
    ),
  ]
);

/**
 * История взаимодействий по конкретному пробному уроку.
 * Не связана с учеником и не смешивается с trial_lesson_events.
 */
export const trialInteractionNotes = pgTable(
  "trial_interaction_notes",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    trialLessonId: text("trial_lesson_id")
      .notNull()
      .references(() => trialLessons.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("tin_trial_created_idx").on(t.trialLessonId, t.createdAt),
    index("tin_org_idx").on(t.organizationId),
  ]
);

/** Видеозвонок преподавателя. Не привязан к занятию из расписания. */
export const videoCalls = pgTable(
  "video_calls",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    status: text("status").notNull().default("active"),
    /** Параллельный режим: ученик, которому сейчас идёт эфир. */
    activeParticipantId: text("active_participant_id"),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("video_calls_org_idx").on(t.organizationId),
    index("video_calls_teacher_status_idx").on(t.teacherId, t.status),
    check("video_calls_mode_check", sql`${t.mode} in ('parallel', 'group')`),
    check("video_calls_status_check", sql`${t.status} in ('active', 'ended')`),
  ]
);

export const videoCallParticipants = pgTable(
  "video_call_participants",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    callId: text("call_id")
      .notNull()
      .references(() => videoCalls.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    livekitRoomName: text("livekit_room_name").notNull(),
    status: text("status").notNull().default("invited"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("video_call_participants_call_student_uidx").on(
      t.callId,
      t.studentId
    ),
    index("video_call_participants_room_idx").on(t.livekitRoomName),
    index("video_call_participants_student_idx").on(t.studentId),
    index("video_call_participants_call_idx").on(t.callId),
    check(
      "video_call_participants_status_check",
      sql`${t.status} in ('invited', 'closed')`
    ),
  ]
);

/**
 * Личный приём звонков вне кабинетов.
 * Нет связей с организациями, пользователями, преподавателями и учениками.
 */
export const privateCallSessions = pgTable(
  "private_call_sessions",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    status: text("status").notNull().default("active"),
    accepting: boolean("accepting").notNull().default(true),
    activeRoomId: text("active_room_id"),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("private_call_sessions_code_uidx").on(t.code),
    index("private_call_sessions_status_idx").on(t.status),
    check(
      "private_call_sessions_status_check",
      sql`${t.status} in ('active', 'ended')`
    ),
  ]
);

export const privateCallRooms = pgTable(
  "private_call_rooms",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => privateCallSessions.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    livekitRoomName: text("livekit_room_name").notNull(),
    status: text("status").notNull().default("open"),
    connectedAt: timestamp("connected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("private_call_rooms_livekit_uidx").on(t.livekitRoomName),
    index("private_call_rooms_session_idx").on(t.sessionId),
    index("private_call_rooms_open_seen_idx").on(t.status, t.lastSeenAt),
    check(
      "private_call_rooms_status_check",
      sql`${t.status} in ('open', 'closed')`
    ),
  ]
);

/** Пробник ЕГЭ, который ведёт конкретный преподаватель. */
export const mockExams = pgTable(
  "mock_exams",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    examDate: text("exam_date").notNull(),
    description: text("description"),
    ...timestamps,
  },
  (t) => [
    index("mock_exams_teacher_date_idx").on(t.teacherId, t.examDate),
    index("mock_exams_org_idx").on(t.organizationId),
    check(
      "mock_exams_exam_date_check",
      sql`${t.examDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
    ),
  ]
);

/** Вторичный балл ученика за пробник. Одна запись на пару пробник + ученик. */
export const mockExamResults = pgTable(
  "mock_exam_results",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    mockExamId: text("mock_exam_id")
      .notNull()
      .references(() => mockExams.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    testScore: integer("test_score").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("mock_exam_results_exam_student_uidx").on(
      t.mockExamId,
      t.studentId
    ),
    index("mock_exam_results_student_idx").on(t.studentId),
    index("mock_exam_results_org_idx").on(t.organizationId),
    check(
      "mock_exam_results_score_check",
      sql`${t.testScore} >= 0 and ${t.testScore} <= 100`
    ),
  ]
);

export const intensives = pgTable(
  "intensives",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teacherId: text("teacher_id").references(() => teachers.id, {
      onDelete: "cascade",
    }),
    libraryScope: text("library_scope").notNull().default("teacher"),
    folderId: text("folder_id").references(() => materialFolders.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    videoUrl: text("video_url"),
    videoProvider: text("video_provider"),
    videoEmbedUrl: text("video_embed_url"),
    embedAllowed: boolean("embed_allowed").notNull().default(false),
    videoWarning: text("video_warning"),
    status: text("status").notNull().default("draft"),
    currentVersionId: text("current_version_id"),
    ...timestamps,
  },
  (t) => [
    index("intensives_teacher_idx").on(t.teacherId),
    index("intensives_org_idx").on(t.organizationId),
    index("intensives_folder_idx").on(t.folderId),
    check(
      "intensives_status_check",
      sql`${t.status} in ('draft', 'published', 'archived')`
    ),
    check(
      "intensives_provider_check",
      sql`${t.videoProvider} is null or ${t.videoProvider} in ('vk', 'youtube', 'rutube', 'unknown')`
    ),
    check(
      "intensives_scope_check",
      sql`${t.libraryScope} in ('school', 'teacher')`
    ),
    check(
      "intensives_owner_check",
      sql`(${t.libraryScope} = 'school' and ${t.teacherId} is null) or (${t.libraryScope} = 'teacher' and ${t.teacherId} is not null)`
    ),
  ]
);

export const intensiveVersions = pgTable(
  "intensive_versions",
  {
    id: text("id").primaryKey(),
    intensiveId: text("intensive_id")
      .notNull()
      .references(() => intensives.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    videoUrl: text("video_url"),
    videoProvider: text("video_provider"),
    videoEmbedUrl: text("video_embed_url"),
    embedAllowed: boolean("embed_allowed").notNull().default(false),
    videoWarning: text("video_warning"),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("intensive_versions_intensive_idx").on(t.intensiveId)]
);

export const intensiveFiles = pgTable(
  "intensive_files",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    intensiveId: text("intensive_id")
      .notNull()
      .references(() => intensives.id, { onDelete: "cascade" }),
    versionId: text("version_id").references(() => intensiveVersions.id, {
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
    index("intensive_files_intensive_idx").on(t.intensiveId),
    index("intensive_files_version_idx").on(t.versionId),
    index("intensive_files_key_idx").on(t.objectKey),
    check(
      "intensive_files_size_check",
      sql`${t.sizeBytes} >= 0 AND ${t.sizeBytes} <= 20971520`
    ),
  ]
);

export const intensiveTests = pgTable(
  "intensive_tests",
  {
    intensiveId: text("intensive_id")
      .notNull()
      .references(() => intensives.id, { onDelete: "cascade" }),
    testId: text("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.intensiveId, t.testId] }),
    index("intensive_tests_test_idx").on(t.testId),
  ]
);

export const intensiveVersionTests = pgTable(
  "intensive_version_tests",
  {
    versionId: text("version_id")
      .notNull()
      .references(() => intensiveVersions.id, { onDelete: "cascade" }),
    testId: text("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.versionId, t.testId] })]
);

export const intensiveAssignments = pgTable(
  "intensive_assignments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    intensiveId: text("intensive_id")
      .notNull()
      .references(() => intensives.id, { onDelete: "restrict" }),
    versionId: text("version_id")
      .notNull()
      .references(() => intensiveVersions.id, { onDelete: "restrict" }),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    assignedByUserId: text("assigned_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("intensive_assignments_intensive_student_uidx").on(
      t.intensiveId,
      t.studentId
    ),
    index("intensive_assignments_student_idx").on(t.studentId),
    index("intensive_assignments_teacher_idx").on(t.teacherId),
  ]
);

export const intensiveAssignmentTests = pgTable(
  "intensive_assignment_tests",
  {
    id: text("id").primaryKey(),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => intensiveAssignments.id, { onDelete: "cascade" }),
    testId: text("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").notNull().default(0),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    testAssignmentId: text("test_assignment_id")
      .notNull()
      .references(() => testAssignments.id, { onDelete: "restrict" }),
  },
  (t) => [
    uniqueIndex("intensive_assignment_tests_assignment_test_uidx").on(
      t.assignmentId,
      t.testId
    ),
    uniqueIndex("intensive_assignment_tests_attempt_uidx").on(
      t.testAssignmentId
    ),
  ]
);

/**
 * Активный банк ошибок ученика. Одна активная карточка на исходный questionId.
 * Снимок вопроса защищает от правок шаблона преподавателем.
 */
export const studentErrorBank = pgTable(
  "student_error_bank",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    sourceAssignmentId: text("source_assignment_id").references(
      () => testAssignments.id,
      { onDelete: "set null" }
    ),
    sourceTestId: text("source_test_id").references(() => tests.id, {
      onDelete: "set null",
    }),
    sourceQuestionId: text("source_question_id").notNull(),
    /** Полный снимок: публичная часть + answerKey + kimNumber. */
    questionSnapshot: jsonb("question_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    kimNumber: integer("kim_number"),
    firstErrorAt: timestamp("first_error_at", { withTimezone: true }).notNull(),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }).notNull(),
    incorrectAttemptsCount: integer("incorrect_attempts_count")
      .notNull()
      .default(1),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    /** waiting | available | mastered */
    status: text("status").notNull().default("waiting"),
    masteredAt: timestamp("mastered_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("seb_student_status_idx").on(t.studentId, t.status),
    index("seb_student_available_idx").on(t.studentId, t.availableAt),
    index("seb_org_idx").on(t.organizationId),
    index("seb_kim_idx").on(t.studentId, t.kimNumber),
    uniqueIndex("seb_active_question_uidx")
      .on(t.studentId, t.sourceQuestionId)
      .where(sql`${t.status} in ('waiting', 'available')`),
    check(
      "seb_status_check",
      sql`${t.status} in ('waiting', 'available', 'mastered')`
    ),
    check("seb_incorrect_check", sql`${t.incorrectAttemptsCount} >= 1`),
  ]
);

/** История событий банка ошибок (не удаляется при master). */
export const studentErrorBankEvents = pgTable(
  "student_error_bank_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    errorBankId: text("error_bank_id").references(() => studentErrorBank.id, {
      onDelete: "set null",
    }),
    sourceQuestionId: text("source_question_id").notNull(),
    /** recorded | repeated | available | mastered | reopened */
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("sebe_student_created_idx").on(t.studentId, t.createdAt),
    index("sebe_bank_idx").on(t.errorBankId),
    check(
      "sebe_type_check",
      sql`${t.eventType} in ('recorded', 'repeated', 'available', 'mastered', 'reopened')`
    ),
  ]
);

export const errorPracticeSessions = pgTable(
  "error_practice_sessions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** random | kim */
    mode: text("mode").notNull(),
    kimNumber: integer("kim_number"),
    /** active | completed */
    status: text("status").notNull().default("active"),
    questionCount: integer("question_count").notNull(),
    correctCount: integer("correct_count").notNull().default(0),
    incorrectCount: integer("incorrect_count").notNull().default(0),
    percent: numeric("percent", { precision: 6, scale: 2 }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("eps_student_idx").on(t.studentId, t.status),
    index("eps_org_idx").on(t.organizationId),
    uniqueIndex("eps_one_active_uidx")
      .on(t.studentId)
      .where(sql`${t.status} = 'active'`),
    check("eps_mode_check", sql`${t.mode} in ('random', 'kim')`),
    check("eps_status_check", sql`${t.status} in ('active', 'completed')`),
    check("eps_count_check", sql`${t.questionCount} > 0`),
  ]
);

export const errorPracticeSessionItems = pgTable(
  "error_practice_session_items",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => errorPracticeSessions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    /** bank | pool */
    sourceKind: text("source_kind").notNull(),
    errorBankId: text("error_bank_id").references(() => studentErrorBank.id, {
      onDelete: "set null",
    }),
    sourceQuestionId: text("source_question_id").notNull(),
    sourceTestId: text("source_test_id"),
    sourceAssignmentId: text("source_assignment_id"),
    questionSnapshot: jsonb("question_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    kimNumber: integer("kim_number"),
    answerPayload: jsonb("answer_payload").$type<Record<string, unknown>>(),
    isCorrect: boolean("is_correct"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("epsi_session_position_uidx").on(t.sessionId, t.position),
    index("epsi_session_idx").on(t.sessionId),
    check("epsi_source_check", sql`${t.sourceKind} in ('bank', 'pool')`),
    check("epsi_position_check", sql`${t.position} >= 0`),
  ]
);

/**
 * Ручная «База» потенциальных учеников (Дирекция).
 * Изолированное хранилище: не создаёт учеников, заявки, занятия и не влияет на продажи.
 */
export const baseLeads = pgTable(
  "base_leads",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Дата добавления записи (календарный день, YYYY-MM-DD). */
    entryDate: text("entry_date").notNull(),
    source: text("source"),
    status: text("status"),
    name: text("name").notNull().default(""),
    avitoUrl: text("avito_url").notNull().default(""),
    contact: text("contact").notNull().default(""),
    path1: boolean("path_1").notNull().default(false),
    path2: boolean("path_2").notNull().default(false),
    path3: boolean("path_3").notNull().default(false),
    comment: text("comment").notNull().default(""),
    reconciliation: boolean("reconciliation").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("base_leads_org_idx").on(t.organizationId),
    index("base_leads_org_created_idx").on(t.organizationId, t.createdAt),
    check(
      "base_leads_source_check",
      sql`${t.source} is null or ${t.source} in ('Профи', 'Авито', 'Реклама', 'Сарафан', 'Блог')`
    ),
    check(
      "base_leads_status_check",
      sql`${t.status} is null or ${t.status} in ('Получен контакт', 'Игнор', 'Назначен пробный', 'Проведен пробный', 'Отказ', 'Отказище', 'Купил')`
    ),
    check(
      "base_leads_entry_date_check",
      sql`${t.entryDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
    ),
  ]
);

/**
 * Заявки с публичного лендинга (Дирекция → Заявки).
 * Не создаёт учеников автоматически; только хранит обращения на диагностику.
 */
export const siteLeads = pgTable(
  "site_leads",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    studentName: text("student_name").notNull(),
    grade: text("grade").notNull(),
    level: text("level").notNull().default(""),
    parentName: text("parent_name").notNull(),
    contact: text("contact").notNull(),
    comment: text("comment").notNull().default(""),
    status: text("status").notNull().default("Новая"),
    ...timestamps,
  },
  (t) => [
    index("site_leads_org_idx").on(t.organizationId),
    index("site_leads_org_created_idx").on(t.organizationId, t.createdAt),
    check(
      "site_leads_status_check",
      sql`${t.status} in ('Новая', 'Написали', 'Диагностика', 'Отказ', 'Зачислили')`
    ),
    check(
      "site_leads_grade_check",
      sql`${t.grade} in ('10', '11', 'other')`
    ),
  ]
);

/**
 * Ручные «Пробные уроки» (Дирекция).
 * Изолировано от Press trial_lessons, base_leads, учеников и расписания.
 */
export const manualTrialLessons = pgTable(
  "manual_trial_lessons",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Дата пробного урока (YYYY-MM-DD). */
    lessonDate: text("lesson_date").notNull(),
    /** Время пробного урока (HH:MM). */
    lessonTime: text("lesson_time").notNull().default("12:00"),
    source: text("source"),
    name: text("name").notNull().default(""),
    contact: text("contact").notNull().default(""),
    attended: boolean("attended").notNull().default(false),
    purchased: boolean("purchased").notNull().default(false),
    /** Занятий в неделю; null — не указано. */
    hoursPerWeek: integer("hours_per_week"),
    /** Ставка за час в целых рублях; null — не указано. */
    ratePerHourRub: integer("rate_per_hour_rub"),
    comment: text("comment").notNull().default(""),
    ...timestamps,
  },
  (t) => [
    index("manual_trial_lessons_org_idx").on(t.organizationId),
    index("manual_trial_lessons_org_created_idx").on(
      t.organizationId,
      t.createdAt
    ),
    check(
      "manual_trial_lessons_source_check",
      sql`${t.source} is null or ${t.source} in ('Профи', 'Авито', 'Реклама', 'Сарафан', 'Блог')`
    ),
    check(
      "manual_trial_lessons_lesson_date_check",
      sql`${t.lessonDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
    ),
    check(
      "manual_trial_lessons_lesson_time_check",
      sql`${t.lessonTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`
    ),
    check(
      "manual_trial_lessons_hours_check",
      sql`${t.hoursPerWeek} is null or ${t.hoursPerWeek} >= 0`
    ),
    check(
      "manual_trial_lessons_rate_check",
      sql`${t.ratePerHourRub} is null or ${t.ratePerHourRub} >= 0`
    ),
  ]
);

/**
 * Расходы Дирекции: ручные + импорт Avito (из rnp_avito_daily_stats) и выплат зарплат.
 * Не связано с CRM, учениками, заявками и занятиями.
 */
export const directorExpenses = pgTable(
  "director_expenses",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    comment: text("comment").notNull().default(""),
    /** Календарный день YYYY-MM-DD */
    expenseDate: text("expense_date").notNull(),
    amountRub: integer("amount_rub").notNull(),
    /** manual | avito | salary */
    source: text("source").notNull(),
    /** Для avito — dayDate; для salary — teacher_payroll_entries.id */
    externalId: text("external_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("director_expenses_org_source_ext_uidx").on(
      t.organizationId,
      t.source,
      t.externalId
    ),
    index("director_expenses_org_date_idx").on(t.organizationId, t.expenseDate),
    index("director_expenses_org_category_idx").on(
      t.organizationId,
      t.category
    ),
    check(
      "director_expenses_category_check",
      sql`${t.category} in ('Авито', 'Профи', 'Зарплата', 'Сервисы', 'Налоги', 'Подарки')`
    ),
    check(
      "director_expenses_source_check",
      sql`${t.source} in ('manual', 'avito', 'salary')`
    ),
    check(
      "director_expenses_date_check",
      sql`${t.expenseDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
    ),
    check("director_expenses_amount_check", sql`${t.amountRub} > 0`),
    check(
      "director_expenses_external_check",
      sql`(
        (${t.source} = 'manual' and ${t.externalId} is null)
        or (${t.source} <> 'manual' and ${t.externalId} is not null)
      )`
    ),
  ]
);

/**
 * Ежедневная статистика «РНП Авито» (Дирекция).
 * API-поля и ручные поля независимы; не связано с base_leads / manual_trial_lessons.
 */
export const rnpAvitoDailyStats = pgTable(
  "rnp_avito_daily_stats",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Календарный день YYYY-MM-DD */
    dayDate: text("day_date").notNull(),
    /** API-поля (nullable, пока API не подключён) */
    budgetSpentRub: integer("budget_spent_rub"),
    impressions: integer("impressions"),
    views: integer("views"),
    contacts: integer("contacts"),
    apiSyncedAt: timestamp("api_synced_at", { withTimezone: true }),
    /** Ручные поля */
    trialsScheduled: integer("trials_scheduled"),
    trialsCompleted: integer("trials_completed"),
    manualUpdatedAt: timestamp("manual_updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("rnp_avito_daily_org_date_uidx").on(t.organizationId, t.dayDate),
    index("rnp_avito_daily_org_idx").on(t.organizationId),
    check(
      "rnp_avito_daily_date_check",
      sql`${t.dayDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
    ),
    check(
      "rnp_avito_daily_nonneg_check",
      sql`(
        (${t.budgetSpentRub} is null or ${t.budgetSpentRub} >= 0)
        and (${t.impressions} is null or ${t.impressions} >= 0)
        and (${t.views} is null or ${t.views} >= 0)
        and (${t.contacts} is null or ${t.contacts} >= 0)
        and (${t.trialsScheduled} is null or ${t.trialsScheduled} >= 0)
        and (${t.trialsCompleted} is null or ${t.trialsCompleted} >= 0)
      )`
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
  accountInvitations,
  topicSections,
  materialFolders,
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
  products,
  tariffProducts,
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
  materialOrigins,
  teacherPayRates,
  teacherPayrollSlots,
  teacherPayrollEntries,
  studentSalesProfiles,
  studentInteractionNotes,
  studentContactTasks,
  trialLessons,
  trialLessonEvents,
  pressNotifications,
  pressReminders,
  pressReminderCompletions,
  monthlyFeedbackReports,
  lessonRatings,
  formulaTrainerSettings,
  formulaTrainerProgress,
  formulaTrainerSessions,
  formulaTrainerQuestions,
  trialInteractionNotes,
  videoCalls,
  videoCallParticipants,
  privateCallSessions,
  privateCallRooms,
  mockExams,
  mockExamResults,
  intensives,
  intensiveVersions,
  intensiveFiles,
  intensiveTests,
  intensiveVersionTests,
  intensiveAssignments,
  intensiveAssignmentTests,
  studentErrorBank,
  studentErrorBankEvents,
  errorPracticeSessions,
  errorPracticeSessionItems,
  baseLeads,
  siteLeads,
  manualTrialLessons,
  directorExpenses,
  rnpAvitoDailyStats,
};
