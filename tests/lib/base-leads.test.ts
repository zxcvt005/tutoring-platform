import { describe, expect, it } from "vitest";

import {
  BASE_LEAD_SOURCES,
  BASE_LEAD_STATUSES,
  formatBaseLeadDateDisplay,
  isBaseLeadSource,
  isBaseLeadStatus,
  todayIsoDate,
} from "@/lib/base-leads";

describe("base-leads helpers", () => {
  it("exposes the fixed source and status catalogs", () => {
    expect(BASE_LEAD_SOURCES).toEqual([
      "Профи",
      "Авито",
      "Реклама",
      "Сарафан",
      "Блог",
    ]);
    expect(BASE_LEAD_STATUSES).toEqual([
      "Получен контакт",
      "Игнор",
      "Назначен пробный",
      "Проведен пробный",
      "Отказ",
      "Отказище",
      "Купил",
    ]);
  });

  it("validates source and status values", () => {
    expect(isBaseLeadSource("Авито")).toBe(true);
    expect(isBaseLeadSource("Другое")).toBe(false);
    expect(isBaseLeadStatus("Купил")).toBe(true);
    expect(isBaseLeadStatus("Новый")).toBe(false);
  });

  it("formats entry dates as DD.MM", () => {
    expect(formatBaseLeadDateDisplay("2026-02-01")).toBe("01.02");
    expect(formatBaseLeadDateDisplay("2026-08-21")).toBe("21.08");
  });

  it("builds today ISO date", () => {
    expect(todayIsoDate(new Date("2026-11-12T10:00:00Z"))).toBe("2026-11-12");
  });

  it("documents people fields and keeps avitoUrl key for the Ссылка column", () => {
    const sample = {
      student: "",
      parent: "",
      teacher: "",
      avitoUrl: "https://www.avito.ru/item/1",
    };
    expect(Object.keys(sample)).toEqual([
      "student",
      "parent",
      "teacher",
      "avitoUrl",
    ]);
  });
});
