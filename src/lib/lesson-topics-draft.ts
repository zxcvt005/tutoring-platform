export type DraftLessonTopic = {
  key: string;
  topicId?: string | null;
  title: string;
};

export function newDraftTopicKey(): string {
  return `dt_${Math.random().toString(36).slice(2, 9)}`;
}

export function draftTopicsFromSaved(
  saved: { topicId?: string | null; title: string }[]
): DraftLessonTopic[] {
  if (saved.length === 0) {
    return [{ key: newDraftTopicKey(), topicId: null, title: "" }];
  }
  return saved.map((t) => ({
    key: newDraftTopicKey(),
    topicId: t.topicId ?? null,
    title: t.title,
  }));
}

export function isDuplicateTopic(
  topics: DraftLessonTopic[],
  index: number,
  title: string,
  topicId: string | null
): boolean {
  const trimmed = title.trim().toLowerCase();
  if (!trimmed && !topicId) return false;
  return topics.some((t, i) => {
    if (i === index) return false;
    if (topicId && t.topicId && t.topicId === topicId) return true;
    return Boolean(trimmed) && t.title.trim().toLowerCase() === trimmed;
  });
}

/** Пустые строки отбрасываем; дубликаты не проходят. */
export function normalizeDraftTopics(
  topics: DraftLessonTopic[]
): { topicId?: string | null; title: string }[] {
  const out: { topicId?: string | null; title: string }[] = [];
  for (const t of topics) {
    const title = t.title.trim();
    if (!title) continue;
    const topicId = t.topicId ?? null;
    if (
      out.some(
        (x) =>
          (topicId && x.topicId === topicId) ||
          x.title.toLowerCase() === title.toLowerCase()
      )
    ) {
      continue;
    }
    out.push({ topicId, title });
  }
  return out;
}

export function canAddAnotherTopic(topics: DraftLessonTopic[]): boolean {
  return topics.length < 20;
}
