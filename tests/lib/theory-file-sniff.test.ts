import { describe, expect, it } from "vitest";

import { sniffTheoryFile } from "@/lib/theory/file-sniff";

describe("theory file sniff", () => {
  it("accepts pdf and rejects images", () => {
    expect(sniffTheoryFile(Buffer.from("%PDF-1.4 test"), "notes.pdf")).toBe(
      "application/pdf"
    );
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(() => sniffTheoryFile(jpeg, "photo.jpg")).toThrow(/PDF, DOC и DOCX/);
  });
});
