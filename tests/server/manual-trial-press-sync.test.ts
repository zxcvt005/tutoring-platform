import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { manualTrialLessons, teachers } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  listManualTrialLessons,
  updateManualTrialLesson,
} from "@/server/services/manual-trial-lessons-service";
import {
  createTrialLesson,
  updateTrialLesson,
} from "@/server/services/trial-lessons-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("manual trial CRM sync with Press trial_lessons", () => {
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

  it("creates/updates one CRM row from Press trial without wiping manual fields", async () => {
    const t = await createTestDb();
    close = t.close;
    const press = await asRole(t.db, "press@demo.local");
    const [teacher] = await t.db.select().from(teachers).limit(1);
    expect(teacher).toBeTruthy();

    const created = await createTrialLesson(t.db, press, {
      prospectName: "Алина Пробная",
      teacherId: teacher!.id,
      startsAt: "2026-09-10T12:00:00+03:00",
      endsAt: "2026-09-10T13:00:00+03:00",
    });

    const trialId = created.trial.id;
    const listed1 = await listManualTrialLessons(t.db, press);
    const linked = listed1.filter((r) => r.trialLessonId === trialId);
    expect(linked).toHaveLength(1);
    expect(linked[0]!.name).toBe("Алина Пробная");
    expect(linked[0]!.lessonDate).toBe("2026-09-10");
    expect(linked[0]!.lessonTime).toBe("12:00");
    expect(linked[0]!.contact).toBe("");
    expect(linked[0]!.attended).toBe(false);

    const afterManual = await updateManualTrialLesson(t.db, press, {
      id: linked[0]!.id,
      expectedUpdatedAt: linked[0]!.updatedAt,
      contact: "@alina",
      attended: true,
      comment: "ручной комментарий",
      hoursPerWeek: 2,
      ratePerHourRub: 2500,
    });
    expect(afterManual.contact).toBe("@alina");
    expect(afterManual.attended).toBe(true);
    expect(afterManual.comment).toBe("ручной комментарий");

    const updated = await updateTrialLesson(t.db, press, trialId, {
      prospectName: "Алина Обновлённая",
      startsAt: "2026-09-11T15:30:00+03:00",
      endsAt: "2026-09-11T16:30:00+03:00",
    });
    expect(updated.trial.prospectName).toBe("Алина Обновлённая");

    const listed2 = await listManualTrialLessons(t.db, press);
    const linked2 = listed2.filter((r) => r.trialLessonId === trialId);
    expect(linked2).toHaveLength(1);
    expect(linked2[0]!.name).toBe("Алина Обновлённая");
    expect(linked2[0]!.lessonDate).toBe("2026-09-11");
    expect(linked2[0]!.lessonTime).toBe("15:30");
    expect(linked2[0]!.contact).toBe("@alina");
    expect(linked2[0]!.attended).toBe(true);
    expect(linked2[0]!.comment).toBe("ручной комментарий");
    expect(linked2[0]!.hoursPerWeek).toBe(2);
    expect(linked2[0]!.ratePerHourRub).toBe(2500);

    // Повторное сохранение без дубля
    await updateTrialLesson(t.db, press, trialId, {
      salesNotes: "ещё раз",
    });
    const listed3 = await listManualTrialLessons(t.db, press);
    const linked3 = listed3.filter((r) => r.trialLessonId === trialId);
    expect(linked3).toHaveLength(1);

    // Связанные имя/дата/время нельзя перезаписать вручную
    await updateManualTrialLesson(t.db, press, {
      id: linked3[0]!.id,
      expectedUpdatedAt: linked3[0]!.updatedAt,
      name: "Хакер",
      lessonDate: "2020-01-01",
      lessonTime: "01:00",
      contact: "@keep",
    });
    const [raw] = await t.db
      .select()
      .from(manualTrialLessons)
      .where(eq(manualTrialLessons.id, linked3[0]!.id))
      .limit(1);
    expect(raw?.name).toBe("Алина Обновлённая");
    expect(raw?.lessonDate).toBe("2026-09-11");
    expect(raw?.lessonTime).toBe("15:30");
    expect(raw?.contact).toBe("@keep");
  });
});
