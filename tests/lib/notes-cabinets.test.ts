import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("notes in cabinets", () => {
  it("uses one widget from the shared cabinet shell in all three cabinets", () => {
    const shell = readFileSync("src/components/layout/cabinet-shell.tsx", "utf8");
    expect(shell).toContain("NotesWidget");
    expect(shell).toContain("offsetForChat");

    for (const file of [
      "src/app/direkciya/layout.tsx",
      "src/app/kafedra/layout.tsx",
      "src/app/auditoria/layout.tsx",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("CabinetShell");
    }
  });
});
