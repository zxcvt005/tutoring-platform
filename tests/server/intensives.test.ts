import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isCatalogHomeworkPurpose, isHomeworkSource } from "@/lib/homework/source-kind";
import { intensiveStudentLabel } from "@/lib/intensives/progress";
import { resolveAuthContext } from "@/server/authz/context";
import { saveDraft, submitAssignment } from "@/server/services/assignments-service";
import { loginWithPassword } from "@/server/services/auth-service";
import { buildBootstrap } from "@/server/services/bootstrap-service";
import {
  assignIntensive,
  upsertIntensive,
} from "@/server/services/intensives-service";
import { upsertHomework } from "@/server/services/platform-mutations";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

function choiceQuestion(id: string, prompt: string) {
  return {
    id,
    type: "single_choice" as const,
    prompt,
    maxScore: 1,
    options: [
      { id: `${id}-a`, text: "верно" },
      { id: `${id}-b`, text: "неверно" },
    ],
    correctOptionIds: [`${id}-a`],
  };
}

const VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

describe("интенсивы в базе", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>["db"];
  let close: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const t = await createTestDb();
    db = t.db;
    close = t.close;
  });

  afterAll(async () => {
    if (close) await close();
  });

  async function asRole(email: string) {
    const { session } = await loginWithPassword(db, {
      email,
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, session.rawToken);
  }

  it("публикует несколько тестов, требует дедлайны и сохраняет выданную версию", async () => {
    const anna = await asRole("anna@example.com");
    await expect(
      upsertIntensive(db, anna, {
        title: "Чужой банк",
        videoUrl: VIDEO,
        testIds: ["hw1"],
        publish: true,
      })
    ).rejects.toThrow(/внутри интенсива/);

    const first = await upsertHomework(db, anna, {
      teacherId: "t1",
      title: "Тест внутри интенсива 1",
      status: "draft",
      purpose: "intensive",
      questions: [choiceQuestion("iq1", "Первый вопрос")],
    });
    const second = await upsertHomework(db, anna, {
      teacherId: "t1",
      title: "Тест внутри интенсива 2",
      status: "draft",
      purpose: "intensive",
      questions: [choiceQuestion("iq2", "Второй вопрос")],
    });
    const created = await upsertIntensive(db, anna, {
      title: "Механика",
      description: "Первая версия",
      videoUrl: VIDEO,
      testIds: [first.id, second.id],
      publish: true,
    });
    await expect(
      assignIntensive(db, anna, {
        intensiveId: created.id,
        studentId: "s1",
        deadlines: [],
      })
    ).rejects.toThrow(/дедлайн/i);

    await assignIntensive(db, anna, {
      intensiveId: created.id,
      studentId: "s1",
      deadlines: [
        { testId: second.id, dueAt: "2026-12-02T09:00:00.000Z" },
        { testId: first.id, dueAt: "2026-12-01T09:00:00.000Z" },
      ],
    });

    await upsertIntensive(db, anna, {
      id: created.id,
      title: "Механика, новая редакция",
      description: "Уже после отправки",
      videoUrl: VIDEO,
      testIds: [first.id],
      publish: true,
    });

    const student = await buildBootstrap(db, await asRole("s1@demo.local"));
    const issued = student.intensiveAssignments.find(
      (item) => item.intensiveId === created.id
    );
    expect(issued?.title).toBe("Механика");
    expect(issued?.description).toBe("Первая версия");
    expect(issued?.tests.map((test) => test.testId)).toEqual([first.id, second.id]);
    expect(issued?.tests.map((test) => test.dueAt.slice(0, 10))).toEqual([
      "2026-12-01",
      "2026-12-02",
    ]);

    const other = await buildBootstrap(db, await asRole("s2@demo.local"));
    expect(
      other.intensiveAssignments.some((item) => item.intensiveId === created.id)
    ).toBe(false);

    const homework = student.homeworkAssignments.filter((item) =>
      isHomeworkSource(item.sourceKind)
    );
    expect(
      homework.some((item) => item.sourceKind === "intensive")
    ).toBe(false);
    expect(
      student.homeworkAssignments.some((item) => item.sourceKind === "intensive")
    ).toBe(true);
    const teacherBefore = await buildBootstrap(db, anna);
    expect(
      teacherBefore.homeworks
        .filter((item) => isCatalogHomeworkPurpose(item.purpose))
        .some((item) => item.id === first.id || item.id === second.id)
    ).toBe(false);
    const issuedForTeacher = teacherBefore.intensiveAssignments.find(
      (item) => item.intensiveId === created.id
    );
    expect(intensiveStudentLabel(issuedForTeacher?.tests ?? []).label).toBe(
      "В процессе"
    );

    const studentCtx = await asRole("s1@demo.local");
    const firstAttempt = issued?.tests.find((test) => test.testId === first.id);
    await saveDraft(db, studentCtx, firstAttempt!.testAssignmentId, [
      { questionId: "iq1", selectedOptionIds: ["iq1-a"], textAnswer: "" },
    ]);
    const whileWorking = await buildBootstrap(db, anna);
    const working = whileWorking.intensiveAssignments.find(
      (item) => item.intensiveId === created.id
    );
    expect(working?.tests.find((test) => test.testId === first.id)?.status).toBe(
      "in_progress"
    );
    expect(intensiveStudentLabel(working?.tests ?? [])).toMatchObject({
      label: "В процессе",
      done: 0,
      total: 2,
    });

    await submitAssignment(db, studentCtx, firstAttempt!.testAssignmentId, [
      { questionId: "iq1", selectedOptionIds: ["iq1-a"], textAnswer: "" },
    ]);
    const secondAttempt = issued?.tests.find((test) => test.testId === second.id);
    await submitAssignment(db, studentCtx, secondAttempt!.testAssignmentId, [
      { questionId: "iq2", selectedOptionIds: ["iq2-a"], textAnswer: "" },
    ]);
    const afterSubmit = await buildBootstrap(db, anna);
    const finished = afterSubmit.intensiveAssignments.find(
      (item) => item.intensiveId === created.id
    );
    expect(intensiveStudentLabel(finished?.tests ?? [])).toEqual({
      label: "Готово",
      done: 2,
      total: 2,
    });
    for (const test of finished?.tests ?? []) {
      expect(test.score).not.toBeNull();
      expect(test.completedAt).toBeTruthy();
    }

    const igor = await asRole("igor@example.com");
    await expect(
      assignIntensive(db, igor, {
        intensiveId: created.id,
        studentId: "s1",
        deadlines: [
          { testId: first.id, dueAt: "2026-12-01T09:00:00.000Z" },
        ],
      })
    ).rejects.toThrow();

    const press = await buildBootstrap(db, await asRole("press@demo.local"));
    expect(press.intensives).toEqual([]);
    expect(press.intensiveAssignments).toEqual([]);
  });

  it("позволяет назначить общий интенсив без копии и не переписывает выдачу", async () => {
    const director = await asRole("director@demo.local");
    const created = await upsertIntensive(db, director, {
      libraryScope: "school",
      title: "Общий интенсив",
      videoUrl: VIDEO,
      testIds: [],
      publish: true,
    });
    const anna = await asRole("anna@example.com");
    const visible = await buildBootstrap(db, anna);
    expect(visible.intensives.some((item) => item.id === created.id)).toBe(true);

    await assignIntensive(db, anna, {
      intensiveId: created.id,
      studentId: "s1",
      deadlines: [],
    });
    await upsertIntensive(db, director, {
      id: created.id,
      libraryScope: "school",
      title: "Общий интенсив изменён",
      videoUrl: VIDEO,
      testIds: [],
      publish: true,
    });
    const student = await buildBootstrap(db, await asRole("s1@demo.local"));
    expect(
      student.intensiveAssignments.find((item) => item.intensiveId === created.id)
        ?.title
    ).toBe("Общий интенсив");
  });
});
