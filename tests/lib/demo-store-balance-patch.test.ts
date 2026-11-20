import { describe, expect, it } from "vitest";

import type { DemoData, Student } from "@/lib/types";

/**
 * Зеркало patchStudentDirectionBalance из demo-store — проверяем контракт
 * точечного обновления баланса без полного bootstrap.
 */
function patchStudentDirectionBalance(
  data: DemoData,
  studentId: string,
  directionId: string,
  remaining: number
): DemoData {
  const students = data.students.map((s) => {
    if (s.id !== studentId) return s;
    const balances = [...(s.directionBalances ?? [])];
    const idx = balances.findIndex((b) => b.directionId === directionId);
    if (idx >= 0) {
      balances[idx] = { ...balances[idx]!, balance: remaining };
    } else {
      balances.push({ directionId, balance: remaining });
    }
    return { ...s, directionBalances: balances };
  });
  const rows = [...(data.studentDirectionBalances ?? [])];
  const rowIdx = rows.findIndex(
    (r) => r.studentId === studentId && r.directionId === directionId
  );
  if (rowIdx >= 0) {
    rows[rowIdx] = { ...rows[rowIdx]!, remaining };
  } else {
    rows.push({
      studentId,
      directionId,
      remaining,
      used: 0,
    });
  }
  return { ...data, students, studentDirectionBalances: rows };
}

describe("patchStudentDirectionBalance", () => {
  it("updates existing student and ledger row balances", () => {
    const student = {
      id: "s1",
      fullName: "A",
      status: "active",
      teacherId: "t1",
      directionBalances: [{ directionId: "dir1", balance: 5 }],
    } as Student;
    const data = {
      students: [student],
      studentDirectionBalances: [
        { studentId: "s1", directionId: "dir1", remaining: 5, used: 1 },
      ],
    } as DemoData;

    const next = patchStudentDirectionBalance(data, "s1", "dir1", 4);
    expect(next.students[0]?.directionBalances?.[0]?.balance).toBe(4);
    expect(next.studentDirectionBalances[0]?.remaining).toBe(4);
  });
});
