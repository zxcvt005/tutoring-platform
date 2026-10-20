/** Статусы людей */
export type PersonStatus = "active" | "paused";

export type TeacherStatus = "active" | "inactive" | "archived";

export type LessonStatus = "planned" | "done" | "cancelled";

/** Посещаемость по занятию */
export type AttendanceStatus =
  | "present"
  | "absent"
  | "cancelled"
  | "rescheduled";

export type TopicStatus = "active" | "archived";

/** Статус теста (шаблона ДЗ) */
export type HomeworkTemplateStatus = "draft" | "published" | "archived";

/** @deprecated legacy check type — сохраняем для миграции */
export type CheckType = "score" | "pass_fail" | "comment";

/** Типы вопросов в тесте */
export type QuestionType =
  | "single_choice"
  | "multiple_choice"
  | "short_answer"
  | "essay"
  | "matching"
  | "ordering";

export type QuestionOption = {
  id: string;
  text: string;
};

export type MatchingPair = {
  id: string;
  left: string;
  right: string;
};

export type OrderItem = {
  id: string;
  text: string;
};

export type TestQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  maxScore: number;
  explanation?: string;
  /** Варианты для single/multiple choice */
  options?: QuestionOption[];
  /** Правильные id вариантов */
  correctOptionIds?: string[];
  /** Краткий ответ: допустимые строки/числа */
  correctAnswers?: string[];
  answerKind?: "text" | "number";
  /** Допустимая погрешность для числового ответа */
  numericTolerance?: number;
  /** Пары для сопоставления (правильный порядок = верные пары) */
  matchingPairs?: MatchingPair[];
  /** Элементы в правильном порядке */
  orderItems?: OrderItem[];
};

/**
 * Тест / шаблон ДЗ, принадлежащий теме.
 * Поле называется Homework для совместимости с существующим store.
 */
export type Homework = {
  id: string;
  topicId: string;
  teacherId: string;
  title: string;
  description?: string;
  status: HomeworkTemplateStatus;
  questions: TestQuestion[];
  /** Сумма maxScore вопросов (кэш; пересчитывается при сохранении) */
  maxScore?: number;
  /** legacy */
  checkType?: CheckType;
};

/** Снимок теста на момент назначения — не меняется при правках шаблона */
export type TestSnapshot = {
  title: string;
  description?: string;
  questions: TestQuestion[];
  maxScore: number;
};

/** Ответ ученика на одно задание */
export type StudentAnswer = {
  questionId: string;
  selectedOptionIds?: string[];
  textAnswer?: string;
  /** left pair id → right pair id */
  matching?: Record<string, string>;
  /** id элементов в порядке ученика */
  order?: string[];
  autoScore?: number;
  manualScore?: number;
  needsManualReview?: boolean;
  /** null — ещё не проверено / ручная проверка */
  isCorrect?: boolean | null;
  teacherComment?: string;
};

/**
 * Статус назначения ДЗ ученику.
 * in_progress — черновик сохранён, ещё не отправлено.
 * completed — отправлено; может ждать ручной проверки.
 */
export type HomeworkAssignmentStatus =
  | "assigned"
  | "in_progress"
  | "completed"
  | "reviewed"
  | "overdue";

export type HomeworkAssignment = {
  id: string;
  homeworkId: string;
  topicId: string;
  teacherId: string;
  studentId: string;
  /** Занятие, с которого назначили (если есть) */
  lessonId?: string;
  /** Срок необязателен — без даты задание всё равно доступно */
  dueAt?: string;
  status: HomeworkAssignmentStatus;
  score?: number;
  maxScore?: number;
  feedback?: string;
  /** legacy текстовый ответ */
  answerText?: string;
  completedAt?: string;
  reviewedAt?: string;
  /** Снимок вопросов и ключей на момент назначения */
  testSnapshot?: TestSnapshot;
  answers?: StudentAnswer[];
};

export type WorkInterval = {
  start: string;
  end: string;
};

export type Teacher = {
  id: string;
  fullName: string;
  avatarInitials?: string;
  subjects: string[];
  specializations?: string[];
  phone?: string;
  email?: string;
  startedAt?: string;
  status: TeacherStatus;
  lessonPrice?: number;
  teacherPay?: number;
  defaultDurationMin?: number;
  workDays?: number[];
  workIntervals?: WorkInterval[];
  adminNotes?: string;
  /** Связанная учётная запись (для входа / impersonation) */
  userId?: string | null;
  accountEmail?: string | null;
  accountRole?: "teacher" | null;
};

export type Student = {
  id: string;
  fullName: string;
  contacts?: string;
  status: PersonStatus;
  teacherId: string;
  notes?: string;
  /** Связанная учётная запись (для входа / impersonation) */
  userId?: string | null;
  accountEmail?: string | null;
  accountRole?: "student" | null;
};

export type Lesson = {
  id: string;
  teacherId: string;
  /** Участники совместного занятия (без дублей) */
  studentIds: string[];
  subject?: string;
  startsAt: string;
  endsAt: string;
  status: LessonStatus;
  /** Тема, пройденная на занятии (после проведения) */
  topicId?: string;
};

export type Attendance = {
  lessonId: string;
  studentId: string;
  status: AttendanceStatus;
};

/** Раздел учебной программы преподавателя */
export type TopicSection = {
  id: string;
  teacherId: string;
  title: string;
  /** Порядок среди разделов этого преподавателя */
  sortOrder: number;
};

export type Topic = {
  id: string;
  teacherId: string;
  /** null / отсутствует — «Без раздела» */
  sectionId: string | null;
  title: string;
  subject: string;
  description?: string;
  programNote?: string;
  status: TopicStatus;
  /** Порядок внутри раздела (или среди тем без раздела) */
  sortOrder: number;
};

export type DemoData = {
  version: 5;
  teachers: Teacher[];
  students: Student[];
  lessons: Lesson[];
  attendances: Attendance[];
  topicSections: TopicSection[];
  topics: Topic[];
  homeworks: Homework[];
  homeworkAssignments: HomeworkAssignment[];
  currentTeacherId: string;
  direkciyaTeacherId: string;
  /** Demo-ученик для кабинета «Аудитория» */
  currentStudentId: string;
};

export const STORAGE_KEY = "naemnye.demo.v5";
export const LEGACY_STORAGE_KEYS = [
  "naemnye.demo.v1",
  "naemnye.demo.v2",
  "naemnye.demo.v3",
  "naemnye.demo.v4",
];

export const DURATION_OPTIONS = [30, 45, 60, 90, 120] as const;

/** Служебный id «виртуального» раздела без раздела — только для UI */
export const UNSECTIONED_ID = "__unsectioned__";
