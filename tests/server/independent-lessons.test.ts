import { describe, it, expect, afterEach } from "vitest";

import { eq, sql } from "drizzle-orm";

import { resolveAuthContext } from "@/server/authz/context";
import {
  attendances,
  lessonStudents,
  lessons,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  setLessonTopic,
  upsertHomework,
  upsertLesson,
  assignHomework,
  publishHomework,
  completeLesson,
} from "@/server/services/platform-mutations";
import { createLessonSchedule } from "@/server/services/schedule-service";
import { splitMultiStudentLessons } from "@/server/services/split-multi-student-lessons";
import { physicsDirectionId } from "../helpers/commerce";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("independent lessons", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function asAnna(db: Awaited<ReturnType<typeof createTestDb>>["db"]) {
    const { session } = await loginWithPassword(db, {
      email: "anna@example.com",
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, session.rawToken);
  }

  it("rejects group lessons and allows two students in the same slot", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asAnna(t.db);

    const startsAt = new Date(Date.now() + 4 * 86_400_000);
    startsAt.setHours(16, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);

    await expect(
      upsertLesson(t.db, anna, {
        teacherId: "t1",
        studentIds: ["s1", "s2"],
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        status: "planned",
      })
    ).rejects.toMatchObject({ status: 400 });

    const a = await upsertLesson(t.db, anna, {
      teacherId: "t1",
      studentIds: ["s1"],
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "planned",
      subject: "Слот А",
    });
    const b = await upsertLesson(t.db, anna, {
      teacherId: "t1",
      studentIds: ["s2"],
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "planned",
      subject: "Слот Б",
    });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    const links = await t.db.select().from(lessonStudents);
    expect(links.filter((l) => l.lessonId === a.id).map((l) => l.studentId)).toEqual(
      ["s1"]
    );
    expect(links.filter((l) => l.lessonId === b.id).map((l) => l.studentId)).toEqual(
      ["s2"]
    );

    await setLessonTopic(t.db, anna, {
      lessonId: a.id,
      title: "Кинематика А",
      topicId: null,
    });
    await setLessonTopic(t.db, anna, {
      lessonId: b.id,
      title: "Кинематика Б",
      topicId: null,
    });

    const [la] = await t.db.select().from(lessons).where(eq(lessons.id, a.id));
    const [lb] = await t.db.select().from(lessons).where(eq(lessons.id, b.id));
    expect(la?.subject).toBe("Кинематика А");
    expect(lb?.subject).toBe("Кинематика Б");
  });

  it("keeps three parallel lessons fully independent on complete", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asAnna(t.db);
    const directionId = await physicsDirectionId(t.db, anna.organizationId);

    const startsAt = new Date(Date.now() + 6 * 86_400_000);
    startsAt.setHours(15, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);

    const a = await upsertLesson(t.db, anna, {
      teacherId: "t1",
      studentIds: ["s1"],
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "planned",
      subject: "Физика",
      directionId,
    });
    const b = await upsertLesson(t.db, anna, {
      teacherId: "t1",
      studentIds: ["s2"],
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "planned",
      subject: "Физика",
      directionId,
    });
    const c = await upsertLesson(t.db, anna, {
      teacherId: "t1",
      studentIds: ["s3"],
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "planned",
      subject: "Физика",
      directionId,
    });

    await completeLesson(t.db, anna, {
      lessonId: a.id,
      topics: [{ title: "Тема только для s1" }],
      attendances: [{ studentId: "s1", status: "present" }],
    });

    const [la] = await t.db.select().from(lessons).where(eq(lessons.id, a.id));
    const [lb] = await t.db.select().from(lessons).where(eq(lessons.id, b.id));
    const [lc] = await t.db.select().from(lessons).where(eq(lessons.id, c.id));
    expect(la?.status).toBe("done");
    expect(lb?.status).toBe("planned");
    expect(lc?.status).toBe("planned");
    expect(la?.subject).toBe("Тема только для s1");
    expect(lb?.subject).toBe("Физика");
    expect(lc?.subject).toBe("Физика");

    const attB = await t.db
      .select()
      .from(attendances)
      .where(eq(attendances.lessonId, b.id));
    const attC = await t.db
      .select()
      .from(attendances)
      .where(eq(attendances.lessonId, c.id));
    expect(attB).toHaveLength(0);
    expect(attC).toHaveLength(0);

    await completeLesson(t.db, anna, {
      lessonId: b.id,
      topics: [{ title: "Тема только для s2" }],
      attendances: [{ studentId: "s2", status: "absent_excused" }],
    });

    const [lb2] = await t.db.select().from(lessons).where(eq(lessons.id, b.id));
    const [lc2] = await t.db.select().from(lessons).where(eq(lessons.id, c.id));
    expect(lb2?.status).toBe("done");
    expect(lc2?.status).toBe("planned");
    expect(lb2?.subject).toBe("Тема только для s2");
  });

  it("splits legacy multi-student lessons and preserves attendance", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asAnna(t.db);
    const directionId = await physicsDirectionId(t.db, anna.organizationId);

    await t.db.execute(
      sql`drop index if exists lesson_students_one_per_lesson_uidx`
    );

    const startsAt = new Date(Date.now() + 7 * 86_400_000);
    startsAt.setHours(12, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
    const legacyId = "l_legacy_multi";

    await t.db.insert(lessons).values({
      id: legacyId,
      organizationId: "org_demo",
      teacherId: "t1",
      directionId,
      subject: "Общая тема",
      startsAt,
      endsAt,
      status: "planned",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await t.db.insert(lessonStudents).values([
      { lessonId: legacyId, studentId: "s1" },
      { lessonId: legacyId, studentId: "s2" },
    ]);
    await t.db.insert(attendances).values([
      {
        lessonId: legacyId,
        studentId: "s1",
        status: "present",
        updatedAt: new Date(),
      },
      {
        lessonId: legacyId,
        studentId: "s2",
        status: "absent_excused",
        updatedAt: new Date(),
      },
    ]);

    const result = await splitMultiStudentLessons(t.db);
    expect(result.splitLessons).toBe(1);
    expect(result.createdLessons).toBe(1);

    const links = await t.db
      .select()
      .from(lessonStudents)
      .where(eq(lessonStudents.lessonId, legacyId));
    expect(links).toHaveLength(1);
    expect(links[0]?.studentId).toBe("s1");

    const cloneLessons = await t.db
      .select()
      .from(lessons)
      .where(eq(lessons.subject, "Общая тема"));
    expect(cloneLessons.length).toBeGreaterThanOrEqual(2);
    const cloneIds = cloneLessons.map((l) => l.id).filter((id) => id !== legacyId);
    expect(cloneIds).toHaveLength(1);
    const cloneId = cloneIds[0]!;

    const cloneLinks = await t.db
      .select()
      .from(lessonStudents)
      .where(eq(lessonStudents.lessonId, cloneId));
    expect(cloneLinks).toEqual([
      expect.objectContaining({ studentId: "s2" }),
    ]);

    const attKeep = await t.db
      .select()
      .from(attendances)
      .where(eq(attendances.lessonId, legacyId));
    expect(attKeep).toEqual([
      expect.objectContaining({ studentId: "s1", status: "present" }),
    ]);
    const attMoved = await t.db
      .select()
      .from(attendances)
      .where(eq(attendances.lessonId, cloneId));
    expect(attMoved).toEqual([
      expect.objectContaining({ studentId: "s2", status: "absent_excused" }),
    ]);

    await t.db.execute(
      sql`create unique index if not exists lesson_students_one_per_lesson_uidx on lesson_students (lesson_id)`
    );

    await expect(
      completeLesson(t.db, anna, {
        lessonId: legacyId,
        topics: [{ title: "После split" }],
        attendances: [{ studentId: "s1", status: "present" }],
      })
    ).resolves.toMatchObject({ ok: true });

    const [cloneAfter] = await t.db
      .select()
      .from(lessons)
      .where(eq(lessons.id, cloneId));
    expect(cloneAfter?.status).toBe("planned");
    expect(cloneAfter?.subject).toBe("Общая тема");
  });

  it("assigns homework only to one student of a parallel slot", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asAnna(t.db);

    const startsAt = new Date(Date.now() + 5 * 86_400_000);
    startsAt.setHours(17, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
    const lessonA = await upsertLesson(t.db, anna, {
      teacherId: "t1",
      studentIds: ["s1"],
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "planned",
    });
    const lessonB = await upsertLesson(t.db, anna, {
      teacherId: "t1",
      studentIds: ["s2"],
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "planned",
    });

    await upsertHomework(t.db, anna, {
      id: "hw_parallel",
      teacherId: "t1",
      title: "Параллельный тест",
      status: "draft",
      questions: [
        {
          id: "qp1",
          type: "single_choice",
          prompt: "1+1",
          maxScore: 1,
          options: [
            { id: "o1", text: "2" },
            { id: "o2", text: "3" },
          ],
          correctOptionIds: ["o1"],
        },
      ],
    });
    await publishHomework(t.db, anna, "hw_parallel");

    const assigned = await assignHomework(t.db, anna, {
      homeworkId: "hw_parallel",
      teacherId: "t1",
      studentIds: ["s1"],
      lessonId: lessonA.id,
    });
    expect(assigned.created).toBe(1);

    const other = await assignHomework(t.db, anna, {
      homeworkId: "hw_parallel",
      teacherId: "t1",
      studentIds: ["s2"],
      lessonId: lessonB.id,
    });
    expect(other.created).toBe(1);
  });

  it("createLessonSchedule rejects multiple students", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asAnna(t.db);
    await expect(
      createLessonSchedule(t.db, anna, {
        teacherId: "t1",
        studentIds: ["s1", "s2"],
        weekdays: [2],
        startTime: "10:00",
        durationMin: 60,
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("enforces one student per lesson at the database level", async () => {
    const t = await createTestDb();
    close = t.close;

    const startsAt = new Date(Date.now() + 8 * 86_400_000);
    startsAt.setHours(11, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
    const id = "l_uidx_check";
    await t.db.insert(lessons).values({
      id,
      organizationId: "org_demo",
      teacherId: "t1",
      startsAt,
      endsAt,
      status: "planned",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await t.db.insert(lessonStudents).values({ lessonId: id, studentId: "s1" });
    await expect(
      t.db.insert(lessonStudents).values({ lessonId: id, studentId: "s2" })
    ).rejects.toThrow();
  });
});
