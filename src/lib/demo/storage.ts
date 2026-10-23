import { createSeedData } from "@/lib/demo/seed";
import {
  computeMaxScore,
  legacyHomeworkToQuestions,
  snapshotFromHomework,
} from "@/lib/tests/helpers";
import type {
  DemoData,
  Homework,
  HomeworkAssignment,
  HomeworkTemplateStatus,
  Lesson,
  Topic,
  TopicSection,
} from "@/lib/types";
import { LEGACY_STORAGE_KEYS, STORAGE_KEY } from "@/lib/types";

type LegacyLesson = Lesson & { studentId?: string; studentIds?: string[] };
type LegacyTopic = Topic & { sectionId?: string | null; sortOrder?: number };
type LegacyHomework = Partial<Homework> & {
  id: string;
  topicId: string;
  teacherId: string;
  title: string;
  status?: string;
  checkType?: Homework["checkType"];
  maxScore?: number;
  description?: string;
  questions?: Homework["questions"];
};
type LegacyAssignment = Partial<HomeworkAssignment> & {
  id: string;
  homeworkId: string;
  topicId: string;
  teacherId: string;
  studentId: string;
  status: HomeworkAssignment["status"];
  dueAt?: string;
};

type LegacyBlob = {
  version?: number;
  teachers: DemoData["teachers"];
  students: DemoData["students"];
  lessons: LegacyLesson[];
  attendances?: DemoData["attendances"];
  topics: LegacyTopic[];
  topicSections?: TopicSection[];
  homeworks?: LegacyHomework[];
  homeworkAssignments?: LegacyAssignment[];
  currentTeacherId?: string;
  direkciyaTeacherId?: string;
  currentStudentId?: string;
};

function isObject(data: unknown): data is Record<string, unknown> {
  return !!data && typeof data === "object";
}

function migrateLesson(lesson: LegacyLesson): Lesson {
  const fromArray = Array.isArray(lesson.studentIds)
    ? lesson.studentIds.filter(Boolean)
    : [];
  const fromSingle =
    typeof lesson.studentId === "string" && lesson.studentId
      ? [lesson.studentId]
      : [];
  const studentIds = [...new Set(fromArray.length ? fromArray : fromSingle)];
  return {
    id: lesson.id,
    teacherId: lesson.teacherId,
    studentIds,
    subject: lesson.subject,
    startsAt: lesson.startsAt,
    endsAt: lesson.endsAt,
    status: lesson.status,
    topicId: lesson.topicId,
  };
}

function migrateTopic(topic: LegacyTopic, index: number): Topic {
  return {
    id: topic.id,
    teacherId: topic.teacherId,
    sectionId: topic.sectionId ?? null,
    title: topic.title,
    subject: topic.subject,
    description: topic.description,
    programNote: topic.programNote,
    status: topic.status,
    sortOrder: typeof topic.sortOrder === "number" ? topic.sortOrder : index,
  };
}

function migrateHomeworkStatus(status?: string): HomeworkTemplateStatus {
  if (status === "draft" || status === "published" || status === "archived") {
    return status;
  }
  if (status === "active") return "published";
  return "published";
}

function migrateHomework(hw: LegacyHomework): Homework {
  const questions =
    Array.isArray(hw.questions) && hw.questions.length > 0
      ? hw.questions
      : legacyHomeworkToQuestions(hw);
  return {
    id: hw.id,
    topicId: hw.topicId,
    teacherId: hw.teacherId,
    title: hw.title,
    description: hw.description,
    status: migrateHomeworkStatus(hw.status),
    questions,
    maxScore: computeMaxScore(questions) || hw.maxScore,
    checkType: hw.checkType,
  };
}

function migrateAssignment(
  a: LegacyAssignment,
  homeworks: Homework[]
): HomeworkAssignment {
  const hw = homeworks.find((h) => h.id === a.homeworkId);
  const snapshot =
    a.testSnapshot ??
    (hw
      ? snapshotFromHomework(hw)
      : {
          title: "Задание",
          questions: [],
          maxScore: a.maxScore ?? 0,
        });

  let status = a.status;
  if (status === ("active" as string)) status = "assigned";

  return {
    id: a.id,
    homeworkId: a.homeworkId,
    topicId: a.topicId,
    teacherId: a.teacherId,
    studentId: a.studentId,
    lessonId: a.lessonId,
    dueAt: a.dueAt,
    status,
    score: a.score,
    maxScore: a.maxScore ?? snapshot.maxScore,
    feedback: a.feedback,
    answerText: a.answerText,
    completedAt: a.completedAt,
    reviewedAt: a.reviewedAt,
    testSnapshot: snapshot,
    answers: a.answers ?? [],
  };
}

function pickCurrentStudentId(
  students: DemoData["students"],
  preferred?: string
): string {
  if (preferred && students.some((s) => s.id === preferred)) return preferred;
  const withTeacher = students.find((s) => s.teacherId && s.status === "active");
  return withTeacher?.id ?? students[0]?.id ?? "";
}

function isValidV6(data: unknown): data is DemoData {
  if (!isObject(data)) return false;
  const d = data as DemoData;
  return (
    d.version === 6 &&
    Array.isArray(d.teachers) &&
    Array.isArray(d.students) &&
    Array.isArray(d.lessons) &&
    Array.isArray(d.topicSections) &&
    Array.isArray(d.topics) &&
    Array.isArray(d.homeworks) &&
    Array.isArray(d.homeworkAssignments) &&
    Array.isArray(d.tariffs) &&
    Array.isArray(d.tariffAssignments) &&
    Array.isArray(d.payments) &&
    typeof d.currentTeacherId === "string" &&
    typeof d.direkciyaTeacherId === "string" &&
    typeof d.currentStudentId === "string" &&
    d.lessons.every(
      (l) => Array.isArray(l.studentIds) && typeof l.teacherId === "string"
    ) &&
    d.homeworks.every((h) => Array.isArray(h.questions))
  );
}

export function migrateToV5(raw: unknown): DemoData | null {
  if (!isObject(raw)) return null;
  if (isValidV6(raw)) return raw;

  const blob = raw as LegacyBlob;
  const version = blob.version;
  if (
    version !== 2 &&
    version !== 3 &&
    version !== 4 &&
    version !== 5 &&
    version !== 6
  ) {
    return null;
  }
  if (
    !Array.isArray(blob.teachers) ||
    !Array.isArray(blob.students) ||
    !Array.isArray(blob.lessons) ||
    !Array.isArray(blob.topics)
  ) {
    return null;
  }

  const lessons =
    version === 2
      ? blob.lessons.map(migrateLesson)
      : (blob.lessons as Lesson[]);
  const topics =
    version === 2
      ? blob.topics.map((t, i) => migrateTopic(t, i))
      : (blob.topics as Topic[]);
  const topicSections = Array.isArray(blob.topicSections)
    ? blob.topicSections
    : [];
  const homeworks = (Array.isArray(blob.homeworks) ? blob.homeworks : []).map(
    migrateHomework
  );
  const homeworkAssignments = (
    Array.isArray(blob.homeworkAssignments) ? blob.homeworkAssignments : []
  ).map((a) => migrateAssignment(a, homeworks));

  return {
    version: 6,
    teachers: blob.teachers,
    students: blob.students,
    lessons,
    attendances: Array.isArray(blob.attendances) ? blob.attendances : [],
    topicSections,
    topics,
    homeworks,
    homeworkAssignments,
    theories: Array.isArray((blob as DemoData).theories)
      ? (blob as DemoData).theories
      : [],
    theoryAssignments: Array.isArray((blob as DemoData).theoryAssignments)
      ? (blob as DemoData).theoryAssignments
      : [],
    tariffs: Array.isArray((blob as DemoData).tariffs)
      ? (blob as DemoData).tariffs
      : [],
    tariffAssignments: Array.isArray((blob as DemoData).tariffAssignments)
      ? (blob as DemoData).tariffAssignments
      : [],
    payments: Array.isArray((blob as DemoData).payments)
      ? (blob as DemoData).payments
      : [],
    currentTeacherId: blob.currentTeacherId ?? "",
    direkciyaTeacherId: blob.direkciyaTeacherId ?? "",
    currentStudentId: pickCurrentStudentId(
      blob.students,
      blob.currentStudentId
    ),
  };
}

/** @deprecated */
export function migrateToV4(raw: unknown): DemoData | null {
  return migrateToV5(raw);
}

/** @deprecated */
export function migrateToV3(raw: unknown): DemoData | null {
  return migrateToV5(raw);
}

function clearLegacy(): void {
  if (typeof window === "undefined") return;
  for (const key of LEGACY_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

function readLegacyBlob(): unknown | null {
  if (typeof window === "undefined") return null;
  for (const key of LEGACY_STORAGE_KEYS) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as unknown;
    } catch {
      // continue
    }
  }
  return null;
}

export function loadDemoData(): DemoData {
  if (typeof window === "undefined") {
    return createSeedData();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (isValidV6(parsed) && parsed.teachers.length) {
        clearLegacy();
        return parsed;
      }
      const migrated = migrateToV5(parsed);
      if (migrated && migrated.teachers.length) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        clearLegacy();
        return migrated;
      }
    }

    const legacy = readLegacyBlob();
    if (legacy) {
      const migrated = migrateToV5(legacy);
      if (migrated && migrated.teachers.length) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        clearLegacy();
        return migrated;
      }
    }

    clearLegacy();
    const seed = createSeedData();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  } catch {
    const seed = createSeedData();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      clearLegacy();
    } catch {
      // квота / приватный режим
    }
    return seed;
  }
}

export function saveDemoData(data: DemoData): { ok: boolean; error?: string } {
  if (typeof window === "undefined") {
    return { ok: true };
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Не удалось сохранить в localStorage",
    };
  }
}

export function clearDemoStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    clearLegacy();
  } catch {
    // ignore
  }
}
