import { describe, expect, it } from "vitest";

import { normalizeOptionalDescription } from "@/lib/tests/optional-description";

describe("optional homework description", () => {
  it("turns empty and blank text into null", () => {
    expect(normalizeOptionalDescription("")).toBeNull();
    expect(normalizeOptionalDescription("   ")).toBeNull();
    expect(normalizeOptionalDescription(null)).toBeNull();
    expect(normalizeOptionalDescription(undefined)).toBeNull();
  });

  it("keeps a real description", () => {
    expect(normalizeOptionalDescription("  Про производную  ")).toBe(
      "Про производную"
    );
  });
});
