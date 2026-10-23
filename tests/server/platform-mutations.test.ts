import { describe, it, expect, afterEach } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { loginWithPassword } from "@/server/services/auth-service";
import { buildBootstrap } from "@/server/services/bootstrap-service";
import { eq } from "drizzle-orm";

import { lessonTopics, lessons, topics } from "@/server/db/schema";
import {
  assignHomework,
  completeLesson,
  publishHomework,
  setLessonTopic,
  upsertLesson,
  upsertTeacher,
  upsertTopic,
} from "@/server/services/platform-mutations";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("platform mutations + bootstrap", () => {
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

  it("director can upsert teacher; student cannot", async () => {
    const t = await createTestDb();
    close = t.close;

    const director = await asRole(t.db, "director@demo.local");
    const created = await upsertTeacher(t.db, director, {
      fullName: "Новый Преподаватель",
      subjects: ["Математика"],
      status: "active",
      email: "new-teacher@demo.local",
    });
    expect(created.id).toBeTruthy();

    const student = await asRole(t.db, "s1@demo.local");
    await expect(
      upsertTeacher(t.db, student, {
        fullName: "Hack",
        subjects: [],
        status: "active",
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("teacher cannot complete another teacher's lesson", async () => {
    const t = await createTestDb();
    close = t.close;
    const igor = await asRole(t.db, "igor@example.com");

    await expect(
      completeLesson(t.db, igor, {
        lessonId: "l1",
        topicId: "tp1",
        attendances: [{ studentId: "s1", status: "present" }],
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("upsertLesson rejects schedule conflict for student", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asRole(t.db, "anna@example.com");

    const startsAt = new Date(Date.now() + 3 * 86_400_000);
    startsAt.setHours(20, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);

    await upsertLesson(t.db, anna, {
      teacherId: "t1",
      studentIds: ["s1"],
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "planned",
      subject: "Конфликт-база",
    });

    await expect(
      upsertLesson(t.db, anna, {
        teacherId: "t1",
        studentIds: ["s1"],
        startsAt: new Date(startsAt.getTime() + 15 * 60_000).toISOString(),
        endsAt: new Date(endsAt.getTime() + 15 * 60_000).toISOString(),
        status: "planned",
        subject: "Конфликт-дубль",
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("student bootstrap never includes answer keys on open homeworks", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asRole(t.db, "s1@demo.local");
    const data = await buildBootstrap(t.db, student);

    for (const hw of data.homeworks) {
      const json = JSON.stringify(hw.questions ?? []);
      expect(json).not.toContain("correctOptionIds");
      expect(json).not.toContain("correctAnswers");
    }

    for (const a of data.homeworkAssignments) {
      if (a.status === "reviewed") continue;
      const json = JSON.stringify(a.testSnapshot?.questions ?? []);
      expect(json).not.toContain("correctOptionIds");
      expect(json).not.toContain("correctAnswers");
    }
  });

  it("assignHomework is unique for active open assignment", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asRole(t.db, "anna@example.com");

    await publishHomework(t.db, anna, "hw1").catch(() => undefined);

    const first = await assignHomework(t.db, anna, {
      homeworkId: "hw1",
      topicId: "tp1",
      teacherId: "t1",
      studentIds: ["s2"],
    });
    expect(first.created).toBeGreaterThanOrEqual(0);

    const second = await assignHomework(t.db, anna, {
      homeworkId: "hw1",
      topicId: "tp1",
      teacherId: "t1",
      studentIds: ["s2"],
    });
    expect(second.created).toBe(0);
  });

  it("upsertTopic requires title and description", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asRole(t.db, "anna@example.com");

    await expect(
      upsertTopic(t.db, anna, {
        teacherId: "t1",
        title: "  ",
        subject: "Математика",
        description: "Текст",
        status: "active",
        sectionId: "sec1",
      })
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      upsertTopic(t.db, anna, {
        teacherId: "t1",
        title: "Новая тема",
        subject: "Математика",
        description: "",
        status: "active",
        sectionId: "sec1",
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("setLessonTopic uses catalog or free text without creating a topic", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asRole(t.db, "anna@example.com");
    const student = await asRole(t.db, "s1@demo.local");

    const startsAt = new Date(Date.now() + 2 * 86_400_000);
    startsAt.setHours(16, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
    const created = await upsertLesson(t.db, anna, {
      teacherId: "t1",
      studentIds: ["s1"],
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "planned",
      subject: "Математика",
    });

    const before = await t.db.select({ id: topics.id }).from(topics);

    await setLessonTopic(t.db, anna, {
      lessonId: created.id,
      topicId: "tp1",
    });
    let [row] = await t.db
      .select()
      .from(lessons)
      .where(eq(lessons.id, created.id))
      .limit(1);
    expect(row?.topicId).toBe("tp1");

    await setLessonTopic(t.db, anna, {
      lessonId: created.id,
      title: "Свободная формулировка занятия",
    });
    [row] = await t.db
      .select()
      .from(lessons)
      .where(eq(lessons.id, created.id))
      .limit(1);
    expect(row?.topicId).toBeNull();
    expect(row?.subject).toBe("Свободная формулировка занятия");
    const links = await t.db
      .select()
      .from(lessonTopics)
      .where(eq(lessonTopics.lessonId, created.id));
    expect(links).toHaveLength(1);
    expect(links[0]?.title).toBe("Свободная формулировка занятия");
    expect(links[0]?.topicId).toBeNull();

    const after = await t.db.select({ id: topics.id }).from(topics);
    expect(after).toHaveLength(before.length);

    await expect(
      setLessonTopic(t.db, student, {
        lessonId: created.id,
        title: "Нельзя",
      })
    ).rejects.toMatchObject({ status: 403 });
  });
});
