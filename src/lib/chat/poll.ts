export type ChatPollOutcome = "ok" | "forbidden" | "transient";

export function pollDelay(open: boolean, thread: boolean, hidden: boolean) {
  if (hidden) return 45_000;
  if (thread) return 4_000;
  if (open) return 8_000;
  return 15_000;
}

export function isForbiddenStatus(err: unknown): boolean {
  if (
    err &&
    typeof err === "object" &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  ) {
    return (err as { status: number }).status === 403;
  }
  return err instanceof Error && /\bHTTP 403\b/.test(err.message);
}

export function nextForbiddenCount(
  outcome: ChatPollOutcome,
  previous: number
): number {
  return outcome === "forbidden" ? previous + 1 : 0;
}

/** After a few consecutive 403s, pause until a resume signal (visibility/open/online). */
export const CHAT_FORBIDDEN_PAUSE_AFTER = 3;

export function nextChatPollDelay(input: {
  open: boolean;
  thread: boolean;
  hidden: boolean;
  consecutiveForbidden: number;
}): number | "pause" {
  if (input.consecutiveForbidden >= CHAT_FORBIDDEN_PAUSE_AFTER) {
    return "pause";
  }
  if (input.consecutiveForbidden > 0) {
    return Math.min(2_000 * 2 ** (input.consecutiveForbidden - 1), 30_000);
  }
  return pollDelay(input.open, input.thread, input.hidden);
}
