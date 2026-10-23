import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("chat message delete confirmation", () => {
  it("asks before deleting and does not use window.confirm", () => {
    const src = readFileSync("src/components/chat/chat-widget.tsx", "utf8");
    expect(src).toContain("ConfirmDialog");
    expect(src).toContain("Удалить сообщение?");
    expect(src).toContain("Вы действительно хотите удалить это сообщение?");
    expect(src).toContain("canRunConfirmedAction");
    expect(src).not.toContain("window.confirm");
  });
});
