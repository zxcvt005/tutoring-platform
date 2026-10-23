import type { Lesson, LessonTopicLink, Topic } from "@/lib/types";

export type LessonTopicView = {
  topicId?: string | null;
  title: string;
  description?: string;
};

export function topicsForLesson(
  lesson: Pick<Lesson, "topicId" | "subject" | "lessonTopics">,
  catalog: Topic[]
): LessonTopicView[] {
  if (lesson.lessonTopics && lesson.lessonTopics.length > 0) {
    return [...lesson.lessonTopics]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((lt) => {
        const cat = lt.topicId
          ? catalog.find((t) => t.id === lt.topicId)
          : undefined;
        return {
          topicId: lt.topicId ?? null,
          title: cat?.title?.trim() || lt.title.trim() || "Тема",
          description: cat?.description?.trim() || undefined,
        };
      });
  }
  const cat = lesson.topicId
    ? catalog.find((t) => t.id === lesson.topicId)
    : undefined;
  const title = cat?.title?.trim() || lesson.subject?.trim();
  if (!title) return [];
  return [
    {
      topicId: lesson.topicId ?? null,
      title,
      description: cat?.description?.trim() || undefined,
    },
  ];
}

export function firstCatalogTopicId(topics: LessonTopicLink[]): string | undefined {
  return topics.find((t) => t.topicId)?.topicId ?? undefined;
}
