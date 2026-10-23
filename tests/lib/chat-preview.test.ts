import { describe, expect, it } from "vitest";

import { isFullySentMessage, mergeChatMessages } from "@/lib/chat/preview";
import type { ChatMessageView } from "@/lib/chat/types";

function msg(id: string, createdAt: string): ChatMessageView {
  return {
    id,
    chatId: "c1",
    type: "user_message",
    authorUserId: "u1",
    body: id,
    createdAt,
    editedAt: null,
    deleted: false,
    eventType: null,
    eventPayload: null,
    attachments: [],
    clientRequestId: id,
    canEdit: false,
    canDelete: false,
    mine: false,
  };
}

describe("chat client helpers", () => {
  it("merges polled messages without duplicates", () => {
    const a = msg("a", "2026-01-01T10:00:00.000Z");
    const b = msg("b", "2026-01-01T10:01:00.000Z");
    const c = msg("c", "2026-01-01T10:02:00.000Z");
    const merged = mergeChatMessages([a, b], [b, c]);
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("does not treat a send as complete when attachments failed", () => {
    expect(
      isFullySentMessage({
        incomplete: true,
        attachmentErrors: [{ name: "a.jpg", error: "fail" }],
      })
    ).toBe(false);
    expect(isFullySentMessage({ incomplete: false, attachmentErrors: [] })).toBe(
      true
    );
  });
});
