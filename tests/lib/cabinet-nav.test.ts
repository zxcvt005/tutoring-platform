import { describe, expect, it } from "vitest";

import { cabinetHomeForRole } from "@/lib/auth/roles";
import {
  assistentNavItems,
  auditoriaNavItems,
  direkciyaNavItems,
  kafedraNavItems,
  pressaNavItems,
} from "@/lib/cabinet-nav";

describe("cabinet navigation", () => {
  it("renames payments tab to Доходы and keeps route", () => {
    const payments = direkciyaNavItems.find(
      (i) => i.href === "/direkciya/payments"
    );
    expect(payments?.label).toBe("Доходы");
  });

  it("does not show Auditoria schedule tab", () => {
    expect(auditoriaNavItems.map((i) => i.href)).not.toContain(
      "/auditoria/schedule"
    );
    expect(auditoriaNavItems.map((i) => i.label)).not.toContain("Расписание");
  });

  it("does not show Kafedra results tab", () => {
    expect(kafedraNavItems.map((i) => i.href)).not.toContain("/kafedra/results");
    expect(kafedraNavItems.map((i) => i.label)).not.toContain("Результаты");
  });

  it("adds Salaries to Direkciya", () => {
    expect(direkciyaNavItems).toContainEqual({
      href: "/direkciya/salaries",
      label: "Зарплаты",
    });
  });

  it("adds the knowledge base to Direkciya", () => {
    expect(direkciyaNavItems).toContainEqual({
      href: "/direkciya/knowledge",
      label: "База знаний",
    });
  });

  it("adds the Base table module to Direkciya", () => {
    expect(direkciyaNavItems).toContainEqual({
      href: "/direkciya/baza",
      label: "База",
    });
  });

  it("adds trial lessons table next to Base in Direkciya", () => {
    expect(direkciyaNavItems).toContainEqual({
      href: "/direkciya/probnye-uroki",
      label: "Пробные уроки",
    });
    const bazaIdx = direkciyaNavItems.findIndex(
      (i) => i.href === "/direkciya/baza"
    );
    const trialsIdx = direkciyaNavItems.findIndex(
      (i) => i.href === "/direkciya/probnye-uroki"
    );
    expect(trialsIdx).toBe(bazaIdx + 1);
  });

  it("adds RNP Avito next to the other Direkciya tables", () => {
    expect(direkciyaNavItems).toContainEqual({
      href: "/direkciya/rnp-avito",
      label: "РНП Авито",
    });
    const trialsIdx = direkciyaNavItems.findIndex(
      (i) => i.href === "/direkciya/probnye-uroki"
    );
    const rnpIdx = direkciyaNavItems.findIndex(
      (i) => i.href === "/direkciya/rnp-avito"
    );
    expect(rnpIdx).toBe(trialsIdx + 1);
  });

  it("adds monthly feedback to teacher and press cabinets", () => {
    expect(kafedraNavItems).toContainEqual({
      href: "/kafedra/feedback",
      label: "Обратная связь",
    });
    expect(pressaNavItems).toContainEqual({
      href: "/pressa/feedback",
      label: "Обратная связь",
    });
  });

  it("adds mock exams to the teacher cabinet", () => {
    expect(kafedraNavItems).toContainEqual({
      href: "/kafedra/probniki",
      label: "Пробники",
    });
  });

  it("adds Calls to teacher and student cabinets", () => {
    expect(kafedraNavItems).toContainEqual({
      href: "/kafedra/calls",
      label: "Звонки",
    });
    expect(auditoriaNavItems).toContainEqual({
      href: "/auditoria/calls",
      label: "Звонки",
    });
  });

  it("restores separate content sections for the teacher cabinet", () => {
    expect(kafedraNavItems).toContainEqual({
      href: "/kafedra/topics",
      label: "Темы",
    });
    expect(kafedraNavItems).toContainEqual({
      href: "/kafedra/theory",
      label: "Теория",
    });
    expect(kafedraNavItems).toContainEqual({
      href: "/kafedra/tests",
      label: "Домашние задания",
    });
    expect(kafedraNavItems).toContainEqual({
      href: "/kafedra/intensivy",
      label: "Интенсивы",
    });
    expect(kafedraNavItems.map((i) => i.href)).not.toContain("/kafedra/materials");
  });

  it("keeps Theory and Intensives in the student cabinet", () => {
    expect(auditoriaNavItems).toContainEqual({
      href: "/auditoria/intensivy",
      label: "Интенсивы",
    });
    expect(auditoriaNavItems).toContainEqual({
      href: "/auditoria/theory",
      label: "Теория",
    });
  });

  it("adds Оплата to Auditoria", () => {
    expect(auditoriaNavItems).toContainEqual({
      href: "/auditoria/pay",
      label: "Оплата",
    });
  });

  it("routes the press role to /pressa", () => {
    expect(cabinetHomeForRole("press")).toBe("/pressa");
    expect(cabinetHomeForRole("director")).toBe("/direkciya");
  });

  it("routes the assistant role to /assistent with knowledge-only nav", () => {
    expect(cabinetHomeForRole("assistant")).toBe("/assistent");
    expect(assistentNavItems).toEqual([
      { href: "/assistent/knowledge", label: "База знаний" },
    ]);
  });

  it("adds Pressa cabinet items without finance routes", () => {
    expect(pressaNavItems).toEqual([
      { href: "/pressa", label: "Обзор" },
      { href: "/pressa/reminders", label: "Напоминания" },
      { href: "/pressa/feedback", label: "Обратная связь" },
      { href: "/pressa/ratings", label: "Отметки учеников" },
      { href: "/pressa/students", label: "Ученики" },
      { href: "/pressa/teachers", label: "Преподаватели" },
      { href: "/pressa/trials", label: "Пробные уроки" },
      { href: "/pressa/analytics", label: "Аналитика" },
    ]);
    expect(pressaNavItems.map((i) => i.href).join(" ")).not.toMatch(
      /salaries|tariffs|payments/
    );
  });
});
