import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { fromAppWall } from "@/lib/app-time";
import { resolveAuthContext } from "@/server/authz/context";
import { DEMO_ORG_ID } from "@/server/db/seed";
import {
  attendances,
  lessonRatings,
  lessonStudents,
  lessons,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  listMyLessonRatings,
  listPendingStudentRatings,
  listPressLessonRatings,
  submitLessonRating,
  updateLessonRatingComment,
} from "@/server/services/lesson-ratings-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("lesson ratings", () => {
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

  async function lesson(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    input: {
      id: string;
      studentIds: string[];
      teacherId?: string;
      status?: "planned" | "done" | "cancelled";
      startsAt: Date;
      attendance?: Record<string, "present" | "absent_unexcused" | "cancelled">;
    }
  ) {
    const endsAt = new Date(input.startsAt.getTime() + 60 * 60_000);
    await db.insert(lessons).values({
      id: input.id,
      organizationId: DEMO_ORG_ID,
      teacherId: input.teacherId ?? "t1",
      startsAt: input.startsAt,
      endsAt,
      status: input.status ?? "done",
      subject: "Математика",
    });
    for (const studentId of input.studentIds) {
      await db.insert(lessonStudents).values({
        lessonId: input.id,
        studentId,
      });
    }
    for (const [studentId, status] of Object.entries(input.attendance ?? {})) {
      await db.insert(attendances).values({
        lessonId: input.id,
        studentId,
        status,
      });
    }
  }

  it("saves 7-10 without comment and allows 1-6 without a comment", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asRole(t.db, "s1@demo.local");
    const other = await asRole(t.db, "s2@demo.local");
    const press = await asRole(t.db, "press@demo.local");
    const now = fromAppWall(2025, 4, 20, 12, 0);

    await lesson(t.db, {
      id: "lr_done",
      studentIds: ["s1", "s2"],
      startsAt: fromAppWall(2025, 4, 10, 16, 0),
      attendance: { s1: "present", s2: "present" },
    });
    await lesson(t.db, {
      id: "lr_low",
      studentIds: ["s1"],
      startsAt: fromAppWall(2025, 4, 12, 16, 0),
      attendance: { s1: "present" },
    });
    await lesson(t.db, {
      id: "lr_future",
      studentIds: ["s1"],
      status: "planned",
      startsAt: fromAppWall(2025, 4, 28, 16, 0),
    });
    await lesson(t.db, {
      id: "lr_cancel",
      studentIds: ["s1"],
      status: "cancelled",
      startsAt: fromAppWall(2025, 4, 8, 16, 0),
      attendance: { s1: "present" },
    });
    await lesson(t.db, {
      id: "lr_absent",
      studentIds: ["s1"],
      startsAt: fromAppWall(2025, 4, 9, 16, 0),
      attendance: { s1: "absent_unexcused" },
    });
    await lesson(t.db, {
      id: "lr_other",
      studentIds: ["s2"],
      teacherId: "t2",
      startsAt: fromAppWall(2025, 4, 11, 16, 0),
      attendance: { s2: "present" },
    });

    const high = await submitLessonRating(t.db, student, {
      lessonId: "lr_done",
      score: 9,
      now,
    });
    expect(high.rating.score).toBe(9);
    expect(high.rating.comment).toBe("");

    const pendingBefore = await listPendingStudentRatings(t.db, student, { now });
    const pendingIds = pendingBefore.lessons.map((l) => l.lessonId);
    expect(pendingIds).toContain("lr_low");
    expect(pendingIds).not.toContain("lr_done");
    expect(pendingIds).not.toContain("lr_future");
    expect(pendingIds).not.toContain("lr_cancel");
    expect(pendingIds).not.toContain("lr_absent");

    const blank = await submitLessonRating(t.db, student, {
      lessonId: "lr_low",
      score: 5,
      comment: "",
      now,
    });
    expect(blank.rating.score).toBe(5);
    expect(blank.rating.comment).toBe("");

    const commented = await updateLessonRatingComment(t.db, student, {
      lessonId: "lr_low",
      comment: "Не хватило практики.",
    });
    expect(commented.rating.comment).toBe("Не хватило практики.");
    const low = commented;

    await expect(
      submitLessonRating(t.db, student, {
        lessonId: "lr_done",
        score: 8,
        now,
      })
    ).rejects.toMatchObject({ status: 409 });

    await expect(
      submitLessonRating(t.db, student, {
        lessonId: "lr_future",
        score: 9,
        now,
      })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      submitLessonRating(t.db, student, {
        lessonId: "lr_cancel",
        score: 9,
        now,
      })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      submitLessonRating(t.db, student, {
        lessonId: "lr_absent",
        score: 9,
        now,
      })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      submitLessonRating(t.db, student, {
        lessonId: "lr_other",
        score: 9,
        now,
      })
    ).rejects.toMatchObject({ status: 403 });

    const mine = await listMyLessonRatings(t.db, student);
    expect(mine.ratings).toHaveLength(2);
    const otherMine = await listMyLessonRatings(t.db, other);
    expect(otherMine.ratings).toHaveLength(0);

    await submitLessonRating(t.db, other, {
      lessonId: "lr_done",
      score: 10,
      now: fromAppWall(2025, 4, 21, 10, 0),
    });

    const overview = await listPressLessonRatings(t.db, press, {
      period: "custom",
      from: "2025-04-01",
      to: "2025-04-30",
      now,
    });
    expect(overview.ratings).toHaveLength(3);
    expect(overview.attention.every((r) => r.score <= 6)).toBe(true);
    expect(overview.attention.map((r) => r.lessonId)).toEqual(["lr_low"]);
    const anna = overview.averages.find((a) => a.teacherId === "t1");
    expect(anna?.count).toBe(3);
    expect(anna?.average).toBe(8);
    const igor = overview.averages.find((a) => a.teacherId === "t2");
    expect(igor?.count).toBe(0);
    expect(igor?.average).toBeNull();

    const onlyAttention = await listPressLessonRatings(t.db, press, {
      period: "custom",
      from: "2025-04-01",
      to: "2025-04-30",
      attentionOnly: true,
      now,
    });
    expect(onlyAttention.ratings.every((r) => r.score <= 6)).toBe(true);
    expect(onlyAttention.ratings).toHaveLength(1);

    const previous = await listPressLessonRatings(t.db, press, {
      period: "previous_month",
      now: fromAppWall(2025, 5, 3, 12, 0),
    });
    expect(previous.ratings).toHaveLength(3);
    const currentMay = await listPressLessonRatings(t.db, press, {
      period: "current_month",
      now: fromAppWall(2025, 5, 3, 12, 0),
    });
    expect(currentMay.ratings).toHaveLength(0);
    const annaMay = currentMay.averages.find((a) => a.teacherId === "t1");
    expect(annaMay?.count).toBe(0);
    expect(annaMay?.average).toBeNull();

    const sameLessonRows = await t.db
      .select()
      .from(lessonRatings)
      .where(eq(lessonRatings.lessonId, "lr_done"));
    expect(sameLessonRows).toHaveLength(2);
    expect(
      overview.ratings.filter((r) => r.lessonId === "lr_done")
    ).toHaveLength(2);

    await expect(
      listPressLessonRatings(t.db, student, { period: "all" })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      submitLessonRating(t.db, press, { lessonId: "lr_low", score: 4, comment: "x" })
    ).rejects.toMatchObject({ status: 403 });

    const leftover = await t.db
      .select()
      .from(lessonRatings)
      .where(
        and(
          eq(lessonRatings.lessonId, "lr_future"),
          eq(lessonRatings.studentId, "s1")
        )
      );
    expect(leftover).toHaveLength(0);
  });
});
