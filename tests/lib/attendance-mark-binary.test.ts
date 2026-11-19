import { describe, expect, it } from "vitest";

import {
  attendanceMarkBinaryLabel,
  lessonAttendanceMarkBinary,
  studentAttendanceMarkBinary,
} from "@/lib/kafedra-today";
import type { Attendance, Lesson } from "@/lib/types";

const lesson: Lesson = {
  id: "l1",
  teacherId: "t1",
  studentIds: ["s1"],
  startsAt: "2026-01-01T10:00:00.000Z",
  endsAt: "2026-01-01T11:00:00.000Z",
  status: "planned",
};

describe("attendance mark binary labels", () => {
  it("labels unmarked and marked consistently", () => {
    expect(attendanceMarkBinaryLabel("unmarked")).toBe("Не отмечено");
    expect(attendanceMarkBinaryLabel("marked")).toBe("Отмечено");
    expect(studentAttendanceMarkBinary(lesson, "s1", [])).toBe("unmarked");
    const att: Attendance[] = [
      { lessonId: "l1", studentId: "s1", status: "present" },
    ];
    expect(studentAttendanceMarkBinary(lesson, "s1", att)).toBe("marked");
    expect(lessonAttendanceMarkBinary(lesson, att)).toBe("marked");
  });
});
