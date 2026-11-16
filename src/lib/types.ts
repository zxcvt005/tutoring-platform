import type { TrialLessonPublic } from "@/lib/trial-lessons";

/** Статусы людей */
export type PersonStatus = "active" | "paused" | "archived";

export type StudentArchiveReason =
  | "trial_not_continued"
  | "stopped"
  | "other";

export type TeacherStatus = "active" | "inactive" | "archived";

export type LessonStatus = "planned" | "done" | "cancelled";

/** Посещаемость по занятию */
export type AttendanceStatus =
  | "present"
  | "absent_excused"
  | "absent_unexcused"
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
  | "numeric"
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
  /** Ключ объекта в S3/local (публичная часть вопроса). */
  imageObjectKey?: string;
  /**
   * Необязательный номер задания в КИМ ЕГЭ по физике.
   * Хранится в публичной части вопроса и в снимке назначения.
   */
  kimNumber?: number;
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
  /** Тема, если тест создан из карточки темы; иначе каталог «Тесты». */
  topicId?: string | null;
  /**
   * Устаревшая связь с разделом программы. Тесты по папкам не группируются:
   * место в каталоге задаёт только folderId.
   */
  sectionId?: string | null;
  /** Папка каталога. null — корень пространства, не «раздел». */
  folderId?: string | null;
  teacherId: string;
  libraryScope?: LibraryScope;
  origin?: MaterialOrigin | null;
  updatedAt?: string;
  title: string;
  /** null и пустая строка — описание не задано. */
  description?: string | null;
  status: HomeworkTemplateStatus;
  questions: TestQuestion[];
  /** Сумма maxScore вопросов (кэш; пересчитывается при сохранении) */
  maxScore?: number;
  questionCount?: number;
  assignmentCount?: number;
  /** homework — каталог ДЗ; theory — тест теории; intensive — тест конкретного интенсива */
  purpose?: "homework" | "theory" | "intensive";
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
 * in_progress — черновик первой попытки.
 * remaining_questions — 1-я попытка сдана досрочно, остались пустые вопросы.
 * attempt1_submitted — 1-я попытка сдана, можно исправлять ошибки.
 * attempt2_in_progress — черновик второй попытки.
 * completed — обе попытки сданы; может ждать ручной проверки.
 */
export type HomeworkAssignmentStatus =
  | "assigned"
  | "in_progress"
  | "remaining_questions"
  | "attempt1_submitted"
  | "attempt2_in_progress"
  | "completed"
  | "reviewed"
  | "overdue"
  | "withdrawn";

export type QuestionOutcomeStatus =
  | "correct_first"
  | "corrected_second"
  | "incorrect"
  | "pending_review"
  | "unanswered";

export type QuestionOutcome = {
  questionId: string;
  status: QuestionOutcomeStatus;
};

export type HomeworkAssignment = {
  id: string;
  homeworkId: string;
  topicId?: string | null;
  teacherId: string;
  studentId: string;
  /**
   * homework — обычное ДЗ; theory — попытка теста, прикреплённого к теории.
   * Не смешивается с ДЗ в списках домашних заданий.
   */
  sourceKind?: "homework" | "theory" | "intensive";
  theoryAssignmentId?: string | null;
  theoryTitle?: string | null;
  /** Занятие, с которого назначили (если есть) */
  lessonId?: string;
  /** Срок необязателен — без даты задание всё равно доступно */
  dueAt?: string;
  /** Момент назначения (для расчёта «следующего занятия») */
  assignedAt?: string;
  status: HomeworkAssignmentStatus;
  /**
   * Вычисляемый флаг: следующее занятие ученика уже прошло,
   * а ДЗ ещё не завершено. Не хранится отдельной колонкой.
   */
  missedNextLesson?: boolean;
  score?: number;
  maxScore?: number;
  feedback?: string;
  /** legacy текстовый ответ */
  answerText?: string;
  completedAt?: string;
  reviewedAt?: string;
  /** Снимок вопросов и ключей на момент назначения */
  testSnapshot?: TestSnapshot;
  /** Актуальные ответы (2-я попытка перекрывает 1-ю, где есть) */
  answers?: StudentAnswer[];
  attempt1Answers?: StudentAnswer[];
  attempt2Answers?: StudentAnswer[];
  attempt1Percent?: number | null;
  attempt2Percent?: number | null;
  attempt1Submitted?: boolean;
  attempt2Submitted?: boolean;
  unansweredQuestionIds?: string[];
  retryQuestionIds?: string[];
  questionOutcomes?: QuestionOutcome[];
  /** Ключи и разбор можно показать ученику */
  revealKeys?: boolean;
};

export type WorkInterval = {
  start: string;
  end: string;
};

/** Известные ключи возможностей тарифа (расширяемый список). */
export type TariffFeatureKey =
  | "individual_lessons"
  | "homework"
  | "group_calls"
  | "intensives"
  | "extra_materials"
  | "extra_tests";

export type TariffStatus = "active" | "archived";

export type LearningDirectionStatus = "active" | "archived";

export type LearningDirection = {
  id: string;
  name: string;
  slug: string;
  status: LearningDirectionStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type TariffPurchaseOption = {
  id: string;
  tariffId: string;
  lessonsCount: number;
  totalPrice: number;
  sortOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type LessonOrderStatus =
  | "awaiting_payment"
  | "paid"
  | "cancelled"
  | "expired"
  | "refunded"
  | "disputed";

export type LessonOrder = {
  id: string;
  studentId: string;
  payerUserId: string;
  /** Имя плательщика (если отличается от ученика — видно в журнале оплат) */
  payerName?: string | null;
  tariffId: string;
  optionId?: string | null;
  directionId: string;
  directionName?: string | null;
  tariffNameSnapshot: string;
  lessonsCount: number;
  totalAmount: number;
  unitPrice: number;
  currency: "RUB";
  featuresSnapshot: TariffFeatureKey[];
  productIdsSnapshot: string[];
  status: LessonOrderStatus;
  paidAt?: string | null;
  creditedAt?: string | null;
  creditLedgerEntryId?: string | null;
  accessRevoked?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type StudentLessonLedgerReason =
  | "purchase"
  | "present"
  | "absent_unexcused"
  | "reversal"
  | "manual_adjustment"
  | "refund_clawback";

/** Запись журнала баланса занятий (для карточки ученика в Дирекции). */
export type StudentLessonLedgerEntry = {
  id: string;
  studentId: string;
  directionId: string;
  directionName?: string | null;
  delta: number;
  reason: StudentLessonLedgerReason | string;
  lessonId?: string | null;
  orderId?: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
  note?: string | null;
  createdAt: string;
};

/** Агрегированный баланс занятий ученика по направлению (вычисляемый). */
export type StudentDirectionBalance = {
  directionId: string;
  directionName?: string;
  directionSlug?: string;
  balance: number;
};

/** Сводка баланса для bootstrap (все ученики дирекции / пул преподавателя). */
export type StudentDirectionBalanceRow = {
  studentId: string;
  directionId: string;
  remaining: number;
  used: number;
};

export type PaymentRecordStatus =
  | "pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "expired"
  | "refunded";

export type Tariff = {
  id: string;
  directionId: string;
  name: string;
  /** Legacy одиночная цена; для новых тарифов см. purchaseOptions */
  price?: number;
  currency: "RUB";
  /** Прогнозируемая длительность пакета, дни */
  durationDays?: number | null;
  lessonsLimit?: number | null;
  weeklyFrequency: number;
  includesText?: string;
  features: TariffFeatureKey[];
  status: TariffStatus;
  adminNotes?: string;
  /** Варианты покупки (N занятий за сумму) */
  purchaseOptions?: TariffPurchaseOption[];
  /** Сколько активных заказов (для UI дирекции) */
  activeOrderCount?: number;
  /** Продукты каталога, включённые в тариф */
  productIds?: string[];
  /** Денормализация для UI */
  directionName?: string;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  /** Есть ли реализованная функциональность в коде */
  implemented: boolean;
  tariffCount?: number;
  tariffNames?: string[];
  createdAt?: string;
  updatedAt?: string;
};

/** @deprecated Используйте lessonOrders + studentLessonLedger. */
export type TariffAssignmentStatus =
  | "pending_payment"
  | "active"
  | "queued"
  | "expired"
  | "cancelled"
  | "paused";

/** @deprecated */
export type TariffPaymentStatus = "unpaid" | "paid" | "refunded";

/** @deprecated */
export type StudentPackageStatus =
  | "none"
  | "unpaid"
  | "active"
  | "queued"
  | "exhausted"
  | "debt"
  | "paused"
  | "cancelled";

/**
 * @deprecated Заменено моделью lessonOrders + studentLessonLedger.
 */
export type StudentTariffAssignment = {
  id: string;
  studentId: string;
  tariffId: string;
  startsAt: string;
  endsAt: string;
  priceSnapshot: number;
  currency: "RUB";
  status: TariffAssignmentStatus;
  paymentStatus: TariffPaymentStatus;
  lessonsLimitSnapshot?: number | null;
  weeklyFrequencySnapshot?: number | null;
  durationDaysSnapshot?: number | null;
  lessonsUsed?: number;
  lessonsRemaining?: number | null;
  packageStatus?: StudentPackageStatus;
  tariffName?: string;
  includesText?: string;
};

export type PaymentRecord = {
  id: string;
  studentId: string;
  orderId: string;
  amount: number;
  currency: "RUB";
  status: PaymentRecordStatus;
  provider: string;
  externalId?: string | null;
  paymentLinkId?: string | null;
  paidAt?: string;
  createdAt: string;
  failureReason?: string | null;
};

/** Краткое описание PDF расчётного документа для UI. */
export type SettlementDocumentKind = "income" | "income_return";

export type SettlementDocumentSummary = {
  id: string;
  paymentId: string;
  orderId: string;
  kind: SettlementDocumentKind;
  sequentialNumber: number;
  issuedAt: string;
  amount: number;
  serviceName: string;
  settlementSign: string;
};

export type Teacher = {
  id: string;
  fullName: string;
  avatarInitials?: string;
  /** URL для отображения фото (из photoKey или placeholder) */
  photoUrl?: string | null;
  bio?: string;
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

/** Класс ученика (школа). */
export type StudentGrade = "8" | "9" | "10" | "11";

export type Student = {
  id: string;
  fullName: string;
  /** Класс 8–11; отсутствует — «Не указан». */
  grade?: StudentGrade | null;
  /**
   * Устаревшее свободное поле контакта.
   * Новые формы используют telegram и phone.
   */
  contacts?: string;
  telegram?: string | null;
  phone?: string | null;
  /** Контакты родителей — только дирекция / преподаватель. */
  parentContacts?: string | null;
  status: PersonStatus;
  teacherId: string;
  /** Внутренние заметки администрации — не отдаются ученику. */
  notes?: string;
  archivedAt?: string | null;
  archivedReason?: StudentArchiveReason | null;
  archivedComment?: string | null;
  previousTeacherId?: string | null;
  /** Когда создана карточка (для исторических сводок «Доходы»). */
  createdAt?: string;
  /** Связанная учётная запись (для входа / impersonation) */
  userId?: string | null;
  accountEmail?: string | null;
  accountRole?: "student" | null;
  /** Балансы занятий по направлениям (денормализация для UI). */
  directionBalances?: StudentDirectionBalance[];
};

export type LessonTopicLink = {
  id: string;
  topicId?: string | null;
  title: string;
  sortOrder: number;
};

export type Lesson = {
  id: string;
  teacherId: string;
  directionId?: string | null;
  /**
   * Ровно один ученик. Массив сохранён для совместимости UI:
   * всегда `studentId ? [studentId] : []`.
   */
  studentIds: string[];
  subject?: string;
  startsAt: string;
  endsAt: string;
  status: LessonStatus;
  /** Первая тема каталога (совместимость). Полный список — lessonTopics. */
  topicId?: string;
  lessonTopics?: LessonTopicLink[];
};

export type Attendance = {
  lessonId: string;
  studentId: string;
  status: AttendanceStatus;
};

/** Раздел учебной программы преподавателя (legacy; зеркало корневых material_folders). */
export type TopicSection = {
  id: string;
  teacherId: string;
  title: string;
  /** Порядок среди разделов этого преподавателя */
  sortOrder: number;
};

/** Универсальная папка материалов (новая иерархическая модель). */
export type { MaterialFolder, MaterialFolderKind, FolderSpace } from "@/lib/folders/material-folders";

export type LibraryScope = "school" | "teacher";

/** Снимок источника копии. Не связывает содержимое с оригиналом. */
export type MaterialOrigin = {
  sourceKind: "theory" | "test" | "topic";
  sourceId: string | null;
  sourceTitle: string;
  sourceAuthorName: string | null;
  sourceVersionId: string | null;
  sourceScope: LibraryScope;
  copiedAt: string;
};

export type Topic = {
  id: string;
  teacherId: string;
  /** school — оригинал базы знаний; teacher — материал преподавателя. */
  libraryScope?: LibraryScope;
  origin?: MaterialOrigin | null;
  updatedAt?: string;
  /** null / отсутствует — «Без раздела» (legacy) */
  sectionId: string | null;
  /** Папка в material_folders; null — корень пространства */
  folderId?: string | null;
  title: string;
  subject: string;
  description?: string;
  programNote?: string;
  status: TopicStatus;
  /** Порядок внутри раздела (или среди тем без раздела) */
  sortOrder: number;
};

export type TheoryStatus = "draft" | "published" | "archived";

export type TheoryAssignmentStatus =
  | "assigned"
  | "viewed"
  | "in_progress"
  | "awaiting_review"
  | "completed";

export type TheoryFile = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

export type TheoryMaterial = {
  id: string;
  teacherId: string;
  libraryScope?: LibraryScope;
  origin?: MaterialOrigin | null;
  folderId?: string | null;
  title: string;
  description?: string;
  videoUrl?: string | null;
  videoProvider?: "vk" | "youtube" | "rutube" | "unknown" | null;
  videoEmbedUrl?: string | null;
  embedAllowed: boolean;
  videoWarning?: string | null;
  status: TheoryStatus;
  testId?: string | null;
  hasTest: boolean;
  hasVideo: boolean;
  fileCount: number;
  assignedCount: number;
  completedCount: number;
  awaitingReviewCount: number;
  currentVersionId?: string | null;
  createdAt: string;
  updatedAt: string;
  files?: TheoryFile[];
};

export type TheoryAssignment = {
  id: string;
  materialId: string;
  versionId: string;
  teacherId: string;
  studentId: string;
  status: TheoryAssignmentStatus;
  assignedAt: string;
  viewedAt?: string | null;
  completedAt?: string | null;
  testAssignmentId?: string | null;
  title: string;
  description?: string | null;
  videoUrl?: string | null;
  videoProvider?: "vk" | "youtube" | "rutube" | "unknown" | null;
  videoEmbedUrl?: string | null;
  embedAllowed: boolean;
  videoWarning?: string | null;
  hasTest: boolean;
  files: TheoryFile[];
  testPercent?: number | null;
  testStatus?: HomeworkAssignmentStatus | null;
};

export type IntensiveTestRef = {
  testId: string;
  title: string;
  sortOrder: number;
};

export type Intensive = {
  id: string;
  teacherId: string;
  libraryScope?: LibraryScope;
  folderId?: string | null;
  title: string;
  description?: string;
  videoUrl?: string | null;
  videoProvider?: "vk" | "youtube" | "rutube" | "unknown" | null;
  videoEmbedUrl?: string | null;
  embedAllowed: boolean;
  videoWarning?: string | null;
  status: TheoryStatus;
  tests: IntensiveTestRef[];
  fileCount: number;
  assignedCount: number;
  currentVersionId?: string | null;
  createdAt: string;
  updatedAt: string;
  files?: TheoryFile[];
};

export type IntensiveAssignmentTest = {
  testId: string;
  title: string;
  sortOrder: number;
  dueAt: string;
  testAssignmentId: string;
  status: HomeworkAssignmentStatus;
  score?: number | null;
  maxScore?: number | null;
  completedAt?: string | null;
};

export type IntensiveAssignment = {
  id: string;
  intensiveId: string;
  versionId: string;
  teacherId: string;
  studentId: string;
  assignedAt: string;
  title: string;
  description?: string | null;
  videoUrl?: string | null;
  videoProvider?: "vk" | "youtube" | "rutube" | "unknown" | null;
  videoEmbedUrl?: string | null;
  embedAllowed: boolean;
  videoWarning?: string | null;
  files: TheoryFile[];
  tests: IntensiveAssignmentTest[];
};

export type MockExam = {
  id: string;
  teacherId: string;
  title: string;
  /** Дата проведения, YYYY-MM-DD */
  date: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type MockExamResult = {
  id: string;
  mockExamId: string;
  studentId: string;
  /** Вторичный балл ЕГЭ, 0–100. */
  testScore: number;
  createdAt: string;
  updatedAt: string;
};

export type DemoData = {
  version: 6;
  teachers: Teacher[];
  students: Student[];
  lessons: Lesson[];
  /** Пробные уроки для сетки расписания. Без внутренних заметок продажника. */
  trialLessons: TrialLessonPublic[];
  attendances: Attendance[];
  topicSections: TopicSection[];
  /** Иерархические папки материалов (источник правды для проводника). */
  materialFolders: import("@/lib/folders/material-folders").MaterialFolder[];
  topics: Topic[];
  homeworks: Homework[];
  homeworkAssignments: HomeworkAssignment[];
  theories: TheoryMaterial[];
  theoryAssignments: TheoryAssignment[];
  intensives: Intensive[];
  intensiveAssignments: IntensiveAssignment[];
  mockExams: MockExam[];
  mockExamResults: MockExamResult[];
  learningDirections: LearningDirection[];
  tariffs: Tariff[];
  lessonOrders: LessonOrder[];
  /** @deprecated См. lessonOrders; в новых данных — пустой массив */
  tariffAssignments: StudentTariffAssignment[];
  studentDirectionBalances: StudentDirectionBalanceRow[];
  payments: PaymentRecord[];
  /** PDF расчётные документы (приход / возврат прихода), доступные роли. */
  settlementDocuments: SettlementDocumentSummary[];
  products: Product[];
  /** Реализованные продукты, доступные текущему ученику по тарифу */
  availableProductSlugs: string[];
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
