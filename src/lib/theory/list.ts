import type {
  TheoryAssignment,
  TheoryAssignmentStatus,
  TheoryMaterial,
} from "@/lib/types";

export type TeacherTheoryStats = {
  assignedCount: number;
  completedCount: number;
  awaitingReviewCount: number;
};

export function teacherTheoryStats(
  assignments: Pick<TheoryAssignment, "materialId" | "status">[],
  materialId: string
): TeacherTheoryStats {
  const rows = assignments.filter((a) => a.materialId === materialId);
  return {
    assignedCount: rows.length,
    completedCount: rows.filter((a) => a.status === "completed").length,
    awaitingReviewCount: rows.filter((a) => a.status === "awaiting_review")
      .length,
  };
}

export type StudentTheorySectionKey =
  | "new"
  | "in_progress"
  | "awaiting_review"
  | "completed";

export function studentTheorySection(
  status: TheoryAssignmentStatus
): StudentTheorySectionKey {
  if (status === "completed") return "completed";
  if (status === "awaiting_review") return "awaiting_review";
  if (status === "assigned") return "new";
  return "in_progress";
}

export function groupStudentTheories(items: TheoryAssignment[]): {
  key: StudentTheorySectionKey;
  title: string;
  items: TheoryAssignment[];
}[] {
  const buckets: Record<StudentTheorySectionKey, TheoryAssignment[]> = {
    new: [],
    in_progress: [],
    awaiting_review: [],
    completed: [],
  };
  for (const item of items) {
    buckets[studentTheorySection(item.status)].push(item);
  }
  const order: { key: StudentTheorySectionKey; title: string }[] = [
    { key: "new", title: "Новые" },
    { key: "in_progress", title: "В процессе" },
    { key: "awaiting_review", title: "Ожидают проверки" },
    { key: "completed", title: "Изучено" },
  ];
  return order
    .map((section) => ({
      ...section,
      items: [...buckets[section.key]].sort(
        (a, b) =>
          new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()
      ),
    }))
    .filter((section) => section.items.length > 0);
}

export function incompleteTheoryCount(items: TheoryAssignment[]): number {
  return items.filter((a) => a.status !== "completed").length;
}

/**
 * Зелёный «!» у ученика: теория ещё не изучена.
 * Берётся из сохранённого статуса назначения, не из факта открытия страницы.
 * `viewed` / `in_progress` — открыл, но не завершил, индикатор остаётся.
 */
export function theoryNeedsStudyMark(
  item: Pick<TheoryAssignment, "status">
): boolean {
  return (
    item.status === "assigned" ||
    item.status === "viewed" ||
    item.status === "in_progress"
  );
}

export function newestIncompleteTheory(
  items: TheoryAssignment[]
): TheoryAssignment | null {
  const open = items
    .filter((a) => a.status !== "completed" && a.status !== "awaiting_review")
    .sort(
      (a, b) =>
        new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()
    );
  return open[0] ?? null;
}

export function filterTheoriesByTitle(
  items: TheoryMaterial[],
  query: string
): TheoryMaterial[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => item.title.toLowerCase().includes(q));
}

export function theoryPackageCountLabel(count: number): string {
  const n = Math.abs(Math.trunc(count));
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? "пакет"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "пакета"
        : "пакетов";
  return `${n} ${word}`;
}

export function theoryQuestionCountLabel(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  const n = Math.trunc(count);
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? "вопрос"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "вопроса"
        : "вопросов";
  return `${n} ${word}`;
}

export type StudentTheoryChip = {
  key: string;
  tone: "video" | "test" | "file";
  title: string;
  detail: string | null;
};

function theoryFileTitle(mimeType: string): string {
  if (mimeType === "application/pdf") return "PDF-конспект";
  if (mimeType === "application/msword") return "DOC-конспект";
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "DOCX-конспект";
  }
  return "Конспект";
}

/** Только реально приложенные части пакета. Длительности в модели нет. */
export function studentTheoryMaterialChips(item: {
  videoUrl?: string | null;
  hasTest: boolean;
  files: { id: string; originalName: string; mimeType: string }[];
  questionCount?: number | null;
}): StudentTheoryChip[] {
  const chips: StudentTheoryChip[] = [];
  if (item.videoUrl?.trim()) {
    chips.push({
      key: "video",
      tone: "video",
      title: "Видео",
      detail: null,
    });
  }
  if (item.hasTest) {
    chips.push({
      key: "test",
      tone: "test",
      title: "Мини-тест",
      detail: theoryQuestionCountLabel(item.questionCount ?? 0),
    });
  }
  const files = item.files ?? [];
  for (const file of files) {
    chips.push({
      key: file.id,
      tone: "file",
      title: theoryFileTitle(file.mimeType),
      detail: files.length > 1 ? file.originalName : null,
    });
  }
  return chips;
}

export function studentTheoryComponentSummary(
  item: Pick<TheoryAssignment, "videoUrl" | "files" | "hasTest" | "testPercent">
): string[] {
  const labels: string[] = [];
  if (item.videoUrl) labels.push("Видео");
  if (item.files.length === 1) labels.push("Конспект");
  else if (item.files.length > 1) {
    labels.push(`Конспектов: ${item.files.length}`);
  }
  if (item.hasTest) labels.push("Тест");
  if (item.testPercent != null) labels.push(`результат ${item.testPercent}%`);
  return labels;
}
