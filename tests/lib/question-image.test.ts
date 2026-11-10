import { describe, expect, it } from "vitest";

import { toErrorBody } from "@/server/errors";
import {
  clipboardHasImageItem,
  normalizeQuestionImageFileName,
  questionHasBody,
  QuestionImageValidationError,
  sniffQuestionImage,
} from "@/lib/tests/question-image";

function pngBytes(tag = 0) {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, tag & 0xff,
  ]);
}

function jpegBytes(tag = 0) {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, tag & 0xff]);
}

function webpBytes() {
  const buf = Buffer.alloc(16);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(8, 4);
  buf.write("WEBP", 8);
  return buf;
}

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

  it("accepts png and jpeg from picker filenames", () => {
    expect(sniffQuestionImage(pngBytes(), "pic.png")).toBe("image/png");
    expect(sniffQuestionImage(jpegBytes(), "shot.jpg")).toBe("image/jpeg");
    expect(sniffQuestionImage(jpegBytes(), "shot.jpeg")).toBe("image/jpeg");
    expect(sniffQuestionImage(webpBytes(), "a.webp")).toBe("image/webp");
  });

  it("accepts clipboard paste without a filename (magic bytes only)", () => {
    expect(sniffQuestionImage(pngBytes(1), "")).toBe("image/png");
    expect(sniffQuestionImage(pngBytes(2), "file")).toBe("image/png");
    expect(sniffQuestionImage(jpegBytes(3), "clipboard")).toBe("image/jpeg");
  });

  it("normalizes empty clipboard names using MIME hint", () => {
    expect(normalizeQuestionImageFileName("", "image/png")).toBe("clipboard.png");
    expect(normalizeQuestionImageFileName("", "image/jpeg")).toBe("clipboard.jpg");
    expect(normalizeQuestionImageFileName("file", "image/webp")).toBe("file.webp");
    expect(normalizeQuestionImageFileName("shot.png", "image/jpeg")).toBe("shot.png");
  });

  it("rejects unsupported or spoofed formats with validation errors", () => {
    const pdf = Buffer.from("%PDF-1.4");
    expect(() => sniffQuestionImage(pdf, "pic.png")).toThrow(
      QuestionImageValidationError
    );
    expect(() => sniffQuestionImage(pdf, "pic.png")).toThrow(/не является изображением/i);

    expect(() => sniffQuestionImage(pngBytes(), "pic.gif")).toThrow(
      QuestionImageValidationError
    );
    expect(() => sniffQuestionImage(pngBytes(), "pic.jpg")).toThrow(
      /расширение.*не совпадает/i
    );

    expect(() => sniffQuestionImage(Buffer.alloc(0), "a.png")).toThrow(/пустой/i);
    expect(() =>
      sniffQuestionImage(Buffer.alloc(11 * 1024 * 1024, 1), "big.png")
    ).toThrow(/10 МБ/i);
  });

  it("maps QuestionImageValidationError to 400 validation_error, not internal_error", () => {
    const mapped = toErrorBody(
      new QuestionImageValidationError("Допустимы PNG, JPG, JPEG или WEBP")
    );
    expect(mapped.status).toBe(400);
    expect(mapped.body.error.code).toBe("validation_error");
    expect(mapped.body.error.message).toMatch(/PNG/i);
    expect(mapped.body.error.message).not.toBe("Внутренняя ошибка сервера");
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
