import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import {
  lessonTopics,
  lessons,
  tariffLessonDebitState,
  tariffLessonLedger,
  testAssignments,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  completeLesson,
  setLessonTopics,
  upsertLesson,
} from "@/server/services/platform-mutations";
import {
  adminMarkPaymentPaid,
  assignTariffToStudent,
  upsertTariff,
} from "@/server/services/tariffs-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("multiple lesson topics and homework", () => {
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

  it("stores several topics and several homework assignments without extra debit", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");

    const tariff = await upsertTariff(t.db, director, {
      name: "Мульти-темы",
      price: 1000,
      durationDays: 28,
      lessonsLimit: 8,
      weeklyFrequency: 2,
      features: ["individual_lessons", "homework"],
    });
    const assigned = await assignTariffToStudent(t.db, director, {
      studentId: "s1",
      tariffId: tariff.id,
    });
    await adminMarkPaymentPaid(t.db, director, {
      paymentId: assigned.paymentId,
      reason: "Тест",
    });

    const startsAt = new Date(Date.now() + 2 * 86_400_000);
    startsAt.setHours(16, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
    const created = await upsertLesson(t.db, anna, {
      teacherId: "t1",
      studentIds: ["s1"],
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "planned",
    });
    const pastStart = new Date(Date.now() - 2 * 86_400_000);
    const pastEnd = new Date(pastStart.getTime() + 60 * 60_000);
    await t.db
      .update(lessons)
      .set({ startsAt: pastStart, endsAt: pastEnd })
      .where(eq(lessons.id, created.id));

    await setLessonTopics(t.db, anna, {
      lessonId: created.id,
      topics: [
        { topicId: "tp1" },
        { title: "Свободный разбор" },
      ],
    });

    const links = await t.db
      .select()
      .from(lessonTopics)
      .where(eq(lessonTopics.lessonId, created.id));
    expect(links).toHaveLength(2);
    expect(links.some((r) => r.topicId === "tp1")).toBe(true);
    expect(
      links.some((r) => r.topicId == null && r.title === "Свободный разбор")
    ).toBe(true);

    const [lessonRow] = await t.db
      .select()
      .from(lessons)
      .where(eq(lessons.id, created.id));
    expect(lessonRow?.topicId).toBe("tp1");

    await completeLesson(t.db, anna, {
      lessonId: created.id,
      topics: [
        { topicId: "tp1" },
        { topicId: "tp2" },
        { title: "Свободный разбор" },
      ],
      attendances: [{ studentId: "s1", status: "present" }],
      homeworkAssigns: [
        { homeworkId: "hw1", studentIds: ["s1"] },
        { homeworkId: "hw2", studentIds: ["s1"] },
      ],
    });

    const hw = await t.db
      .select()
      .from(testAssignments)
      .where(eq(testAssignments.lessonId, created.id));
    expect(hw.filter((a) => a.studentId === "s1")).toHaveLength(2);
    expect(hw.some((a) => a.studentId !== "s1")).toBe(false);

    const ledger = await t.db
      .select()
      .from(tariffLessonLedger)
      .where(eq(tariffLessonLedger.lessonId, created.id));
    const net = ledger.reduce((sum, r) => sum + r.delta, 0);
    expect(net).toBe(-1);

    await completeLesson(t.db, anna, {
      lessonId: created.id,
      topics: [{ topicId: "tp1" }, { topicId: "tp2" }],
      attendances: [{ studentId: "s1", status: "present" }],
      homeworkAssigns: [{ homeworkId: "hw1", studentIds: ["s1"] }],
    });

    const ledgerAfter = await t.db
      .select()
      .from(tariffLessonLedger)
      .where(eq(tariffLessonLedger.lessonId, created.id));
    expect(ledgerAfter.reduce((sum, r) => sum + r.delta, 0)).toBe(-1);
    const states = await t.db
      .select()
      .from(tariffLessonDebitState)
      .where(eq(tariffLessonDebitState.lessonId, created.id));
    expect(states).toHaveLength(1);
  });
});
