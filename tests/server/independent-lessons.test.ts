import { describe, it, expect, afterEach } from "vitest";

import { eq } from "drizzle-orm";

import { resolveAuthContext } from "@/server/authz/context";
import { lessonStudents, lessons } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  setLessonTopic,
  upsertHomework,
  upsertLesson,
  assignHomework,
  publishHomework,
} from "@/server/services/platform-mutations";
import { createLessonSchedule } from "@/server/services/schedule-service";
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
});
