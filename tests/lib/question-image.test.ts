import { describe, expect, it } from "vitest";

import {
  clipboardHasImageItem,
  questionHasBody,
  sniffQuestionImage,
} from "@/lib/tests/question-image";

describe("question image helpers", () => {
  it("detects text or image as question body", () => {
    expect(questionHasBody({ id: "q", type: "essay", prompt: "", maxScore: 1 })).toBe(
      false
    );
    expect(
      questionHasBody({
        id: "q",
        type: "essay",
        prompt: "  ",
        maxScore: 1,
        imageObjectKey: "questions/org/hw/q/x.png",
      })
    ).toBe(true);
    expect(
      questionHasBody({ id: "q", type: "essay", prompt: "Hi", maxScore: 1 })
    ).toBe(true);
  });

  it("accepts png magic bytes", () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);
    expect(sniffQuestionImage(png, "pic.png")).toBe("image/png");
  });

  it("rejects pdf disguised with image extension", () => {
    const pdf = Buffer.from("%PDF-1.4");
    expect(() => sniffQuestionImage(pdf, "pic.png")).toThrow();
  });

  it("clipboardHasImageItem detects images only (text paste stays normal)", () => {
    expect(clipboardHasImageItem(null)).toBe(false);
    expect(
      clipboardHasImageItem({
        length: 1,
        0: { type: "text/plain" },
      })
    ).toBe(false);
    expect(
      clipboardHasImageItem({
        length: 2,
        0: { type: "text/html" },
        1: { type: "text/plain" },
      })
    ).toBe(false);
    expect(
      clipboardHasImageItem({
        length: 2,
        0: { type: "text/plain" },
        1: { type: "image/png" },
      })
    ).toBe(true);
    expect(
      clipboardHasImageItem({
        length: 1,
        0: { type: "image/jpeg" },
      })
    ).toBe(true);
  });
});
