import type { HomeworkTemplateStatus, TestQuestion } from "@/lib/types";

export function testArchiveButtonLabel(
  status: HomeworkTemplateStatus | string
): "В архив" | "Достать из архива" {
  return status === "archived" ? "Достать из архива" : "В архив";
}

export function isArchivedTest(status: HomeworkTemplateStatus | string) {
  return status === "archived";
}

/** Статус после извлечения из архива: публикуем, только если тест готов. */
export function restoredTestStatus(
  questions: Pick<TestQuestion, "prompt">[] | unknown[]
): Exclude<HomeworkTemplateStatus, "archived"> {
  const list = questions as { prompt?: string }[];
  if (!list.length) return "draft";
  if (list.some((q) => !q.prompt?.trim())) return "draft";
  return "published";
}
