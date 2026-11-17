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
  saveStudentOnboardingAvailability,
  saveStudentOnboardingProfile,
  updateStudentAvailabilityByStaff,
} from "@/server/services/student-onboarding-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("student invite onboarding + availability", () => {
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

  it("runs invite → register → profile → availability → director card", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asDirector(t.db);

    const invite = await createStudentEnrollmentInvitation(t.db, director);
    expect(invite.inviteUrl).toContain("/invite/");
    expect(invite.onboardingStatus).toBe("invited");
    const rawToken = invite.inviteUrl.split("/invite/")[1]!;

    const [pending] = await t.db
      .select()
      .from(students)
      .where(eq(students.id, invite.studentId))
      .limit(1);
    expect(pending.onboardingStatus).toBe("invited");
    expect(pending.fullName).toBe("Новый ученик");

    const directorBoot = await buildBootstrap(t.db, director);
    expect(
      directorBoot.students.some((s) => s.id === invite.studentId)
    ).toBe(false);

    const listed = await (
      await import("@/server/services/student-onboarding-service")
    ).listStudentEnrollmentInvitations(t.db, director);
    const pendingRow = listed.invitations.find(
      (r) => r.studentId === invite.studentId
    );
    expect(pendingRow?.status).toBe("awaiting_registration");
    expect(pendingRow?.canCopyLink).toBe(true);
    expect(pendingRow?.inviteUrl).toContain("/invite/");

    const accepted = await acceptInvitation(t.db, {
      rawToken,
      email: "new.student@example.com",
      password: DEMO_PASSWORD,
      passwordConfirm: DEMO_PASSWORD,
    });
    expect(accepted.role).toBe("student");
    expect(accepted.studentId).toBe(invite.studentId);
    expect(accepted.onboardingStatus).toBe("profile_pending");

    const listedAfterAccept = await (
      await import("@/server/services/student-onboarding-service")
    ).listStudentEnrollmentInvitations(t.db, director);
    expect(
      listedAfterAccept.invitations.find((r) => r.studentId === invite.studentId)
        ?.status
    ).toBe("filling_profile");

    await expect(
      acceptInvitation(t.db, {
        rawToken,
        email: "other@example.com",
        password: DEMO_PASSWORD,
        passwordConfirm: DEMO_PASSWORD,
      })
    ).rejects.toThrow();

    const studentCtx = await resolveAuthContext(
      t.db,
      accepted.session.rawToken
    );

    await expect(
      saveStudentOnboardingAvailability(t.db, studentCtx, [
        { weekday: 1, hourStart: 10 },
        { weekday: 2, hourStart: 11 },
        { weekday: 3, hourStart: 12 },
      ])
    ).rejects.toThrow();

    const profile = await saveStudentOnboardingProfile(t.db, studentCtx, {
      fullName: "Иван Иванов",
      telegram: "@ivan",
      parentName: "Мария Иванова",
      parentContacts: "@mama",
      grade: "10",
      learningGoal: "ЕГЭ",
      notes: "ок",
    });
    expect(profile.onboardingStatus).toBe("availability_pending");

    await expect(
      saveStudentOnboardingAvailability(t.db, studentCtx, [
        { weekday: 1, hourStart: 10 },
        { weekday: 2, hourStart: 11 },
      ])
    ).rejects.toThrow(/минимум/i);

    const done = await saveStudentOnboardingAvailability(t.db, studentCtx, [
      { weekday: 1, hourStart: 10 },
      { weekday: 2, hourStart: 11 },
      { weekday: 3, hourStart: 12 },
    ]);
    expect(done.onboardingStatus).toBe("complete");
    expect(done.availabilitySlots).toHaveLength(3);

    const [complete] = await t.db
      .select()
      .from(students)
      .where(eq(students.id, invite.studentId))
      .limit(1);
    expect(complete.onboardingStatus).toBe("complete");
    expect(complete.fullName).toBe("Иван Иванов");
    expect(complete.parentName).toBe("Мария Иванова");
    expect(complete.learningGoal).toBe("ЕГЭ");

    const slots = await t.db
      .select()
      .from(studentAvailabilitySlots)
      .where(eq(studentAvailabilitySlots.studentId, invite.studentId));
    expect(slots).toHaveLength(3);

    const directorAfter = await buildBootstrap(t.db, director);
    const card = directorAfter.students.find((s) => s.id === invite.studentId);
    expect(card?.fullName).toBe("Иван Иванов");
    expect(card?.onboardingStatus).toBe("complete");
    expect(card?.availabilitySlots?.length).toBe(3);

    const listedDone = await (
      await import("@/server/services/student-onboarding-service")
    ).listStudentEnrollmentInvitations(t.db, director);
    expect(
      listedDone.invitations.find((r) => r.studentId === invite.studentId)
        ?.status
    ).toBe("completed");

    await updateStudentAvailabilityByStaff(t.db, director, invite.studentId, [
      { weekday: 5, hourStart: 18 },
    ]);
    const view = await getStudentAvailabilityForViewer(
      t.db,
      director,
      invite.studentId
    );
    expect(view.availabilitySlots).toEqual([{ weekday: 5, hourStart: 18 }]);

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

  it("hides incomplete students from teacher bootstrap", async () => {
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
  });
});
