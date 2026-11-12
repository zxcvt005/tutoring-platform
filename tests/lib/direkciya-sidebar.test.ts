import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readDirekciyaSidebarCollapsed,
  writeDirekciyaSidebarCollapsed,
} from "@/lib/direkciya-sidebar";

describe("direkciya sidebar persistence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to expanded when storage is empty", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
      },
    });
    expect(readDirekciyaSidebarCollapsed()).toBe(false);
    writeDirekciyaSidebarCollapsed(true);
    expect(readDirekciyaSidebarCollapsed()).toBe(true);
    writeDirekciyaSidebarCollapsed(false);
    expect(readDirekciyaSidebarCollapsed()).toBe(false);
  });
});
