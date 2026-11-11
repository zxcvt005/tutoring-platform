import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("site icons from public/logo.png", () => {
  it("keeps the source logo and generated favicon/apple icons on disk", () => {
    expect(existsSync("public/logo.png")).toBe(true);
    expect(existsSync("public/favicon.ico")).toBe(true);
    expect(existsSync("public/apple-touch-icon.png")).toBe(true);
    expect(existsSync("public/icon-32.png")).toBe(true);
    expect(existsSync("src/app/favicon.ico")).toBe(true);
    expect(existsSync("src/app/icon.png")).toBe(true);
    expect(existsSync("src/app/apple-icon.png")).toBe(true);
  });

  it("does not leave the default Next.js favicon bytes", () => {
    const fav = readFileSync("src/app/favicon.ico");
    // Generated multi-size PNG ICO is larger than the tiny default and starts with ICONDIR
    expect(fav.length).toBeGreaterThan(1000);
    expect(fav.readUInt16LE(0)).toBe(0);
    expect(fav.readUInt16LE(2)).toBe(1);
  });
});
