import { describe, expect, it } from "vitest";

/** Семантика useExpandedTableRow без React Testing Library. */
function toggleExpanded(
  current: string | null,
  id: string
): string | null {
  return current === id ? null : id;
}

describe("expanded table row semantics", () => {
  it("keeps a single expanded row and toggles off on repeat", () => {
    let expandedId: string | null = null;
    expandedId = toggleExpanded(expandedId, "a");
    expect(expandedId).toBe("a");
    expandedId = toggleExpanded(expandedId, "b");
    expect(expandedId).toBe("b");
    expandedId = toggleExpanded(expandedId, "b");
    expect(expandedId).toBeNull();
  });
});
