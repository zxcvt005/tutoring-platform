import { describe, expect, it } from "vitest";

import {
  loadStudentCheckoutPrefs,
  resolveCheckoutDirectionId,
  resolveCheckoutSelection,
  saveStudentCheckoutPrefs,
} from "@/lib/payment-checkout-prefs";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

describe("resolveCheckoutSelection", () => {
  const tariffs = [
    {
      id: "t1",
      purchaseOptions: [
        { id: "o1", isActive: true, sortOrder: 1 },
        { id: "o2", isActive: true, sortOrder: 2 },
        { id: "o3", isActive: false, sortOrder: 0 },
      ],
    },
    {
      id: "t2",
      purchaseOptions: [{ id: "o4", isActive: true, sortOrder: 0 }],
    },
  ];

  it("restores preferred tariff and option when still purchasable", () => {
    expect(
      resolveCheckoutSelection({
        tariffs,
        preferred: { tariffId: "t1", optionId: "o2" },
      })
    ).toEqual({ tariffId: "t1", optionId: "o2" });
  });

  it("falls back to first active option if preferred option is inactive", () => {
    expect(
      resolveCheckoutSelection({
        tariffs,
        preferred: { tariffId: "t1", optionId: "o3" },
      })
    ).toEqual({ tariffId: "t1", optionId: "o1" });
  });

  it("falls back to first purchasable tariff if preferred tariff is gone", () => {
    expect(
      resolveCheckoutSelection({
        tariffs,
        preferred: { tariffId: "missing", optionId: "o9" },
      })
    ).toEqual({ tariffId: "t1", optionId: "o1" });
  });

  it("ignores tariffs without active options", () => {
    expect(
      resolveCheckoutSelection({
        tariffs: [
          {
            id: "dead",
            purchaseOptions: [{ id: "x", isActive: false, sortOrder: 0 }],
          },
        ],
        preferred: { tariffId: "dead", optionId: "x" },
      })
    ).toBeNull();
  });
});

describe("student checkout prefs storage", () => {
  it("keeps prefs per student id", () => {
    const storage = memoryStorage();
    saveStudentCheckoutPrefs(
      "s1",
      {
        lastDirectionId: "d1",
        byDirection: { d1: { tariffId: "t1", optionId: "o1" } },
      },
      storage
    );
    saveStudentCheckoutPrefs(
      "s2",
      {
        lastDirectionId: "d2",
        byDirection: { d2: { tariffId: "t9", optionId: "o9" } },
      },
      storage
    );

    expect(loadStudentCheckoutPrefs("s1", storage).byDirection.d1).toEqual({
      tariffId: "t1",
      optionId: "o1",
    });
    expect(loadStudentCheckoutPrefs("s2", storage).lastDirectionId).toBe("d2");
    expect(loadStudentCheckoutPrefs("s3", storage).byDirection).toEqual({});
  });

  it("resolves last direction only if still active", () => {
    expect(resolveCheckoutDirectionId(["d1", "d2"], "d2")).toBe("d2");
    expect(resolveCheckoutDirectionId(["d1", "d2"], "archived")).toBe("d1");
    expect(resolveCheckoutDirectionId([], "d1")).toBe("");
  });
});
