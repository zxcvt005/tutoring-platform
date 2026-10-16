import { createSeedData } from "@/lib/demo/seed";
import type { DemoData, Lesson, Topic, TopicSection } from "@/lib/types";
import { LEGACY_STORAGE_KEYS, STORAGE_KEY } from "@/lib/types";

type LegacyLesson = Lesson & { studentId?: string; studentIds?: string[] };
type LegacyTopic = Topic & { sectionId?: string | null; sortOrder?: number };
type LegacyV2 = Omit<DemoData, "version" | "topicSections" | "lessons" | "topics"> & {
  version: 2;
  lessons: LegacyLesson[];
  topics: LegacyTopic[];
  topicSections?: TopicSection[];
};

function isObject(data: unknown): data is Record<string, unknown> {
  return !!data && typeof data === "object";
}

function isValidV3(data: unknown): data is DemoData {
  if (!isObject(data)) return false;
  const d = data as DemoData;
  return (
    d.version === 3 &&
    Array.isArray(d.teachers) &&
    Array.isArray(d.students) &&
    Array.isArray(d.lessons) &&
    Array.isArray(d.topicSections) &&
    Array.isArray(d.topics) &&
    Array.isArray(d.homeworks) &&
    Array.isArray(d.homeworkAssignments) &&
    typeof d.currentTeacherId === "string" &&
    typeof d.direkciyaTeacherId === "string" &&
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

/** Безопасная миграция v2 → v3 (studentIds, разделы тем). */
export function migrateToV3(raw: unknown): DemoData | null {
  if (!isObject(raw)) return null;
  const version = (raw as { version?: number }).version;
  if (version === 3 && isValidV3(raw)) return raw;

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

  return {
    version: 3,
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
  };
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
      if (isValidV3(parsed) && parsed.teachers.length) {
        clearLegacy();
        return parsed;
      }
      const migrated = migrateToV3(parsed);
      if (migrated && migrated.teachers.length) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        clearLegacy();
        return migrated;
      }
    }

    const legacy = readLegacyBlob();
    if (legacy) {
      const migrated = migrateToV3(legacy);
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
