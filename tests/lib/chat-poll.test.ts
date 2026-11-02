import { describe, expect, it } from "vitest";

import { HttpStatusError } from "@/lib/store/api-client";
import {
  CHAT_FORBIDDEN_PAUSE_AFTER,
  isForbiddenStatus,
  nextChatPollDelay,
  nextForbiddenCount,
  pollDelay,
} from "@/lib/chat/poll";

describe("chat poll backoff", () => {
  it("keeps the normal interval after a successful summary", () => {
    expect(pollDelay(false, false, false)).toBe(15_000);
    expect(pollDelay(true, false, false)).toBe(8_000);
    expect(pollDelay(true, true, false)).toBe(4_000);
    expect(
      nextChatPollDelay({
        open: false,
        thread: false,
        hidden: false,
        consecutiveForbidden: 0,
      })
    ).toBe(15_000);
  });

  it("backs off on 403 and pauses after a streak", () => {
    expect(nextForbiddenCount("forbidden", 0)).toBe(1);
    expect(nextForbiddenCount("forbidden", 1)).toBe(2);
    expect(nextForbiddenCount("ok", 2)).toBe(0);
    expect(nextForbiddenCount("transient", 2)).toBe(0);

    expect(
      nextChatPollDelay({
        open: false,
        thread: false,
        hidden: false,
        consecutiveForbidden: 1,
      })
    ).toBe(2_000);
    expect(
      nextChatPollDelay({
        open: false,
        thread: false,
        hidden: false,
        consecutiveForbidden: 2,
      })
    ).toBe(4_000);
    expect(
      nextChatPollDelay({
        open: false,
        thread: false,
        hidden: false,
        consecutiveForbidden: CHAT_FORBIDDEN_PAUSE_AFTER,
      })
    ).toBe("pause");
  });

  it("treats HttpStatusError 403 as forbidden and other errors as not", () => {
    expect(isForbiddenStatus(new HttpStatusError(403, "Недостаточно прав"))).toBe(
      true
    );
    expect(isForbiddenStatus(new HttpStatusError(500, "HTTP 500"))).toBe(false);
    expect(isForbiddenStatus(new Error("Нет сети"))).toBe(false);
    expect(isForbiddenStatus(new Error("HTTP 403"))).toBe(true);
  });

  it("resumes normal polling after a successful response clears the streak", () => {
    const afterOk = nextForbiddenCount("ok", 2);
    expect(
      nextChatPollDelay({
        open: true,
        thread: false,
        hidden: false,
        consecutiveForbidden: afterOk,
      })
    ).toBe(8_000);
  });
});
