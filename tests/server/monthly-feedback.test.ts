import { afterEach, describe, expect, it } from "vitest";

import { fromAppWall } from "@/lib/app-time";
import { resolveAuthContext } from "@/server/authz/context";
import { DEMO_ORG_ID } from "@/server/db/seed";
import {
  attendances,
  lessonStudents,
  lessonTopics,
  lessons,
  testAssignments,
  tests,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  getPressFeedback,
  getTeacherFeedback,
  listPressFeedback,
  listTeacherFeedback,
  markPressFeedbackProcessed,
  savePressParentText,
  saveTeacherFeedbackDraft,
  startPressFeedback,
  submitTeacherFeedback,
} from "@/server/services/monthly-feedback-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("monthly feedback", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function asRole(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    email: string
  ) {
    const { session } = await loginWithPassword(db, {
      email,
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, session.rawToken);
  }

  async function insertOctoberLesson(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    id: string,
    studentId: string,
    day: number,
    attendance: "present" | "absent_unexcused" | null,
    topic?: string
  ) {
    const startsAt = fromAppWall(2025, 3, day, 16, 0);
    const endsAt = fromAppWall(2025, 3, day, 17, 0);
    await db.insert(lessons).values({
      id,
      organizationId: DEMO_ORG_ID,
      teacherId: "t1",
      startsAt,
      endsAt,
      status: "done",
      subject: "Математика",
    });
    await db.insert(lessonStudents).values({ lessonId: id, studentId });
    if (attendance) {
      await db.insert(attendances).values({
        lessonId: id,
        studentId,
        status: attendance,
      });
    }
    if (topic) {
      await db.insert(lessonTopics).values({
        id: `${id}_topic`,
        organizationId: DEMO_ORG_ID,
        lessonId: id,
        title: topic,
        sortOrder: 0,
      });
    }
  }

  it("saves a draft, rejects empty submit, submits once and snapshots metrics", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asRole(t.db, "anna@example.com");
    const press = await asRole(t.db, "press@demo.local");
    const igor = await asRole(t.db, "igor@example.com");
    const now = fromAppWall(2025, 3, 20, 12, 0);

    await insertOctoberLesson(t.db, "les_fb1", "s1", 5, "present", "Линейные уравнения");
    await insertOctoberLesson(t.db, "les_fb2", "s1", 12, "absent_unexcused");
    await t.db.insert(tests).values({
      id: "test_fb",
      organizationId: DEMO_ORG_ID,
      teacherId: "t1",
      title: "Уравнения",
      purpose: "homework",
      libraryScope: "teacher",
      status: "published",
    });
    await t.db.insert(testAssignments).values({
      id: "asg_fb",
      organizationId: DEMO_ORG_ID,
      testId: "test_fb",
      teacherId: "t1",
      studentId: "s1",
      sourceKind: "homework",
      status: "completed",
      attempt1Percent: "80.00",
      createdAt: fromAppWall(2025, 3, 6, 12, 0),
      completedAt: fromAppWall(2025, 3, 7, 12, 0),
    });

    const list = await listTeacherFeedback(t.db, anna, {
      year: 2025,
      month: 3,
      now,
    });
    const row = list.students.find((s) => s.studentId === "s1");
    expect(row?.fillStatus).toBe("empty");
    expect(row?.metricsSummary).toContain("посещено 1 из 2");

    const emptyMonth = await listTeacherFeedback(t.db, anna, {
      year: 2025,
      month: 2,
      now,
    });
    expect(
      emptyMonth.students.find((s) => s.studentId === "s1")?.metricsSummary
    ).toBe("Недостаточно данных за этот месяц");

    await saveTeacherFeedbackDraft(t.db, anna, {
      studentId: "s1",
      year: 2025,
      month: 3,
      teacherComment: "Уверенно считает, путает знаки.",
    });
    const draft = await getTeacherFeedback(t.db, anna, {
      studentId: "s1",
      year: 2025,
      month: 3,
      now,
    });
    expect(draft.report.fillStatus).toBe("draft");
    expect(draft.report.teacherComment).toContain("путает знаки");
    expect(draft.report.metricsLive).toBe(true);
    expect(draft.report.metrics?.lessons.present).toBe(1);

    await expect(
      submitTeacherFeedback(t.db, anna, {
        studentId: "s1",
        year: 2025,
        month: 3,
        teacherComment: "   ",
        now,
      })
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      getTeacherFeedback(t.db, igor, { studentId: "s1", year: 2026, month: 10 })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      saveTeacherFeedbackDraft(t.db, igor, {
        studentId: "s1",
        year: 2026,
        month: 10,
        teacherComment: "Чужой отчёт",
      })
    ).rejects.toMatchObject({ status: 403 });

    const submitted = await submitTeacherFeedback(t.db, anna, {
      studentId: "s1",
      year: 2025,
      month: 3,
      teacherComment: "Уверенно считает, путает знаки.",
      now,
    });
    expect(submitted.report.fillStatus).toBe("submitted");
    expect(submitted.report.metricsLive).toBe(false);
    expect(submitted.report.pressStatus).toBe("pending");
    expect(submitted.report.prompt).toContain("Уверенно считает");
    expect(submitted.report.prompt).toContain("посещено 1 из 2");
    expect(submitted.report.prompt).not.toContain("+7");

    await expect(
      submitTeacherFeedback(t.db, anna, {
        studentId: "s1",
        year: 2025,
        month: 3,
        teacherComment: "Повтор",
        now,
      })
    ).rejects.toMatchObject({ status: 409 });

    await insertOctoberLesson(t.db, "les_fb3", "s1", 18, "present", "Неравенства");
    const afterEdit = await getPressFeedback(t.db, press, submitted.report.id);
    expect(afterEdit.report.metrics?.lessons.occurred).toBe(2);
    expect(afterEdit.report.metricsLive).toBe(false);
    expect(afterEdit.report.teacherComment).toBe(
      "Уверенно считает, путает знаки."
    );

    const pressList = await listPressFeedback(t.db, press, {
      year: 2025,
      month: 3,
      status: "pending",
    });
    expect(pressList.reports.some((r) => r.id === submitted.report.id)).toBe(
      true
    );

    await expect(
      saveTeacherFeedbackDraft(t.db, press, {
        studentId: "s1",
        year: 2026,
        month: 10,
        teacherComment: "правка",
      })
    ).rejects.toMatchObject({ status: 403 });

    await startPressFeedback(t.db, press, submitted.report.id);
    const saved = await savePressParentText(
      t.db,
      press,
      submitted.report.id,
      "Итоговый текст для родителя"
    );
    expect(saved.report.parentMessageText).toBe("Итоговый текст для родителя");
    expect(saved.report.teacherComment).toBe(
      "Уверенно считает, путает знаки."
    );
    const processed = await markPressFeedbackProcessed(
      t.db,
      press,
      submitted.report.id
    );
    expect(processed.report.pressStatus).toBe("processed");
  });

  it("does not create a duplicate draft for the same student and month", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asRole(t.db, "anna@example.com");
    const first = await saveTeacherFeedbackDraft(t.db, anna, {
      studentId: "s2",
      year: 2026,
      month: 11,
      teacherComment: "Черновик 1",
    });
    const second = await saveTeacherFeedbackDraft(t.db, anna, {
      studentId: "s2",
      year: 2026,
      month: 11,
      teacherComment: "Черновик 2",
    });
    expect(second.report.id).toBe(first.report.id);
    expect(second.report.teacherComment).toBe("Черновик 2");
  });
});
