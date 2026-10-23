import { describe, expect, it } from "vitest";

import { CHAT_MAX_FILE_BYTES } from "@/lib/chat/constants";
import { sniffChatFile } from "@/lib/chat/file-sniff";

function jpeg() {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
}

describe("chat file sniff", () => {
  it("accepts jpeg/png/pdf by magic bytes", () => {
    expect(sniffChatFile(jpeg(), "photo.jpg")).toBe("image/jpeg");
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(16, 1),
    ]);
    expect(sniffChatFile(png, "a.png")).toBe("image/png");
    expect(sniffChatFile(Buffer.from("%PDF-1.4 test"), "doc.pdf")).toBe(
      "application/pdf"
    );
  });

  it("rejects unsupported types and mismatched extensions", () => {
    expect(() => sniffChatFile(Buffer.from("MZ executable"), "run.exe")).toThrow(
      /Неподдерживаемый/
    );
    expect(() => sniffChatFile(jpeg(), "photo.pdf")).toThrow(/не совпадает/);
  });

  it("rejects oversized files", () => {
    const huge = Buffer.alloc(CHAT_MAX_FILE_BYTES + 1, 0xff);
    huge[0] = 0xff;
    huge[1] = 0xd8;
    huge[2] = 0xff;
    expect(() => sniffChatFile(huge, "big.jpg")).toThrow(/20 МБ/);
  });
});
