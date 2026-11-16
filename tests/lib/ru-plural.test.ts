import { describe, expect, it } from "vitest";

import { lessonsCountLabel, pluralRu } from "@/lib/ru-plural";

describe("pluralRu / lessonsCountLabel", () => {
  it("declines занятие for typical counts", () => {
    expect(lessonsCountLabel(1)).toBe("1 занятие");
    expect(lessonsCountLabel(2)).toBe("2 занятия");
    expect(lessonsCountLabel(3)).toBe("3 занятия");
    expect(lessonsCountLabel(4)).toBe("4 занятия");
    expect(lessonsCountLabel(5)).toBe("5 занятий");
    expect(lessonsCountLabel(11)).toBe("11 занятий");
    expect(lessonsCountLabel(12)).toBe("12 занятий");
    expect(lessonsCountLabel(21)).toBe("21 занятие");
    expect(lessonsCountLabel(22)).toBe("22 занятия");
    expect(lessonsCountLabel(25)).toBe("25 занятий");
    expect(lessonsCountLabel(101)).toBe("101 занятие");
    expect(lessonsCountLabel(0)).toBe("0 занятий");
  });

  it("supports other words via pluralRu", () => {
    expect(pluralRu(1, "день", "дня", "дней")).toBe("день");
    expect(pluralRu(2, "день", "дня", "дней")).toBe("дня");
    expect(pluralRu(5, "день", "дня", "дней")).toBe("дней");
  });
});
