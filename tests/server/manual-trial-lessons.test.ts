import { count, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { MANUAL_TRIAL_SOURCES } from "@/lib/manual-trial-lessons";
import { resolveAuthContext } from "@/server/authz/context";
import {
  baseLeads,
  manualTrialLessons,
  students,
  trialLessons,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { createBaseLead } from "@/server/services/base-leads-service";
import {
  createManualTrialLesson,
  deleteManualTrialLesson,
  listManualTrialLessons,
  updateManualTrialLesson,
} from "@/server/services/manual-trial-lessons-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("manual trial lessons (Дирекция «Пробные уроки»)", () => {
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

  it("supports CRUD, sources, teacher, checkboxes and numeric fields without touching other tables", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");

    const studentsBefore = await t.db.select({ id: students.id }).from(students);
    const [pressTrialsBefore] = await t.db
      .select({ n: count() })
      .from(trialLessons);
    const baseBefore = await createBaseLead(t.db, director);

    const created = await createManualTrialLesson(t.db, director);
    expect(created.attended).toBe(false);
    expect(created.purchased).toBe(false);
    expect(created.teacher).toBe("");
    expect(created.hoursPerWeek).toBeNull();
    expect(created.ratePerHourRub).toBeNull();
    const [rawCreated] = await t.db
      .select()
      .from(manualTrialLessons)
      .where(eq(manualTrialLessons.id, created.id))
      .limit(1);
    expect(rawCreated?.teacher).toBeNull();

    for (const source of MANUAL_TRIAL_SOURCES) {
      const listed = await listManualTrialLessons(t.db, director);
      const current = listed.find((r) => r.id === created.id)!;
      const updated = await updateManualTrialLesson(t.db, director, {
        id: created.id,
        expectedUpdatedAt: current.updatedAt,
        source,
      });
      expect(updated.source).toBe(source);
    }

    const afterSources = await listManualTrialLessons(t.db, director);
    const cur = afterSources.find((r) => r.id === created.id)!;
    const filled = await updateManualTrialLesson(t.db, director, {
      id: created.id,
      expectedUpdatedAt: cur.updatedAt,
      lessonDate: "2026-08-22",
      lessonTime: "12:00",
      name: "Станислав",
      contact: "+79999999999",
      teacher: "Анна",
      attended: true,
      purchased: true,
      hoursPerWeek: 2,
      ratePerHourRub: 2000,
      comment: "первое занятие 04.09 12:00",
    });
    expect(filled.lessonDate).toBe("2026-08-22");
    expect(filled.lessonTime).toBe("12:00");
    expect(filled.name).toBe("Станислав");
    expect(filled.teacher).toBe("Анна");
    expect(filled.attended).toBe(true);
    expect(filled.purchased).toBe(true);
    expect(filled.hoursPerWeek).toBe(2);
    expect(filled.ratePerHourRub).toBe(2000);

    const listedTeacher = await listManualTrialLessons(t.db, director);
    const curTeacher = listedTeacher.find((r) => r.id === created.id)!;
    const clearedTeacher = await updateManualTrialLesson(t.db, director, {
      id: created.id,
      expectedUpdatedAt: curTeacher.updatedAt,
      teacher: "  ",
    });
    expect(clearedTeacher.teacher).toBe("");
    const [rawCleared] = await t.db
      .select()
      .from(manualTrialLessons)
      .where(eq(manualTrialLessons.id, created.id))
      .limit(1);
    expect(rawCleared?.teacher).toBeNull();

    const other = await createManualTrialLesson(t.db, director);
    await deleteManualTrialLesson(t.db, director, created.id);
    const remaining = await listManualTrialLessons(t.db, director);
    expect(remaining.map((r) => r.id)).toEqual([other.id]);

    const studentsAfter = await t.db.select({ id: students.id }).from(students);
    expect(studentsAfter.map((s) => s.id).sort()).toEqual(
      studentsBefore.map((s) => s.id).sort()
    );

    const [pressTrialsAfter] = await t.db
      .select({ n: count() })
      .from(trialLessons);
    expect(Number(pressTrialsAfter!.n)).toBe(Number(pressTrialsBefore!.n));

    const [baseStillThere] = await t.db
      .select()
      .from(baseLeads)
      .where(eq(baseLeads.id, baseBefore.id))
      .limit(1);
    expect(baseStillThere?.id).toBe(baseBefore.id);

    const gone = await t.db
      .select()
      .from(manualTrialLessons)
      .where(eq(manualTrialLessons.id, created.id));
    expect(gone).toHaveLength(0);
  });

  it("rejects negative numbers, bad source and stale updates", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const created = await createManualTrialLesson(t.db, director);

    await expect(
      updateManualTrialLesson(t.db, director, {
        id: created.id,
        expectedUpdatedAt: created.updatedAt,
        hoursPerWeek: -1,
      })
    ).rejects.toMatchObject({ code: "validation_error" });

    const listed = await listManualTrialLessons(t.db, director);
    const cur = listed.find((r) => r.id === created.id)!;

    await expect(
      updateManualTrialLesson(t.db, director, {
        id: created.id,
        expectedUpdatedAt: cur.updatedAt,
        source: "Неизвестный" as never,
      })
    ).rejects.toMatchObject({ code: "validation_error" });

    const listed2 = await listManualTrialLessons(t.db, director);
    const cur2 = listed2.find((r) => r.id === created.id)!;
    const first = await updateManualTrialLesson(t.db, director, {
      id: created.id,
      expectedUpdatedAt: cur2.updatedAt,
      name: "Леша",
    });

    await expect(
      updateManualTrialLesson(t.db, director, {
        id: created.id,
        expectedUpdatedAt: cur2.updatedAt,
        name: "Устаревшее",
      })
    ).rejects.toMatchObject({ status: 409, code: "conflict" });

    const after = await listManualTrialLessons(t.db, director);
    expect(after.find((r) => r.id === created.id)?.name).toBe(first.name);
  });

  it("forbids non-director roles", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asRole(t.db, "s1@demo.local");
    await expect(listManualTrialLessons(t.db, student)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(createManualTrialLesson(t.db, student)).rejects.toMatchObject({
      code: "forbidden",
    });
    const press = await asRole(t.db, "press@demo.local");
    await expect(listManualTrialLessons(t.db, press)).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
