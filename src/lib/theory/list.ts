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
    { key: "completed", title: "Завершённые" },
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
