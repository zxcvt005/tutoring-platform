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

export type HomeworkTemplateStatus = "active" | "archived";

export type CheckType = "score" | "pass_fail" | "comment";

/** Статус назначения ДЗ ученику (не путать с баллом) */
export type HomeworkAssignmentStatus =
  | "assigned"
  | "completed"
  | "reviewed"
  | "overdue";

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
};

export type Student = {
  id: string;
  fullName: string;
  contacts?: string;
  status: PersonStatus;
  teacherId: string;
  notes?: string;
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

export type Homework = {
  id: string;
  topicId: string;
  teacherId: string;
  title: string;
  description?: string;
  checkType: CheckType;
  maxScore?: number;
  status: HomeworkTemplateStatus;
};

export type HomeworkAssignment = {
  id: string;
  homeworkId: string;
  topicId: string;
  teacherId: string;
  studentId: string;
  dueAt: string;
  status: HomeworkAssignmentStatus;
  score?: number;
  maxScore?: number;
  feedback?: string;
  /** Ответ ученика при сдаче (прототип) */
  answerText?: string;
  completedAt?: string;
  reviewedAt?: string;
};

export type DemoData = {
  version: 4;
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

export const STORAGE_KEY = "naemnye.demo.v4";
export const LEGACY_STORAGE_KEYS = [
  "naemnye.demo.v1",
  "naemnye.demo.v2",
  "naemnye.demo.v3",
];

export const DURATION_OPTIONS = [30, 45, 60, 90, 120] as const;

/** Служебный id «виртуального» раздела без раздела — только для UI */
export const UNSECTIONED_ID = "__unsectioned__";
