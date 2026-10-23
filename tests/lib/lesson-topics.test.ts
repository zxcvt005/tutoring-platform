import { describe, expect, it } from "vitest";

import { topicsForLesson } from "@/lib/lesson-topics";
import type { Lesson, Topic } from "@/lib/types";

const catalog: Topic[] = [
  {
    id: "tp1",
    teacherId: "t1",
    sectionId: "sec1",
    title: "Кинематика",
    subject: "Физика",
    description: "Равномерное движение",
    status: "active",
    sortOrder: 0,
  },
  {
    id: "tp2",
    teacherId: "t1",
    sectionId: "sec1",
    title: "Динамика",
    subject: "Физика",
    description: "Законы Ньютона",
    status: "active",
    sortOrder: 1,
  },
];

describe("topicsForLesson", () => {
  it("returns catalog titles and descriptions for linked topics", () => {
    const lesson: Lesson = {
      id: "l1",
      teacherId: "t1",
      studentIds: ["s1"],
      startsAt: "2026-10-22T14:00:00.000Z",
      endsAt: "2026-10-22T15:00:00.000Z",
      status: "done",
      topicId: "tp1",
      lessonTopics: [
        { id: "lt1", topicId: "tp1", title: "Кинематика", sortOrder: 0 },
        { id: "lt2", topicId: "tp2", title: "Динамика", sortOrder: 1 },
      ],
    };
    const list = topicsForLesson(lesson, catalog);
    expect(list.map((t) => t.title)).toEqual(["Кинематика", "Динамика"]);
    expect(list[0]?.description).toBe("Равномерное движение");
    expect(list[1]?.description).toBe("Законы Ньютона");
  });

  it("keeps free-text topics without inventing a catalog row", () => {
    const lesson: Lesson = {
      id: "l2",
      teacherId: "t1",
      studentIds: ["s1"],
      startsAt: "2026-10-22T14:00:00.000Z",
      endsAt: "2026-10-22T15:00:00.000Z",
      status: "planned",
      subject: "Разбор ошибок",
      lessonTopics: [
        { id: "lt3", topicId: null, title: "Разбор ошибок", sortOrder: 0 },
      ],
    };
    const list = topicsForLesson(lesson, catalog);
    expect(list).toEqual([
      { topicId: null, title: "Разбор ошибок", description: undefined },
    ]);
  });
});
