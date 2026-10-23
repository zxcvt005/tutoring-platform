import { describe, expect, it } from "vitest";

import {
  draftTopicsFromSaved,
  isDuplicateTopic,
  normalizeDraftTopics,
  type DraftLessonTopic,
} from "@/lib/lesson-topics-draft";

describe("progressive lesson topics draft", () => {
  it("starts with one empty field when nothing is saved", () => {
    const draft = draftTopicsFromSaved([]);
    expect(draft).toHaveLength(1);
    expect(draft[0]!.title).toBe("");
  });

  it("shows all saved topics when reopening", () => {
    const draft = draftTopicsFromSaved([
      { topicId: "t1", title: "Кинематика" },
      { topicId: null, title: "Разбор ошибок" },
    ]);
    expect(draft.map((d) => d.title)).toEqual([
      "Кинематика",
      "Разбор ошибок",
    ]);
  });

  it("detects duplicate titles and topic ids", () => {
    const topics: DraftLessonTopic[] = [
      { key: "a", topicId: "t1", title: "Кинематика" },
      { key: "b", topicId: null, title: "" },
    ];
    expect(isDuplicateTopic(topics, 1, "кинематика", null)).toBe(true);
    expect(isDuplicateTopic(topics, 1, "Другое", "t1")).toBe(true);
    expect(isDuplicateTopic(topics, 1, "Другое", null)).toBe(false);
  });

  it("normalizes by dropping empties and duplicates without inventing catalog ids", () => {
    const out = normalizeDraftTopics([
      { key: "1", topicId: null, title: "  " },
      { key: "2", topicId: "t1", title: "Кинематика" },
      { key: "3", topicId: null, title: "кинематика" },
      { key: "4", topicId: null, title: "Свободный текст" },
    ]);
    expect(out).toEqual([
      { topicId: "t1", title: "Кинематика" },
      { topicId: null, title: "Свободный текст" },
    ]);
  });

  it("keeps earlier fields when an empty one is appended", () => {
    const base = draftTopicsFromSaved([{ topicId: null, title: "Тема A" }]);
    const withExtra = [
      ...base,
      { key: "extra", topicId: null, title: "" },
    ];
    expect(withExtra[0]!.title).toBe("Тема A");
    expect(normalizeDraftTopics(withExtra)).toEqual([
      { topicId: null, title: "Тема A" },
    ]);
  });
});
