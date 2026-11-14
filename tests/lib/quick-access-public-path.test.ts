import { describe, expect, it } from "vitest";

import { CABINET_PREFIXES } from "@/lib/auth/roles";
import {
  demoSessionBootKey,
  isDemoPublicPath,
} from "@/lib/store/demo-session";

describe("quick access public path (no cabinet login)", () => {
  const routes = [
    "/quick-access/baza/tok",
    "/quick-access/rnp-avito/tok",
    "/quick-access/probnye-uroki/tok",
    "/quick-access/rashody/tok",
  ];

  it("treats secret table links as public so DemoStore does not redirect to /login", () => {
    for (const path of routes) {
      expect(isDemoPublicPath(path)).toBe(true);
      expect(demoSessionBootKey(path)).toBe("public");
    }
  });

  it("keeps Directorate management and other cabinets behind session boot", () => {
    expect(isDemoPublicPath("/direkciya/quick-access")).toBe(false);
    expect(demoSessionBootKey("/direkciya/quick-access")).toBe("director");
    expect(demoSessionBootKey("/direkciya/baza")).toBe("director");
    expect(CABINET_PREFIXES).not.toContain("/quick-access");
    expect(
      CABINET_PREFIXES.some(
        (p) => p === "/quick-access" || "/quick-access".startsWith(`${p}/`)
      )
    ).toBe(false);
  });
});
