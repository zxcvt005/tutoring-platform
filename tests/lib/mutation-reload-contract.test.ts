import { describe, expect, it, vi } from "vitest";

import { createCoalescedAsync } from "@/lib/store/coalesce-async";

/**
 * Контракт demo-store.run: бизнес-вызов всегда выполняется отдельно,
 * coalescing касается только последующего обновления UI (bootstrap).
 */
async function runLikeStore(input: {
  mutate: () => Promise<{ id: string }>;
  reload: () => Promise<string>;
  reloadMode: "coalesce" | "skip";
}) {
  const result = await input.mutate();
  if (input.reloadMode !== "skip") {
    await input.reload();
  }
  return result;
}

describe("mutation vs bootstrap coalescing contract", () => {
  it("does not coalesce business mutations — each mutate() runs", async () => {
    vi.useFakeTimers();
    const mutate = vi.fn(async (id: string) => ({ id }));
    const reloadImmediate = vi.fn(async () => "boot");
    const reload = createCoalescedAsync(reloadImmediate, 40);

    const p1 = runLikeStore({
      mutate: () => mutate("a"),
      reload,
      reloadMode: "coalesce",
    });
    const p2 = runLikeStore({
      mutate: () => mutate("b"),
      reload,
      reloadMode: "coalesce",
    });

    // Mutations resolve immediately; reload waits on coalesce delay.
    await vi.advanceTimersByTimeAsync(50);
    await expect(Promise.all([p1, p2])).resolves.toEqual([
      { id: "a" },
      { id: "b" },
    ]);
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(reloadImmediate).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("runs a follow-up bootstrap so later sequential actions are not lost", async () => {
    vi.useFakeTimers();
    const snapshots: string[] = [];
    let serverState = "";

    const reloadImmediate = vi.fn(async () => {
      snapshots.push(serverState);
      return serverState;
    });
    const reload = createCoalescedAsync(reloadImmediate, 30);

    serverState = "A";
    const first = runLikeStore({
      mutate: async () => {
        serverState = "A";
        return { id: "A" };
      },
      reload,
      reloadMode: "coalesce",
    });

    await vi.advanceTimersByTimeAsync(35);
    await Promise.resolve();

    serverState = "A+B";
    const second = runLikeStore({
      mutate: async () => {
        serverState = "A+B";
        return { id: "B" };
      },
      reload,
      reloadMode: "coalesce",
    });

    // Flush any remaining coalesce timer / follow-up pass.
    await vi.advanceTimersByTimeAsync(50);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(50);

    await expect(first).resolves.toEqual({ id: "A" });
    await expect(second).resolves.toEqual({ id: "B" });
    expect(snapshots.at(-1)).toBe("A+B");
    expect(reloadImmediate.mock.calls.length).toBeGreaterThanOrEqual(1);
    vi.useRealTimers();
  });

  it("skips bootstrap entirely for homework draft autosave mode", async () => {
    const mutate = vi.fn(async () => ({ id: "draft" }));
    const reload = vi.fn(async () => "boot");

    await runLikeStore({
      mutate,
      reload,
      reloadMode: "skip",
    });

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });
});
