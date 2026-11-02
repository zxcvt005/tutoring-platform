import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { resolveStudentTeacherChat } from "@/lib/chat/student-teacher-chat";

describe("student teacher chat target", () => {
  it("opens the assigned teacher and rejects a different one", () => {
    expect(
      resolveStudentTeacherChat({
        primaryTeacherId: "teacher-1",
        requestedTeacherId: "teacher-1",
      })
    ).toEqual({ ok: true, teacherId: "teacher-1" });
    expect(
      resolveStudentTeacherChat({
        primaryTeacherId: "teacher-1",
      })
    ).toEqual({ ok: true, teacherId: "teacher-1" });
    expect(
      resolveStudentTeacherChat({
        primaryTeacherId: "teacher-1",
        requestedTeacherId: "teacher-2",
      })
    ).toEqual({ ok: false, code: "foreign-teacher" });
    expect(
      resolveStudentTeacherChat({
        primaryTeacherId: null,
        requestedTeacherId: "teacher-2",
      })
    ).toEqual({ ok: false, code: "no-teacher" });
  });

  it("keeps the profile chat button on the internal chat, not an external messenger", () => {
    const src = readFileSync(
      "src/components/auditoria/profile-panel.tsx",
      "utf8"
    );
    expect(src).toContain("requestOpenTeacherChat(teacher.id)");
    expect(src).toContain("Открыть чат с");
    const contacts = src.slice(src.indexOf("function TeacherContacts"));
    expect(contacts).not.toContain("t.me");
    expect(contacts).not.toContain("telegram");
  });
});

describe("auditoria call history", () => {
  it("hides the call mode and the per-row history button", () => {
    const src = readFileSync(
      "src/components/video-calls/student-calls-workspace.tsx",
      "utf8"
    );
    expect(src).not.toContain("Параллельный");
    expect(src).not.toContain("Групповой");
    expect(src).not.toContain("История →");
    expect(src).toContain("Войти");
    expect(src).toContain("formatDateTime");
    expect(src).toContain("formatCallDuration");
    expect(src).toContain("call.teacherName");
  });
});

describe("formula trainer home entry", () => {
  it("opens the full trainer and does not start the quick question", () => {
    const src = readFileSync(
      "src/components/formula-trainer/quick-card.tsx",
      "utf8"
    );
    expect(src).toContain("Открыть тренажёр");
    expect(src).toContain("Продолжить тренировку");
    expect(src).toContain("activeSession");
    expect(src).not.toContain('"quick"');
    expect(src).toContain('entry={entry}');
  });

  it("places the question title immediately above the answer options", () => {
    const src = readFileSync(
      "src/components/formula-trainer/trainer-dialog.tsx",
      "utf8"
    );
    const title = src.indexOf("{question.title}");
    const options = src.indexOf("(question.options ?? [])");
    const result = src.indexOf("<FormulaAnswerResult");
    expect(title).toBeGreaterThan(-1);
    expect(options).toBeGreaterThan(title);
    expect(result).toBeGreaterThan(options);
    expect(src).toContain("Следующий вопрос →");
    const confirmation = readFileSync(
      "src/lib/formula-trainer/display.ts",
      "utf8"
    );
    expect(confirmation).toContain("autoAdvance: false");
    expect(confirmation).toContain('title: "Верно!"');
  });
});
