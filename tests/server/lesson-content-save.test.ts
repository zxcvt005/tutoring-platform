import { and, eq, ne } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import {
  lessons,
  studentLessonLedger,
  testAssignments,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { saveLessonContent } from "@/server/services/lesson-content-service";
import {
  assignHomework,
  publishHomework,
  setAttendance,
  upsertHomework,
  upsertLesson,
} from "@/server/services/platform-mutations";
import {
  physicsDirectionId,
  seedPaidLessons,
} from "../helpers/commerce";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("saveLessonContent — unified topics + homework", () => {
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

  async function pastLesson(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    teacher: Awaited<ReturnType<typeof asRole>>,
    studentId: string,
    directionId: string
  ) {
    const startsAt = new Date(Date.now() + 2 * 86_400_000);
    startsAt.setHours(16, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 45 * 60_000);
    const created = await upsertLesson(db, teacher, {
      teacherId: "t1",
      studentIds: [studentId],
      directionId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "planned",
      subject: "Физика",
    });
    const pastStart = new Date(Date.now() - 2 * 86_400_000);
    const pastEnd = new Date(pastStart.getTime() + 45 * 60_000);
    await db
      .update(lessons)
      .set({ startsAt: pastStart, endsAt: pastEnd })
      .where(eq(lessons.id, created.id));
    return created.id;
  }

  async function makePublishedHw(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    teacher: Awaited<ReturnType<typeof asRole>>,
    id: string,
    title: string
  ) {
    await upsertHomework(db, teacher, {
      id,
      teacherId: "t1",
      title,
      status: "draft",
      purpose: "homework",
      questions: [
        {
          id: `${id}_q1`,
          type: "single_choice",
          prompt: "2+2",
          maxScore: 1,
          options: [
            { id: "oa", text: "4" },
            { id: "ob", text: "5" },
          ],
          correctOptionIds: ["oa"],
        },
      ],
    });
    await publishHomework(db, teacher, id);
  }

  it("saves topic + homework and keeps them after re-save", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asRole(t.db, "anna@example.com");
    const director = await asRole(t.db, "director@demo.local");
    const directionId = await physicsDirectionId(t.db, anna.organizationId);
    await seedPaidLessons(t.db, director, "s1", {
      directionId,
      lessons: 5,
    });
    const lessonId = await pastLesson(t.db, anna, "s1", directionId);
    await makePublishedHw(t.db, anna, "hw_save_1", "ДЗ сохранение");

    const first = await saveLessonContent(t.db, anna, {
      lessonId,
      studentId: "s1",
      topics: [{ title: "Кинематика" }],
      homeworkIds: ["hw_save_1"],
    });
    expect(first.ok).toBe(true);
    expect(first.homework.created).toBe(1);

    const rows = await t.db
      .select()
      .from(testAssignments)
      .where(
        and(
          eq(testAssignments.lessonId, lessonId),
          eq(testAssignments.studentId, "s1"),
          ne(testAssignments.status, "withdrawn")
        )
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.testId).toBe("hw_save_1");

    const second = await saveLessonContent(t.db, anna, {
      lessonId,
      studentId: "s1",
      topics: [{ title: "Кинематика" }, { title: "Динамика" }],
      homeworkIds: ["hw_save_1"],
    });
    expect(second.ok).toBe(true);
    expect(second.homework.created).toBe(0);
    expect(second.topics.map((x) => x.title)).toEqual([
      "Кинематика",
      "Динамика",
    ]);

    const after = await t.db
      .select()
      .from(testAssignments)
      .where(
        and(
          eq(testAssignments.lessonId, lessonId),
          ne(testAssignments.status, "withdrawn")
        )
      );
    expect(after).toHaveLength(1);
  });

  it("assigns homework after absent mark without double debit", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asRole(t.db, "anna@example.com");
    const director = await asRole(t.db, "director@demo.local");
    const directionId = await physicsDirectionId(t.db, anna.organizationId);
    await seedPaidLessons(t.db, director, "s1", {
      directionId,
      lessons: 5,
    });
    const lessonId = await pastLesson(t.db, anna, "s1", directionId);
    await makePublishedHw(t.db, anna, "hw_after_mark", "ДЗ после отметки");

    await saveLessonContent(t.db, anna, {
      lessonId,
      studentId: "s1",
      topics: [{ title: "Тема до отметки" }],
      homeworkIds: [],
    });
    await setAttendance(t.db, anna, lessonId, "s1", "absent_unexcused");

    const afterMark = await saveLessonContent(t.db, anna, {
      lessonId,
      studentId: "s1",
      topics: [{ title: "Тема до отметки" }],
      homeworkIds: ["hw_after_mark"],
    });
    expect(afterMark.homework.created).toBe(1);

    await setAttendance(t.db, anna, lessonId, "s1", "present");
    await setAttendance(t.db, anna, lessonId, "s1", "present");

    const ledger = await t.db
      .select()
      .from(studentLessonLedger)
      .where(eq(studentLessonLedger.lessonId, lessonId));
    const net = ledger.reduce((sum, row) => sum + row.delta, 0);
    // Одно списание (−1) даже после повторных present.
    expect(net).toBe(-1);
  });

  it("assigns multiple homeworks and rejects silent created:0 for new lesson assign", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asRole(t.db, "anna@example.com");
    const director = await asRole(t.db, "director@demo.local");
    const directionId = await physicsDirectionId(t.db, anna.organizationId);
    await seedPaidLessons(t.db, director, "s1", {
      directionId,
      lessons: 3,
    });
    const lessonId = await pastLesson(t.db, anna, "s1", directionId);
    await makePublishedHw(t.db, anna, "hw_multi_a", "ДЗ A");
    await makePublishedHw(t.db, anna, "hw_multi_b", "ДЗ B");

    const saved = await saveLessonContent(t.db, anna, {
      lessonId,
      studentId: "s1",
      topics: [{ title: "Две темы" }],
      homeworkIds: ["hw_multi_a", "hw_multi_b"],
    });
    expect(saved.homework.created).toBe(2);

    const again = await assignHomework(t.db, anna, {
      homeworkId: "hw_multi_a",
      teacherId: "t1",
      studentIds: ["s1"],
      lessonId,
      requireCreated: true,
    });
    expect(again.created).toBe(0);
    expect(again.ensured).toBe(1);
  });

  it("preserves system subject when saving free-text topic", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asRole(t.db, "anna@example.com");
    const director = await asRole(t.db, "director@demo.local");
    const directionId = await physicsDirectionId(t.db, anna.organizationId);
    await seedPaidLessons(t.db, director, "s1", {
      directionId,
      lessons: 2,
    });
    const lessonId = await pastLesson(t.db, anna, "s1", directionId);

    await saveLessonContent(t.db, anna, {
      lessonId,
      studentId: "s1",
      topics: [{ title: "Кинематика точки" }],
      homeworkIds: [],
    });

    const [lesson] = await t.db
      .select()
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .limit(1);
    expect(lesson?.subject).toBe("Физика");
  });
});
