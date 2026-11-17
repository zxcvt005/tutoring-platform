import { describe, expect, it, vi } from "vitest";

import { createCoalescedAsync } from "@/lib/store/coalesce-async";

describe("createCoalescedAsync", () => {
  it("collapses rapid calls into one execution", async () => {
    vi.useFakeTimers();
    const fn = vi.fn(async () => {
      await Promise.resolve();
      return "ok";
    });
    const schedule = createCoalescedAsync(fn, 50);

    const p1 = schedule();
    const p2 = schedule();
    const p3 = schedule();

    await vi.advanceTimersByTimeAsync(60);
    await expect(Promise.all([p1, p2, p3])).resolves.toEqual(["ok", "ok", "ok"]);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("runs again if a call arrives during the in-flight execution", async () => {
    vi.useFakeTimers();
    let resolveCurrent: (() => void) | undefined;
    const fn = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveCurrent = () => resolve(fn.mock.calls.length);
        })
    );
    const schedule = createCoalescedAsync(fn, 20);

    const first = schedule();
    await vi.advanceTimersByTimeAsync(25);
    expect(fn).toHaveBeenCalledTimes(1);

    const second = schedule();
    resolveCurrent?.();
    await first;

    await vi.advanceTimersByTimeAsync(0);
    resolveCurrent?.();
    await expect(second).resolves.toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
