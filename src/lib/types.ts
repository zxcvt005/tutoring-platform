export type PersonStatus = "active" | "paused";

export type LessonStatus = "planned" | "done" | "cancelled";

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export type AssignmentStatus = "draft" | "published" | "closed";

export type ResultStatus = "pending" | "submitted" | "graded" | "overdue";

export type Teacher = {
  id: string;
  fullName: string;
  subjects: string[];
  status: PersonStatus;
  email?: string;
};

export type Student = {
  id: string;
  fullName: string;
  contacts?: string;
  status: PersonStatus;
  /** Один основной преподаватель */
  teacherId: string;
  groupIds: string[];
  notes?: string;
};

export type Group = {
  id: string;
  title: string;
  teacherId: string;
  studentIds: string[];
  scheduleHint?: string;
};

export type Lesson = {
  id: string;
  title?: string;
  teacherId: string;
  groupId?: string;
  studentIds?: string[];
  startsAt: string;
  endsAt: string;
  status: LessonStatus;
};

export type Attendance = {
  lessonId: string;
  studentId: string;
  status: AttendanceStatus;
};

export type Assignment = {
  id: string;
  title: string;
  description?: string;
  teacherId: string;
  groupId?: string;
  studentIds: string[];
  dueAt: string;
  status: AssignmentStatus;
  maxScore: number;
};

export type Result = {
  id: string;
  assignmentId: string;
  studentId: string;
  score?: number;
  maxScore?: number;
  status: ResultStatus;
  feedback?: string;
  submittedAt?: string;
};

export type DemoData = {
  teachers: Teacher[];
  students: Student[];
  groups: Group[];
  lessons: Lesson[];
  attendances: Attendance[];
  assignments: Assignment[];
  results: Result[];
  /** Выбранный demo-преподаватель для кабинета Кафедры */
  currentTeacherId: string;
};

export const STORAGE_KEY = "naemnye.demo.v1";
