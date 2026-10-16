import { createSeedData } from "@/lib/demo/seed";
import type {
  DemoData,
  HomeworkAssignment,
  Lesson,
  Topic,
  TopicSection,
} from "@/lib/types";
import { LEGACY_STORAGE_KEYS, STORAGE_KEY } from "@/lib/types";

type LegacyLesson = Lesson & { studentId?: string; studentIds?: string[] };
type LegacyTopic = Topic & { sectionId?: string | null; sortOrder?: number };
type LegacyAssignment = HomeworkAssignment & { answerText?: string };

type LegacyV2 = {
  version: 2;
  teachers: DemoData["teachers"];
  students: DemoData["students"];
  lessons: LegacyLesson[];
  attendances?: DemoData["attendances"];
  topics: LegacyTopic[];
  topicSections?: TopicSection[];
  homeworks?: DemoData["homeworks"];
  homeworkAssignments?: LegacyAssignment[];
  currentTeacherId?: string;
  direkciyaTeacherId?: string;
  currentStudentId?: string;
};

type LegacyV3 = {
  version: 3;
  teachers: DemoData["teachers"];
  students: DemoData["students"];
  lessons: Lesson[];
  attendances: DemoData["attendances"];
  topicSections: TopicSection[];
  topics: Topic[];
  homeworks: DemoData["homeworks"];
  homeworkAssignments: LegacyAssignment[];
  currentTeacherId: string;
  direkciyaTeacherId: string;
  currentStudentId?: string;
};

function isObject(data: unknown): data is Record<string, unknown> {
  return !!data && typeof data === "object";
}

function isValidV4(data: unknown): data is DemoData {
  if (!isObject(data)) return false;
  const d = data as DemoData;
  return (
    d.version === 4 &&
    Array.isArray(d.teachers) &&
    Array.isArray(d.students) &&
    Array.isArray(d.lessons) &&
    Array.isArray(d.topicSections) &&
    Array.isArray(d.topics) &&
    Array.isArray(d.homeworks) &&
    Array.isArray(d.homeworkAssignments) &&
    typeof d.currentTeacherId === "string" &&
    typeof d.direkciyaTeacherId === "string" &&
    typeof d.currentStudentId === "string" &&
    d.lessons.every(
      (l) => Array.isArray(l.studentIds) && typeof l.teacherId === "string"
    )
  );
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

function pickCurrentStudentId(
  students: DemoData["students"],
  preferred?: string
): string {
  if (preferred && students.some((s) => s.id === preferred)) return preferred;
  const withTeacher = students.find((s) => s.teacherId && s.status === "active");
  return withTeacher?.id ?? students[0]?.id ?? "";
}

function toV4Base(input: {
  teachers: DemoData["teachers"];
  students: DemoData["students"];
  lessons: Lesson[];
  attendances: DemoData["attendances"];
  topicSections: TopicSection[];
  topics: Topic[];
  homeworks: DemoData["homeworks"];
  homeworkAssignments: HomeworkAssignment[];
  currentTeacherId: string;
  direkciyaTeacherId: string;
  currentStudentId?: string;
}): DemoData {
  return {
    version: 4,
    teachers: input.teachers,
    students: input.students,
    lessons: input.lessons,
    attendances: input.attendances,
    topicSections: input.topicSections,
    topics: input.topics,
    homeworks: input.homeworks,
    homeworkAssignments: input.homeworkAssignments.map((a) => ({
      ...a,
      answerText: a.answerText,
    })),
    currentTeacherId: input.currentTeacherId ?? "",
    direkciyaTeacherId: input.direkciyaTeacherId ?? "",
    currentStudentId: pickCurrentStudentId(
      input.students,
      input.currentStudentId
    ),
  };
}

/** Безопасная миграция v2/v3 → v4 (ответ ученика + currentStudentId). */
export function migrateToV4(raw: unknown): DemoData | null {
  if (!isObject(raw)) return null;
  const version = (raw as { version?: number }).version;
  if (version === 4 && isValidV4(raw)) return raw;

  if (version === 3) {
    const v3 = raw as LegacyV3;
    if (
      !Array.isArray(v3.teachers) ||
      !Array.isArray(v3.students) ||
      !Array.isArray(v3.lessons) ||
      !Array.isArray(v3.topics) ||
      !Array.isArray(v3.topicSections)
    ) {
      return null;
    }
    return toV4Base({
      teachers: v3.teachers,
      students: v3.students,
      lessons: v3.lessons,
      attendances: Array.isArray(v3.attendances) ? v3.attendances : [],
      topicSections: v3.topicSections,
      topics: v3.topics,
      homeworks: Array.isArray(v3.homeworks) ? v3.homeworks : [],
      homeworkAssignments: Array.isArray(v3.homeworkAssignments)
        ? v3.homeworkAssignments
        : [],
      currentTeacherId: v3.currentTeacherId ?? "",
      direkciyaTeacherId: v3.direkciyaTeacherId ?? "",
      currentStudentId: v3.currentStudentId,
    });
  }

  if (version !== 2) return null;
  const v2 = raw as LegacyV2;
  if (
    !Array.isArray(v2.teachers) ||
    !Array.isArray(v2.students) ||
    !Array.isArray(v2.lessons) ||
    !Array.isArray(v2.topics)
  ) {
    return null;
  }

  const topics = v2.topics.map((t, i) => migrateTopic(t, i));
  const topicSections = Array.isArray(v2.topicSections) ? v2.topicSections : [];

  return toV4Base({
    teachers: v2.teachers,
    students: v2.students,
    lessons: v2.lessons.map(migrateLesson),
    attendances: Array.isArray(v2.attendances) ? v2.attendances : [],
    topicSections,
    topics,
    homeworks: Array.isArray(v2.homeworks) ? v2.homeworks : [],
    homeworkAssignments: Array.isArray(v2.homeworkAssignments)
      ? v2.homeworkAssignments
      : [],
    currentTeacherId: v2.currentTeacherId ?? "",
    direkciyaTeacherId: v2.direkciyaTeacherId ?? "",
    currentStudentId: v2.currentStudentId,
  });
}

/** @deprecated используйте migrateToV4 */
export function migrateToV3(raw: unknown): DemoData | null {
  return migrateToV4(raw);
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
      if (isValidV4(parsed) && parsed.teachers.length) {
        clearLegacy();
        return parsed;
      }
      const migrated = migrateToV4(parsed);
      if (migrated && migrated.teachers.length) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        clearLegacy();
        return migrated;
      }
    }

    const legacy = readLegacyBlob();
    if (legacy) {
      const migrated = migrateToV4(legacy);
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
