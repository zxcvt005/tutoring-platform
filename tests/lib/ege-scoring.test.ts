import { describe, expect, it } from "vitest";

import { scorePart1Task } from "@/lib/mock-exams/ege";

describe("проверка первой части ЕГЭ", () => {
  it("даёт 1 балл за полное совпадение задания на 1 балл", () => {
    expect(scorePart1Task(1, "15", "15")).toBe(1);
  });

  it("даёт 0 за несовпадение задания на 1 балл", () => {
    expect(scorePart1Task(1, "15", "16")).toBe(0);
  });

  it("не считает разные по форме ответы одинаковыми", () => {
    expect(scorePart1Task(2, " 42 ", "42")).toBe(1);
    expect(scorePart1Task(2, "4 2", "42")).toBe(0);
    expect(scorePart1Task(3, "A", "a")).toBe(0);
  });

  it("даёт 2 балла за полное позиционное совпадение", () => {
    expect(scorePart1Task(6, "1234", "1234")).toBe(2);
  });

  it("даёт 1 балл за одну ошибку в позиционном ответе", () => {
    expect(scorePart1Task(10, "1234", "1235")).toBe(1);
    expect(scorePart1Task(15, "1234", "123")).toBe(1);
  });

  it("даёт 0 за две ошибки в позиционном ответе", () => {
    expect(scorePart1Task(17, "1234", "1256")).toBe(0);
    expect(scorePart1Task(6, "12", "21")).toBe(0);
  });

  it("даёт 0 за лишний символ в позиционном ответе", () => {
    expect(scorePart1Task(6, "123", "1234")).toBe(0);
  });

  it("даёт 2 балла за верный набор без учёта порядка", () => {
    expect(scorePart1Task(5, "123", "321")).toBe(2);
  });

  it("даёт 1 балл за одну ошибку без учёта порядка", () => {
    expect(scorePart1Task(9, "12", "123")).toBe(1);
    expect(scorePart1Task(14, "123", "12")).toBe(1);
    expect(scorePart1Task(18, "12", "13")).toBe(1);
  });

  it("даёт 0 за несколько ошибок без учёта порядка", () => {
    expect(scorePart1Task(5, "112", "345")).toBe(0);
    expect(scorePart1Task(9, "12", "1234")).toBe(0);
  });

  it("учитывает повторяющиеся символы", () => {
    expect(scorePart1Task(14, "112", "121")).toBe(2);
    expect(scorePart1Task(14, "112", "111")).toBe(1);
    expect(scorePart1Task(18, "11", "111")).toBe(1);
    expect(scorePart1Task(5, "112", "11")).toBe(1);
  });

  it("принимает задание 20 в другом порядке символов", () => {
    expect(scorePart1Task(20, "315", "153")).toBe(1);
    expect(scorePart1Task(20, "315", "3155")).toBe(0);
    expect(scorePart1Task(20, "11", "1")).toBe(0);
  });

  it("не считает пустой эталон правильным ответом", () => {
    expect(scorePart1Task(1, "", "15")).toBeNull();
    expect(scorePart1Task(1, "   ", "15")).toBeNull();
    expect(scorePart1Task(6, "", "1234")).toBeNull();
  });

  it("не проверяет задание без ответа ученика", () => {
    expect(scorePart1Task(1, "15", "")).toBeNull();
    expect(scorePart1Task(1, "15", "  ")).toBeNull();
    expect(scorePart1Task(5, "12", "")).toBeNull();
  });
});
