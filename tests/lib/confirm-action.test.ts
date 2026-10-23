import { describe, expect, it } from "vitest";

import { canRunConfirmedAction } from "@/lib/confirm-action";

describe("confirm action", () => {
  it("does not run until the dialog is confirmed", () => {
    expect(canRunConfirmedAction({ open: false, busy: false })).toBe(false);
  });

  it("runs after confirmation and blocks a second in-flight click", () => {
    expect(canRunConfirmedAction({ open: true, busy: false })).toBe(true);
    expect(canRunConfirmedAction({ open: true, busy: true })).toBe(false);
  });
});
