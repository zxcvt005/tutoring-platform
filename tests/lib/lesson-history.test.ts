import { describe, expect, it } from "vitest";

import {
  assignmentsForLesson,
  historyLessonsNewestFirst,
  historyStripeTone,
  lessonHistoryStatusLabel,
  topicTextForLesson,
} from "@/lib/lesson-history";
import type { HomeworkAssignment, Lesson, Topic } from "@/lib/types";

describe("lesson history helpers", () => {
  const lessons: Lesson[] = [
    {
      id: "old",
      teacherId: "t1",
      studentIds: ["s1"],
      startsAt: "2026-09-01T14:00:00.000Z",
      endsAt: "2026-09-01T15:00:00.000Z",
      status: "done",
      topicId: "topic_a",
    },
    {
      id: "new",
      teacherId: "t1",
      studentIds: ["s1"],
      startsAt: "2026-10-20T14:00:00.000Z",
      endsAt: "2026-10-20T15:00:00.000Z",
      status: "planned",
    },
    {
      id: "other",
      teacherId: "t1",
      studentIds: ["s2"],
      startsAt: "2026-10-21T14:00:00.000Z",
      endsAt: "2026-10-21T15:00:00.000Z",
      status: "done",
    },
    {
      id: "future",
      teacherId: "t1",
      studentIds: ["s1"],
      startsAt: "2026-11-01T14:00:00.000Z",
      endsAt: "2026-11-01T15:00:00.000Z",
      status: "planned",
    },
    {
      id: "cancelled-past",
      teacherId: "t1",
      studentIds: ["s1"],
      startsAt: "2026-10-10T14:00:00.000Z",
      endsAt: "2026-10-10T15:00:00.000Z",
      status: "cancelled",
    },
  ];

  const now = new Date("2026-10-21T12:00:00.000Z");

  it("lists only past lessons of the current student newest first", () => {
    const list = historyLessonsNewestFirst(lessons, "s1", now);
    expect(list.map((l) => l.id)).toEqual(["new", "cancelled-past", "old"]);
    expect(list.some((l) => l.id === "future")).toBe(false);
  });

  it("binds homework to the source lesson only", () => {
    const hw = [
      { id: "h1", lessonId: "old", studentId: "s1" },
      { id: "h2", lessonId: "new", studentId: "s1" },
      { id: "h3", lessonId: "old", studentId: "s2" },
    ] as HomeworkAssignment[];
    expect(assignmentsForLesson(hw, "old", "s1").map((a) => a.id)).toEqual([
      "h1",
    ]);
  });

  it("does not call a future unmarked lesson skipped", () => {
    const label = lessonHistoryStatusLabel(lessons[1]!, undefined);
    expect(label).toBe("Ожидает отметки");
  });

  it("separates teacher cancellation from absence", () => {
    const cancelled: Lesson = { ...lessons[0]!, status: "cancelled" };
    expect(lessonHistoryStatusLabel(cancelled, undefined)).toBe(
      "Отменено преподавателем"
    );
    expect(
      lessonHistoryStatusLabel(lessons[0]!, {
        lessonId: "old",
        studentId: "s1",
        status: "absent_unexcused",
      })
    ).toBe("Не был — неуважительная причина");
  });

  it("maps history stripe colors by attendance with cancel priority", () => {
    const base = lessons[0]!;
    expect(historyStripeTone(base, { status: "present" })).toBe("present");
    expect(
      historyStripeTone(base, { status: "absent_unexcused" })
    ).toBe("absent_unexcused");
    expect(historyStripeTone(base, { status: "absent_excused" })).toBe(
      "absent_excused"
    );
    expect(
      historyStripeTone(
        { ...base, status: "cancelled" },
        { status: "absent_unexcused" }
      )
    ).toBe("cancelled");
    expect(historyStripeTone({ ...base, status: "planned" }, null)).toBe(
      "neutral"
    );
  });

  it("uses catalog description when present and falls back to subject", () => {
    const topics: Topic[] = [
      {
        id: "topic_a",
        teacherId: "t1",
        sectionId: "sec",
        title: "Кинематика",
        subject: "Физика",
        description: "Связь перемещения и ускорения.",
        status: "active",
        sortOrder: 0,
      },
    ];
    expect(topicTextForLesson(lessons[0]!, topics).description).toContain(
      "перемещения"
    );
    expect(topicTextForLesson(lessons[1]!, topics).title).toBe("Тема не указана");
  });

  it("joins several lesson topics and keeps homework of that student only", () => {
    const lesson: Lesson = {
      ...lessons[0]!,
      lessonTopics: [
        { id: "lt1", topicId: "topic_a", title: "Кинематика", sortOrder: 0 },
        { id: "lt2", topicId: null, title: "Разбор ошибок", sortOrder: 1 },
      ],
    };
    const topics: Topic[] = [
      {
        id: "topic_a",
        teacherId: "t1",
        sectionId: "sec",
        title: "Кинематика",
        subject: "Физика",
        description: "Описание",
        status: "active",
        sortOrder: 0,
      },
    ];
    expect(topicTextForLesson(lesson, topics).title).toBe(
      "Кинематика · Разбор ошибок"
    );
    const hw = [
      { id: "h1", lessonId: "old", studentId: "s1" },
      { id: "h2", lessonId: "old", studentId: "s1" },
      { id: "h3", lessonId: "old", studentId: "s2" },
    ] as HomeworkAssignment[];
    expect(assignmentsForLesson(hw, "old", "s1").map((a) => a.id)).toEqual([
      "h1",
      "h2",
    ]);
  });
});
