import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  cabinetAsideClassName,
  cabinetAsidePanelClassName,
  cabinetMobileSheetClassName,
  showSidebarCabinetChrome,
} from "@/lib/cabinet-shell-classes";

describe("cabinet sidebar chrome", () => {
  it("keeps the Auditoria outer slot transparent and inset from the viewport", () => {
    const auditoria = cabinetAsideClassName("auditoria");
    expect(auditoria).toContain("bg-transparent");
    expect(auditoria).toContain("p-3");
    expect(auditoria).toContain("self-start");
    expect(auditoria).not.toContain("bg-sidebar");
    expect(auditoria).not.toContain("border-r");
    expect(auditoria).not.toContain("rounded-3xl");

    const panel = cabinetAsidePanelClassName("auditoria");
    expect(panel).toContain("rounded-3xl");
    expect(panel).toContain("bg-auditoria-surface");
    expect(panel).toContain("w-56");
    expect(panel).toContain("overflow-hidden");
  });

  it("does not change Direkciya, Kafedra or Pressa sidebar chrome", () => {
    expect(cabinetAsidePanelClassName("kafedra")).toBeUndefined();

    for (const role of ["direkciya", "kafedra", "pressa"] as const) {
      const cls = cabinetAsideClassName(role);
      expect(cls).toContain("h-svh");
      expect(cls).toContain("border-r");
      expect(cls).toContain("bg-sidebar");
      expect(cls).not.toContain("rounded-3xl");
      expect(cls).not.toContain("bg-transparent");
      expect(cls).not.toContain("p-3");
    }
  });

  it("hides the cabinet title card and role switcher only in Auditoria", () => {
    expect(showSidebarCabinetChrome("auditoria")).toBe(false);
    expect(showSidebarCabinetChrome("direkciya")).toBe(true);
    expect(showSidebarCabinetChrome("kafedra")).toBe(true);
    expect(showSidebarCabinetChrome("pressa")).toBe(true);
  });

  it("rounds only the Auditoria mobile sheet", () => {
    expect(cabinetMobileSheetClassName("auditoria")).toContain("rounded-3xl");
    expect(cabinetMobileSheetClassName("kafedra")).toBeUndefined();
    expect(cabinetMobileSheetClassName("direkciya")).toBeUndefined();
    expect(cabinetMobileSheetClassName("pressa")).toBeUndefined();
  });

  it("paints the Auditoria page background behind the sidebar slot", () => {
    const shell = readFileSync("src/components/layout/cabinet-shell.tsx", "utf8");
    const layerIndex = shell.indexOf("<AuditoriaBackgroundLayer />");
    const asideIndex = shell.indexOf("<aside");
    const mainIndex = shell.indexOf("<main");
    expect(layerIndex).toBeGreaterThan(-1);
    expect(asideIndex).toBeGreaterThan(layerIndex);
    expect(mainIndex).toBeGreaterThan(asideIndex);
    expect(shell).toContain("cabinetAsidePanelClassName");
  });
});

describe("auditoria sidebar contents", () => {
  it("starts Auditoria navigation without the cabinet title card", () => {
    const src = readFileSync("src/components/layout/app-sidebar.tsx", "utf8");
    expect(src).toContain("showSidebarCabinetChrome");
    expect(src).toContain("BrandMark");
    expect(src).toContain("bg-pastel-blue");
    expect(src).toContain("<NavLinks");
    const nav = src.indexOf("<NavLinks");
    const logout = src.indexOf("logoutLabel", nav);
    expect(logout).toBeGreaterThan(nav);
    expect(src).toContain('logoutLabel = "Выйти"');
    expect(src).not.toContain("DevAccountSwitcher");
    expect(src).not.toContain("RoleSwitcher");
    expect(src).not.toContain("Локальный режим");
    expect(src).not.toContain("Как обновить данные");
  });
});

describe("auditoria home visuals", () => {
  it("does not render a page-level home greeting", () => {
    const src = readFileSync("src/components/auditoria/home-panel.tsx", "utf8");
    expect(src).not.toContain("PageHeader");
    expect(src).not.toContain("Здравствуйте");
  });

  it("keeps compact schedule legend labels and drops the old blue", () => {
    const src = readFileSync(
      "src/components/auditoria/compact-schedule.tsx",
      "utf8"
    );
    expect(src).toContain("Занятие");
    expect(src).toContain("Другое");
    expect(src).not.toContain("#3166F0");
  });

  it("does not use the old bright blue on the home formula card", () => {
    const src = readFileSync(
      "src/components/formula-trainer/quick-card.tsx",
      "utf8"
    );
    expect(src).not.toContain("#3166F0");
    expect(src).toContain("bg-pastel-blue");
  });
});
