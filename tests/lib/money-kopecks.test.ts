import { describe, expect, it } from "vitest";

import {
  formatKopecksRu,
  kopecksToRubInput,
  parseRubStringToKopecks,
} from "@/lib/money-kopecks";

describe("money-kopecks", () => {
  it("parses ruble strings without floating point", () => {
    expect(parseRubStringToKopecks("1200")).toBe(120_000);
    expect(parseRubStringToKopecks("1 200")).toBe(120_000);
    expect(parseRubStringToKopecks("1200,50")).toBe(120_050);
    expect(parseRubStringToKopecks("0.01")).toBe(1);
  });

  it("formats kopecks back to input and display", () => {
    expect(kopecksToRubInput(120_000)).toBe("1200");
    expect(kopecksToRubInput(120_050)).toBe("1200.50");
    expect(formatKopecksRu(160_000).replace(/\s/g, "")).toBe("1600₽");
    expect(formatKopecksRu(-40_000)).toContain("400");
  });

  it("rejects invalid amounts", () => {
    expect(() => parseRubStringToKopecks("")).toThrow();
    expect(() => parseRubStringToKopecks("12.345")).toThrow();
    expect(() => parseRubStringToKopecks("abc")).toThrow();
  });
});
