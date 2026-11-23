import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { resolveAuthContext } from "@/server/authz/context";
import {
  accountInvitations,
  studentAvailabilitySlots,
  students,
} from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { buildBootstrap } from "@/server/services/bootstrap-service";
import { acceptInvitation } from "@/server/services/invitation-service";
import {
  createStudentEnrollmentInvitation,
  getStudentAvailabilityForViewer,
  listStudentEnrollmentInvitations,
  saveStudentOnboardingAvailability,
  saveStudentOnboardingProfile,
  updateStudentAvailabilityByStaff,
} from "@/server/services/student-onboarding-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("student invite onboarding + directory visibility", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function asDirector(db: Awaited<ReturnType<typeof createTestDb>>["db"]) {
    const { session } = await loginWithPassword(db, {
      email: "director@demo.local",
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, session.rawToken);
  }

  async function asPress(db: Awaited<ReturnType<typeof createTestDb>>["db"]) {
    const { session } = await loginWithPassword(db, {
      email: "press@demo.local",
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, session.rawToken);
  }

  it("1. creating invite link does not put student in general directory", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);
    const press = await asPress(t.db);

    const invite = await createStudentEnrollmentInvitation(t.db, director);
    expect(invite.onboardingStatus).toBe("invited");

    const [pending] = await t.db
      .select()
      .from(students)
      .where(eq(students.id, invite.studentId))
      .limit(1);
    expect(pending.onboardingStatus).toBe("invited");
    expect(pending.fullName).toBe("Новый ученик");

    const directorBoot = await buildBootstrap(t.db, director);
    const pressBoot = await buildBootstrap(t.db, press);
    expect(directorBoot.students.some((s) => s.id === invite.studentId)).toBe(
      false
    );
    expect(pressBoot.students.some((s) => s.id === invite.studentId)).toBe(
      false
    );

    const listed = await listStudentEnrollmentInvitations(t.db, director);
    expect(
      listed.invitations.find((r) => r.studentId === invite.studentId)?.status
    ).toBe("awaiting_registration");
  });

  it("2. opening invite / accepting without questionnaire keeps student out of directory", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);
    const invite = await createStudentEnrollmentInvitation(t.db, director);
    const rawToken = invite.inviteUrl.split("/invite/")[1]!;

    const accepted = await acceptInvitation(t.db, {
      rawToken,
      email: "pending.profile@example.com",
      password: DEMO_PASSWORD,
      passwordConfirm: DEMO_PASSWORD,
    });
    expect(accepted.onboardingStatus).toBe("profile_pending");

    const boot = await buildBootstrap(t.db, director);
    expect(boot.students.some((s) => s.id === invite.studentId)).toBe(false);

    const listed = await listStudentEnrollmentInvitations(t.db, director);
    expect(
      listed.invitations.find((r) => r.studentId === invite.studentId)?.status
    ).toBe("filling_profile");
  });

  it("3. submitting questionnaire without availability puts student in directory", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);
    const press = await asPress(t.db);
    const invite = await createStudentEnrollmentInvitation(t.db, director);
    const rawToken = invite.inviteUrl.split("/invite/")[1]!;

    const accepted = await acceptInvitation(t.db, {
      rawToken,
      email: "profile.only@example.com",
      password: DEMO_PASSWORD,
      passwordConfirm: DEMO_PASSWORD,
    });
    const studentCtx = await resolveAuthContext(
      t.db,
      accepted.session.rawToken
    );

    const profile = await saveStudentOnboardingProfile(t.db, studentCtx, {
      fullName: "Анна Без Времени",
      telegram: "@anna",
      parentName: "Родитель Анны",
      parentContacts: "@parent",
      grade: "9",
      learningGoal: "ОГЭ",
      notes: null,
    });
    expect(profile.onboardingStatus).toBe("complete");

    const slots = await t.db
      .select()
      .from(studentAvailabilitySlots)
      .where(eq(studentAvailabilitySlots.studentId, invite.studentId));
    expect(slots).toHaveLength(0);

    const directorBoot = await buildBootstrap(t.db, director);
    const pressBoot = await buildBootstrap(t.db, press);
    const card = directorBoot.students.find((s) => s.id === invite.studentId);
    expect(card?.fullName).toBe("Анна Без Времени");
    expect(card?.onboardingStatus).toBe("complete");
    expect(card?.parentName).toBe("Родитель Анны");
    expect(card?.learningGoal).toBe("ОГЭ");
    expect(pressBoot.students.some((s) => s.id === invite.studentId)).toBe(
      true
    );
  });

  it("4. submitting questionnaire then optional availability still lists once", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);
    const invite = await createStudentEnrollmentInvitation(t.db, director);
    const rawToken = invite.inviteUrl.split("/invite/")[1]!;

    const accepted = await acceptInvitation(t.db, {
      rawToken,
      email: "with.slots@example.com",
      password: DEMO_PASSWORD,
      passwordConfirm: DEMO_PASSWORD,
    });
    const studentCtx = await resolveAuthContext(
      t.db,
      accepted.session.rawToken
    );

    await saveStudentOnboardingProfile(t.db, studentCtx, {
      fullName: "Иван Иванов",
      telegram: "@ivan",
      parentName: "Мария Иванова",
      parentContacts: "@mama",
      grade: "10",
      learningGoal: "ЕГЭ",
      notes: "ок",
    });

    const beforeSlots = await buildBootstrap(t.db, director);
    expect(beforeSlots.students.some((s) => s.id === invite.studentId)).toBe(
      true
    );

    const done = await saveStudentOnboardingAvailability(t.db, studentCtx, [
      { weekday: 1, hourStart: 10 },
      { weekday: 2, hourStart: 11 },
      { weekday: 3, hourStart: 12 },
    ]);
    expect(done.onboardingStatus).toBe("complete");
    expect(done.availabilitySlots).toHaveLength(3);

    const after = await buildBootstrap(t.db, director);
    const matches = after.students.filter((s) => s.id === invite.studentId);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.availabilitySlots?.length).toBe(3);
  });

  it("5. resubmitting profile / reusing invite does not create duplicates", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);
    const invite = await createStudentEnrollmentInvitation(t.db, director);
    const rawToken = invite.inviteUrl.split("/invite/")[1]!;

    const accepted = await acceptInvitation(t.db, {
      rawToken,
      email: "nodupe@example.com",
      password: DEMO_PASSWORD,
      passwordConfirm: DEMO_PASSWORD,
    });
    const studentCtx = await resolveAuthContext(
      t.db,
      accepted.session.rawToken
    );

    await saveStudentOnboardingProfile(t.db, studentCtx, {
      fullName: "Первый",
      telegram: "@one",
      parentName: "Родитель",
      parentContacts: "@p",
      grade: "8",
      learningGoal: "Цель",
    });
    await saveStudentOnboardingProfile(t.db, studentCtx, {
      fullName: "Второй Раз",
      telegram: "@two",
      parentName: "Родитель 2",
      parentContacts: "@p2",
      grade: "9",
      learningGoal: "Цель 2",
    });

    await expect(
      acceptInvitation(t.db, {
        rawToken,
        email: "other@example.com",
        password: DEMO_PASSWORD,
        passwordConfirm: DEMO_PASSWORD,
      })
    ).rejects.toThrow();

    const sameIdRows = await t.db
      .select()
      .from(students)
      .where(eq(students.id, invite.studentId));
    expect(sameIdRows).toHaveLength(1);
    expect(sameIdRows[0]?.fullName).toBe("Второй Раз");

    const boot = await buildBootstrap(t.db, director);
    expect(boot.students.filter((s) => s.id === invite.studentId)).toHaveLength(
      1
    );

    const [invRow] = await t.db
      .select()
      .from(accountInvitations)
      .where(
        and(
          eq(accountInvitations.studentId, invite.studentId),
          eq(accountInvitations.organizationId, director.organizationId)
        )
      )
      .limit(1);
    expect(invRow?.usedAt).toBeTruthy();
  });

  it("lets press create invites visible to director and vice versa", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);
    const press = await asPress(t.db);

    const fromPress = await createStudentEnrollmentInvitation(t.db, press);
    const fromDirector = await createStudentEnrollmentInvitation(t.db, director);

    const listedByPress = await listStudentEnrollmentInvitations(t.db, press);
    const listedByDirector = await listStudentEnrollmentInvitations(
      t.db,
      director
    );

    expect(
      listedByPress.invitations.some((r) => r.studentId === fromDirector.studentId)
    ).toBe(true);
    expect(
      listedByDirector.invitations.some((r) => r.studentId === fromPress.studentId)
    ).toBe(true);
  });

  it("forbids teacher from creating enrollment invitations", async () => {
    const t = await createTestDb();
    close = t.close;
    const { session } = await loginWithPassword(t.db, {
      email: "anna@example.com",
      password: DEMO_PASSWORD,
    });
    const teacher = await resolveAuthContext(t.db, session.rawToken);
    await expect(
      createStudentEnrollmentInvitation(t.db, teacher)
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("hides incomplete students from teacher bootstrap until questionnaire", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);
    const invite = await createStudentEnrollmentInvitation(t.db, director);

    await t.db
      .update(students)
      .set({
        primaryTeacherId: "t1",
        onboardingStatus: "profile_pending",
        fullName: "Незавершённый",
      })
      .where(eq(students.id, invite.studentId));

    const { session } = await loginWithPassword(t.db, {
      email: "anna@example.com",
      password: DEMO_PASSWORD,
    });
    const teacher = await resolveAuthContext(t.db, session.rawToken);
    const boot = await buildBootstrap(t.db, teacher);
    expect(boot.students.some((s) => s.id === invite.studentId)).toBe(false);

    await expect(
      getStudentAvailabilityForViewer(t.db, teacher, invite.studentId)
    ).rejects.toThrow();

    await t.db
      .update(students)
      .set({ onboardingStatus: "complete", fullName: "Готовый" })
      .where(eq(students.id, invite.studentId));

    const bootAfter = await buildBootstrap(t.db, teacher);
    expect(bootAfter.students.some((s) => s.id === invite.studentId)).toBe(
      true
    );

    await updateStudentAvailabilityByStaff(t.db, director, invite.studentId, [
      { weekday: 5, hourStart: 18 },
    ]);
    const view = await getStudentAvailabilityForViewer(
      t.db,
      teacher,
      invite.studentId
    );
    expect(view.availabilitySlots).toEqual([{ weekday: 5, hourStart: 18 }]);
  });

  it("legacy availability_pending after questionnaire is visible in directory", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);
    const invite = await createStudentEnrollmentInvitation(t.db, director);

    await t.db
      .update(students)
      .set({
        onboardingStatus: "availability_pending",
        fullName: "Legacy Анкета",
        telegram: "@legacy",
        parentName: "Родитель",
        parentContacts: "@p",
        grade: "10",
        learningGoal: "Цель",
      })
      .where(eq(students.id, invite.studentId));

    const boot = await buildBootstrap(t.db, director);
    expect(boot.students.some((s) => s.id === invite.studentId)).toBe(true);
  });
});
