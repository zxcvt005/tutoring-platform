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
  start: string; // "09:00"
  end: string; // "21:00"
};

export type Teacher = {
  id: string;
  fullName: string;
  /** Инициалы / цвет — без реальных фото */
  avatarInitials?: string;
  subjects: string[];
  specializations?: string[];
  phone?: string;
  email?: string;
  startedAt?: string; // ISO date
  status: TeacherStatus;
  lessonPrice?: number;
  teacherPay?: number;
  defaultDurationMin?: number;
  /** 1=пн … 7=вс */
  workDays?: number[];
  workIntervals?: WorkInterval[];
  adminNotes?: string;
};

export type Student = {
  id: string;
  fullName: string;
  contacts?: string;
  status: PersonStatus;
  /** Пустая строка — без назначенного преподавателя */
  teacherId: string;
  notes?: string;
};

export type Lesson = {
  id: string;
  teacherId: string;
  /** Индивидуальное занятие */
  studentId: string;
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

export type Topic = {
  id: string;
  teacherId: string;
  title: string;
  subject: string;
  description?: string;
  programNote?: string;
  status: TopicStatus;
};

/** Шаблон ДЗ, привязанный к теме */
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

/** Назначение ДЗ конкретному ученику */
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
  completedAt?: string;
  reviewedAt?: string;
};

export type DemoData = {
  version: 2;
  teachers: Teacher[];
  students: Student[];
  lessons: Lesson[];
  attendances: Attendance[];
  topics: Topic[];
  homeworks: Homework[];
  homeworkAssignments: HomeworkAssignment[];
  /** Demo-преподаватель для Кафедры */
  currentTeacherId: string;
  /** Выбранный преподаватель в Дирекции (расписание / результаты) */
  direkciyaTeacherId: string;
};

export const STORAGE_KEY = "naemnye.demo.v2";
export const LEGACY_STORAGE_KEYS = ["naemnye.demo.v1"];

export const DURATION_OPTIONS = [30, 45, 60, 90, 120] as const;
