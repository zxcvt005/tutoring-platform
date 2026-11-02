import { describe, expect, it } from "vitest";

import {
  THEORY_ALLOWS_CATALOG_TEST_PICK,
  attachedTheoryTest,
} from "@/lib/theory/editor";
import type { Homework } from "@/lib/types";

function hw(partial: Partial<Homework> & { id: string; title: string }): Homework {
  return {
    teacherId: "t1",
    status: "published",
    questions: [],
    ...partial,
  };
}

describe("theory editor test attachment", () => {
  it("does not offer a catalog of existing tests", () => {
    expect(THEORY_ALLOWS_CATALOG_TEST_PICK).toBe(false);
  });

  it("returns only the test already attached to the theory", () => {
    const catalog = hw({ id: "hw_catalog", title: "Каталог ДЗ" });
    const own = hw({
      id: "hw_theory",
      title: "Тест теории",
      purpose: "theory",
    });
    expect(attachedTheoryTest([catalog, own], "hw_theory")?.id).toBe("hw_theory");
    expect(attachedTheoryTest([catalog, own], "")).toBeUndefined();
    expect(attachedTheoryTest([catalog, own], null)).toBeUndefined();
    expect(attachedTheoryTest([catalog], "hw_missing")).toBeUndefined();
  });
});
