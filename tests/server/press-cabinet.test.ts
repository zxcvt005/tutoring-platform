import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { addAppDateKey, appDateKey, fromAppDateTime, fromAppWall } from "@/lib/app-time";
import { resolveAuthContext } from "@/server/authz/context";
import {
  lessons,
  pressReminders,
  studentInteractionNotes,
  tariffLessonLedger,
  teacherPayrollEntries,
  trialLessons,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { createOrgUser } from "@/server/services/admin-users-service";
import { buildBootstrap } from "@/server/services/bootstrap-service";
import {
  archiveStudent,
  completeLesson,
  upsertLesson,
  upsertTeacher,
} from "@/server/services/platform-mutations";
import { getPressAnalytics } from "@/server/services/press-analytics-service";
import {
  completePressReminder,
  createPressReminder,
  disablePressReminder,
  listPressReminders,
  uncompletePressReminder,
} from "@/server/services/press-reminders-service";
import {
  addStudentInteractionNote,
  getPressStudentCard,
  listPressStudents,
  saveStudentCurrentInfo,
  setStudentNextContact,
} from "@/server/services/student-sales-service";
import { getPayrollOverview } from "@/server/services/teacher-payroll-overview";
import {
  addTrialInteractionNote,
  createTrialLesson,
  getTrialLesson,
  listTrialInteractionNotes,
  listTrialLessons,
  listTrialLessonsForSchedule,
  updateTrialLesson,
} from "@/server/services/trial-lessons-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("press cabinet", () => {
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

  function slot(daysAhead: number, hour: number, minute = 0, duration = 60) {
    const key = addAppDateKey(appDateKey(new Date()), daysAhead);
    const hm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const startsAt = fromAppDateTime(key, hm);
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);
    return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
  }

  it("lets press enter its cabinet but not admin mutations", async () => {
    const t = await createTestDb();
    close = t.close;
    const press = await asRole(t.db, "press@demo.local");
    expect(press.role).toBe("press");
    expect(press.teacherId).toBeNull();
    expect(press.studentId).toBeNull();

    await expect(
      upsertTeacher(t.db, press, {
        fullName: "Hack",
        subjects: [],
        status: "active",
      })
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      getPayrollOverview(t.db, press, {})
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      upsertLesson(t.db, press, {
        teacherId: "t1",
        studentIds: ["s1"],
        ...slot(40, 11),
        status: "planned",
      })
    ).rejects.toMatchObject({ status: 403 });

    const boot = await buildBootstrap(t.db, press);
    expect(boot.students.length).toBeGreaterThan(0);
    expect(boot.teachers[0]?.teacherPay).toBeUndefined();
    expect(boot.payments).toEqual([]);
  });

  it("shows all students including archived and keeps notes history", async () => {
    const t = await createTestDb();
    close = t.close;
    const press = await asRole(t.db, "press@demo.local");
    const director = await asRole(t.db, "director@demo.local");
    await archiveStudent(t.db, director, {
      id: "s6",
      reason: "stopped",
      comment: "тест архива для прессы",
    });
    const list = await listPressStudents(t.db, press, { bucket: "all" });
    expect(list.students.some((s) => s.id === "s6" && s.bucket === "archived")).toBe(
      true
    );
    expect(list.students.some((s) => s.bucket === "new")).toBe(true);
    expect(list.students.some((s) => s.bucket === "active")).toBe(true);

    const studentId = list.students.find((s) => s.bucket !== "archived")!.id;
    await saveStudentCurrentInfo(t.db, press, studentId, "Готовится к ЕГЭ");
    const first = await addStudentInteractionNote(
      t.db,
      press,
      studentId,
      "Позвонили маме"
    );
    const second = await addStudentInteractionNote(
      t.db,
      press,
      studentId,
      "Договорились на пробный"
    );
    expect(first.id).not.toBe(second.id);

    const card = await getPressStudentCard(t.db, press, studentId);
    expect(card.currentInfo).toBe("Готовится к ЕГЭ");
    expect(card.notes.map((n) => n.body)).toEqual([
      "Договорились на пробный",
      "Позвонили маме",
    ]);
    expect(card).not.toHaveProperty("nextContact");

    const noteCount = await t.db
      .select()
      .from(studentInteractionNotes)
      .where(eq(studentInteractionNotes.studentId, studentId));
    expect(noteCount).toHaveLength(2);

    const teacher = await asRole(t.db, "anna@example.com");
    const teacherBoot = await buildBootstrap(t.db, teacher);
    const seen = teacherBoot.students.find((s) => s.id === studentId);
    expect(seen?.notes ?? "").not.toContain("Готовится к ЕГЭ");
  });

  it("does not turn an old student contact into a personal reminder", async () => {
    const t = await createTestDb();
    close = t.close;
    const press = await asRole(t.db, "press@demo.local");
    const studentId = (await listPressStudents(t.db, press)).students[0]!.id;
    await setStudentNextContact(t.db, press, studentId, {
      active: true,
      dueAt: new Date(Date.now() - 60_000).toISOString(),
      reason: "Старый контакт",
    });
    const reminders = await listPressReminders(t.db, press, { view: "all" });
    expect(reminders.reminders).toHaveLength(0);
    const created = await t.db.select().from(pressReminders);
    expect(created).toHaveLength(0);
  });

  it("creates, completes and isolates personal reminders", async () => {
    const t = await createTestDb();
    close = t.close;
    const press = await asRole(t.db, "press@demo.local");
    const now = fromAppWall(2026, 10, 27, 12, 0);
    const todayAt = fromAppWall(2026, 10, 27, 9, 0).toISOString();
    const created = await createPressReminder(t.db, press, {
      title: "Перезвонить",
      description: "После пробного",
      kind: "once",
      startAt: todayAt,
    });
    const today = await listPressReminders(t.db, press, { view: "today", now });
    expect(today.reminders.some((r) => r.id === created.reminder.id)).toBe(true);

    const first = await completePressReminder(t.db, press, created.reminder.id, {
      occurrenceAt: created.reminder.currentDueAt,
      now,
    });
    const second = await completePressReminder(t.db, press, created.reminder.id, {
      occurrenceAt: created.reminder.currentDueAt,
      now,
    });
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.completion?.id).toBe(first.completion?.id);

    const after = await listPressReminders(t.db, press, { view: "today", now });
    const todayDone = after.reminders.find((r) => r.id === created.reminder.id);
    expect(todayDone).toBeTruthy();
    expect(todayDone?.completedAt).toBeTruthy();
    const nextDay = await listPressReminders(t.db, press, {
      view: "today",
      now: fromAppWall(2026, 10, 28, 12, 0),
    });
    expect(nextDay.reminders.some((r) => r.id === created.reminder.id)).toBe(
      false
    );

    await uncompletePressReminder(t.db, press, created.reminder.id, {
      occurrenceAt: created.reminder.currentDueAt,
    });
    const undone = await listPressReminders(t.db, press, { view: "today", now });
    expect(
      undone.reminders.find((r) => r.id === created.reminder.id)?.completedAt
    ).toBeNull();
    await completePressReminder(t.db, press, created.reminder.id, {
      occurrenceAt: created.reminder.currentDueAt,
      now,
    });
    const done = await listPressReminders(t.db, press, {
      view: "completed",
      now,
    });
    expect(done.reminders.some((r) => r.id === created.reminder.id)).toBe(true);

    const series = await createPressReminder(t.db, press, {
      title: "Ежедневный обзвон",
      kind: "recurring",
      frequency: "daily",
      startAt: todayAt,
    });
    await completePressReminder(t.db, press, series.reminder.id, {
      occurrenceAt: series.reminder.currentDueAt,
      now,
    });
    const todayAfterRecurring = await listPressReminders(t.db, press, {
      view: "today",
      now,
    });
    const recurringToday = todayAfterRecurring.reminders.find(
      (r) => r.id === series.reminder.id
    );
    expect(recurringToday?.completedAt).toBeTruthy();
    expect(recurringToday?.occurrenceAt).toBe(series.reminder.currentDueAt);
    const afterOne = await listPressReminders(t.db, press, { view: "all", now });
    const live = afterOne.reminders.find((r) => r.id === series.reminder.id);
    expect(live?.status).toBe("active");
    expect(live?.occurrenceAt).not.toBe(series.reminder.currentDueAt);

    await disablePressReminder(t.db, press, series.reminder.id);
    const todayAfterDisable = await listPressReminders(t.db, press, {
      view: "today",
      now: fromAppWall(2026, 10, 28, 12, 0),
    });
    expect(
      todayAfterDisable.reminders.some((r) => r.id === series.reminder.id)
    ).toBe(false);

    const director = await asRole(t.db, "director@demo.local");
    await createOrgUser(t.db, director, {
      email: "press2@demo.local",
      password: DEMO_PASSWORD,
      fullName: "Второй Пресс",
      role: "press",
    });
    const press2 = await asRole(t.db, "press2@demo.local");
    const other = await listPressReminders(t.db, press2, { view: "all", now });
    expect(other.reminders).toHaveLength(0);
    await expect(
      completePressReminder(t.db, press2, created.reminder.id)
    ).rejects.toMatchObject({ status: 403 });
  });

  it("keeps trial interaction history on the trial, not by name", async () => {
    const t = await createTestDb();
    close = t.close;
    const press = await asRole(t.db, "press@demo.local");
    const a = await createTrialLesson(t.db, press, {
      prospectName: "Одинаковое Имя",
      teacherId: "t1",
      ...slot(21, 7, 0),
    });
    const b = await createTrialLesson(t.db, press, {
      prospectName: "Одинаковое Имя",
      teacherId: "t1",
      ...slot(22, 7, 0),
    });
    await addTrialInteractionNote(
      t.db,
      press,
      a.trial.id,
      "Договорились перенести"
    );
    const notesA = await listTrialInteractionNotes(t.db, press, a.trial.id);
    const notesB = await listTrialInteractionNotes(t.db, press, b.trial.id);
    expect(notesA.notes.map((n) => n.body)).toEqual(["Договорились перенести"]);
    expect(notesB.notes).toHaveLength(0);

    const card = await getTrialLesson(t.db, press, a.trial.id);
    expect("notes" in card && card.notes?.[0]?.body).toBe(
      "Договорились перенести"
    );

    const teacher = await asRole(t.db, "anna@example.com");
    await expect(
      listTrialInteractionNotes(t.db, teacher, a.trial.id)
    ).rejects.toMatchObject({ status: 403 });
    const publicTrial = await getTrialLesson(t.db, teacher, a.trial.id);
    expect(publicTrial).not.toHaveProperty("notes");

    const listed = await listTrialLessons(t.db, press, {});
    expect(listed.trials[0]?.prospectName).toBeTruthy();
  });

  it("creates a trial without a student account and shows it on the teacher schedule", async () => {
    const t = await createTestDb();
    close = t.close;
    const press = await asRole(t.db, "press@demo.local");
    const time = slot(21, 7, 0);
    const created = await createTrialLesson(t.db, press, {
      prospectName: "Потенциал Иванов",
      teacherId: "t1",
      ...time,
      teacherNotes: "Проверить базу",
      salesNotes: "Внутренняя заметка продажника",
    });
    expect(created.trial.prospectName).toBe("Потенциал Иванов");
    expect(
      "salesNotes" in created.trial ? created.trial.salesNotes : undefined
    ).toBe("Внутренняя заметка продажника");

    const lessonRows = await t.db.select().from(lessons);
    expect(lessonRows.some((l) => l.id === created.trial.id)).toBe(false);

    const teacher = await asRole(t.db, "anna@example.com");
    const publicTrials = await listTrialLessonsForSchedule(t.db, teacher);
    const shown = publicTrials.find((x) => x.id === created.trial.id);
    expect(shown?.prospectName).toBe("Потенциал Иванов");
    expect(shown?.teacherNotes).toBe("Проверить базу");
    expect(shown && "salesNotes" in shown).toBe(false);

    const teacherBoot = await buildBootstrap(t.db, teacher);
    expect(teacherBoot.trialLessons.some((x) => x.id === created.trial.id)).toBe(
      true
    );

    await updateTrialLesson(t.db, press, created.trial.id, {
      agreementStatus: "agreed",
    });
    const updated = await updateTrialLesson(t.db, press, created.trial.id, {
      lessonStatus: "completed",
    });
    expect(updated.trial.agreementStatus).toBe("agreed");
    expect(updated.trial.lessonStatus).toBe("completed");
  });

  it("blocks overlaps with regular lessons and other trials, including concurrent requests", async () => {
    const t = await createTestDb();
    close = t.close;
    const press = await asRole(t.db, "press@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    const time = slot(22, 6, 15);

    await upsertLesson(t.db, anna, {
      teacherId: "t1",
      studentIds: ["s1"],
      ...time,
      status: "planned",
      subject: "Обычный урок",
    });

    await expect(
      createTrialLesson(t.db, press, {
        prospectName: "Конфликт",
        teacherId: "t1",
        startsAt: new Date(
          new Date(time.startsAt).getTime() + 15 * 60_000
        ).toISOString(),
        endsAt: new Date(
          new Date(time.endsAt).getTime() + 15 * 60_000
        ).toISOString(),
      })
    ).rejects.toMatchObject({ status: 409 });

    const free = slot(23, 6, 15);
    const first = await createTrialLesson(t.db, press, {
      prospectName: "Первый",
      teacherId: "t1",
      ...free,
    });

    const results = await Promise.allSettled([
      createTrialLesson(t.db, press, {
        prospectName: "Второй",
        teacherId: "t1",
        startsAt: new Date(
          new Date(free.startsAt).getTime() + 10 * 60_000
        ).toISOString(),
        endsAt: new Date(
          new Date(free.endsAt).getTime() + 10 * 60_000
        ).toISOString(),
      }),
      createTrialLesson(t.db, press, {
        prospectName: "Третий",
        teacherId: "t1",
        startsAt: new Date(
          new Date(free.startsAt).getTime() + 20 * 60_000
        ).toISOString(),
        endsAt: new Date(
          new Date(free.endsAt).getTime() + 20 * 60_000
        ).toISOString(),
      }),
    ]);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected.length).toBeGreaterThanOrEqual(1);

    await updateTrialLesson(t.db, press, first.trial.id, {
      lessonStatus: "cancelled",
      cancelReason: "Семья не может",
    });
    const moved = slot(24, 6, 15);
    await updateTrialLesson(t.db, press, first.trial.id, {
      ...moved,
      lessonStatus: "planned",
    });
    const afterCancel = await t.db
      .select()
      .from(trialLessons)
      .where(eq(trialLessons.id, first.trial.id));
    expect(afterCancel[0]?.lessonStatus).toBe("planned");
  });

  it("does not debit tariffs or create teacher payroll for trials", async () => {
    const t = await createTestDb();
    close = t.close;
    const press = await asRole(t.db, "press@demo.local");
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");

    const ledgerBefore = await t.db.select().from(tariffLessonLedger);
    const payBefore = await t.db.select().from(teacherPayrollEntries);

    const time = slot(25, 7, 30);
    await createTrialLesson(t.db, press, {
      prospectName: "Без оплаты",
      teacherId: "t1",
      ...time,
    });

    const ledgerAfter = await t.db.select().from(tariffLessonLedger);
    const payAfter = await t.db.select().from(teacherPayrollEntries);
    expect(ledgerAfter.length).toBe(ledgerBefore.length);
    expect(payAfter.length).toBe(payBefore.length);

    const lessonTime = slot(26, 16);
    const lesson = await upsertLesson(t.db, anna, {
      teacherId: "t1",
      studentIds: ["s1"],
      ...lessonTime,
      status: "planned",
      subject: "Обычный",
    });
    await completeLesson(t.db, anna, {
      lessonId: lesson.id,
      topicId: "tp1",
      attendances: [{ studentId: "s1", status: "present" }],
    });
    const payLater = await t.db.select().from(teacherPayrollEntries);
    expect(payLater.length).toBeGreaterThanOrEqual(payAfter.length);

    await expect(getPayrollOverview(t.db, director, {})).resolves.toBeTruthy();
  });

  it("analytics separates agreement from attendance outcomes", async () => {
    const t = await createTestDb();
    close = t.close;
    const press = await asRole(t.db, "press@demo.local");
    const a = slot(27, 8);
    const b = slot(28, 8);
    const c = slot(29, 8);
    const createdA = await createTrialLesson(t.db, press, {
      prospectName: "A",
      teacherId: "t1",
      ...a,
      agreementStatus: "agreed",
    });
    const createdB = await createTrialLesson(t.db, press, {
      prospectName: "B",
      teacherId: "t1",
      ...b,
      agreementStatus: "not_agreed",
    });
    const createdC = await createTrialLesson(t.db, press, {
      prospectName: "C",
      teacherId: "t1",
      ...c,
    });
    await updateTrialLesson(t.db, press, createdA.trial.id, {
      lessonStatus: "completed",
    });
    await updateTrialLesson(t.db, press, createdB.trial.id, {
      lessonStatus: "no_show",
    });
    await updateTrialLesson(t.db, press, createdC.trial.id, {
      lessonStatus: "cancelled",
      cancelReason: "отмена",
    });

    const from = addAppDateKey(appDateKey(new Date()), -1);
    const to = addAppDateKey(appDateKey(new Date()), 40);
    const { analytics } = await getPressAnalytics(t.db, press, { from, to });
    expect(analytics.created).toBeGreaterThanOrEqual(3);
    expect(analytics.agreed).toBeGreaterThanOrEqual(1);
    expect(analytics.completed).toBeGreaterThanOrEqual(1);
    expect(analytics.noShow).toBeGreaterThanOrEqual(1);
    expect(analytics.cancelled).toBeGreaterThanOrEqual(1);
    expect(analytics.completed).not.toBe(
      analytics.completed + analytics.cancelled + analytics.noShow
    );

    const byTeacher = await getPressAnalytics(t.db, press, {
      from,
      to,
      teacherId: "t1",
    });
    expect(byTeacher.analytics.created).toBeGreaterThanOrEqual(3);
    const other = await getPressAnalytics(t.db, press, {
      from,
      to,
      teacherId: "t2",
    });
    expect(other.analytics.created).toBe(0);
  });
});
