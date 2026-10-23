import { describe, it, expect, afterEach } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  createLessonSchedule,
  materializeSchedule,
} from "@/server/services/schedule-service";
import { upsertLesson } from "@/server/services/platform-mutations";
import { lessons } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("schedule service recurring", () => {
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

  it("createLessonSchedule does not create past lessons", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asAnna(t.db);
    const now = new Date(2026, 9, 14, 18, 0, 0, 0); // ср 18:00

    const result = await createLessonSchedule(
      t.db,
      anna,
      {
        teacherId: "t1",
        studentIds: ["s1"],
        weekdays: [3], // среда — сегодня, но 16:00 уже прошло (now=18:00)
        startTime: "16:00",
        durationMin: 60,
        subject: "Кинематика",
        activeFrom: now.toISOString(),
      },
      now
    );

    expect(result.created).toBeGreaterThan(0);
    const rows = await t.db
      .select()
      .from(lessons)
      .where(eq(lessons.scheduleId, result.id));
    expect(rows.every((r) => r.startsAt.getTime() > now.getTime())).toBe(true);
    // первое — будущая среда (не сегодня 16:00 задним числом); дата может сдвинуться при конфликте seed
    expect(rows[0]?.startsAt.getDay()).toBe(3);
    expect(rows[0]!.startsAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it("materialize is idempotent", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asAnna(t.db);
    const now = new Date(2026, 9, 14, 10, 0, 0, 0);

    const created = await createLessonSchedule(
      t.db,
      anna,
      {
        teacherId: "t1",
        studentIds: ["s2"],
        weekdays: [2, 4],
        startTime: "19:30",
        durationMin: 60,
        subject: "Оптика",
      },
      now
    );

    const again = await materializeSchedule(
      t.db,
      anna.organizationId,
      created.id,
      now
    );
    expect(again).toBe(0);
  });

  it("creates a weekly series from the slot weekday without an end date", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asAnna(t.db);
    const slotDay = new Date(2026, 9, 15, 10, 0, 0, 0); // чт
    const result = await createLessonSchedule(
      t.db,
      anna,
      {
        teacherId: "t1",
        studentIds: ["s1"],
        weekdays: [4],
        startTime: "11:00",
        durationMin: 60,
        activeFrom: slotDay.toISOString(),
      },
      slotDay
    );
    expect(result.created).toBeGreaterThan(0);
    const rows = await t.db
      .select()
      .from(lessons)
      .where(eq(lessons.scheduleId, result.id));
    expect(rows.every((r) => r.startsAt.getDay() === 4)).toBe(true);
  });

  it("one-off upsert creates a single planned slot without a schedule series", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asAnna(t.db);
    const startsAt = new Date(Date.now() + 3 * 86400_000);
    startsAt.setHours(12, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
    const saved = await upsertLesson(t.db, anna, {
      teacherId: "t1",
      studentIds: ["s3"],
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "planned",
    });
    expect(saved.ok).toBe(true);
    const [row] = await t.db
      .select()
      .from(lessons)
      .where(eq(lessons.id, saved.id!))
      .limit(1);
    expect(row?.scheduleId).toBeNull();
  });

  it("upsertLesson rejects new planned lesson in the past", async () => {
    const t = await createTestDb();
    close = t.close;
    const anna = await asAnna(t.db);
    const past = new Date(Date.now() - 3600_000).toISOString();
    const end = new Date(Date.now() - 1800_000).toISOString();

    await expect(
      upsertLesson(t.db, anna, {
        teacherId: "t1",
        studentIds: ["s1"],
        startsAt: past,
        endsAt: end,
        status: "planned",
        subject: "Прошлое",
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});
