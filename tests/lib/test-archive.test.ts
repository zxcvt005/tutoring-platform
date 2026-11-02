import { describe, expect, it } from "vitest";

import {
  restoredTestStatus,
  testArchiveButtonLabel,
} from "@/lib/tests/archive";

describe("test archive toggle", () => {
  it("shows restore after archive and archive after restore", () => {
    expect(testArchiveButtonLabel("published")).toBe("В архив");
    expect(testArchiveButtonLabel("draft")).toBe("В архив");
    expect(testArchiveButtonLabel("archived")).toBe("Достать из архива");
  });

  it("restores a complete test as published and an incomplete one as draft", () => {
    expect(
      restoredTestStatus([{ prompt: "2+2" }, { prompt: "3+3" }])
    ).toBe("published");
    expect(restoredTestStatus([])).toBe("draft");
    expect(restoredTestStatus([{ prompt: "  " }])).toBe("draft");
  });
});
