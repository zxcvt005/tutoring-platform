import { describe, it, expect, afterEach } from "vitest";

import { ApiError } from "@/server/errors";
import { resolveAuthContext } from "@/server/authz/context";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { seedSchoolOrganization } from "@/server/db/seed-school";
import { getAssignmentForViewer } from "@/server/services/assignments-service";
import { buildBootstrap } from "@/server/services/bootstrap-service";
import { loginWithPassword } from "@/server/services/auth-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("school history, homework binding and access", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function login(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    email: string
  ) {
    const { session } = await loginWithPassword(db, {
      email,
      password: DEMO_PASSWORD,
    });
    return resolveAuthContext(db, session.rawToken);
  }

  it(
    "keeps users on re-seed, binds HW to lessons, and hides other students",
    async () => {
      const t = await createTestDb();
      close = t.close;
      const now = new Date(2026, 9, 21, 12, 0, 0, 0);
      await seedSchoolOrganization(t.db, now);

      const [before] = await t.db
        .select({
          id: users.id,
          passwordHash: users.passwordHash,
        })
        .from(users)
        .where(eq(users.id, "user_sch_s01"))
        .limit(1);
      expect(before?.passwordHash).toBeTruthy();

      await seedSchoolOrganization(t.db, now);
      const [after] = await t.db
        .select({
          id: users.id,
          passwordHash: users.passwordHash,
        })
        .from(users)
        .where(eq(users.id, "user_sch_s01"))
        .limit(1);
      expect(after?.id).toBe(before?.id);
      expect(after?.passwordHash).toBe(before?.passwordHash);

      const student = await login(t.db, "student01@umba-school.test");
      const data = await buildBootstrap(t.db, student);
      expect(data.lessons.every((l) => l.studentIds.includes("sch_s01"))).toBe(
        true
      );
      expect(data.homeworkAssignments.every((a) => a.studentId === "sch_s01")).toBe(
        true
      );
      expect(data.lessons.length).toBeGreaterThan(10);
      expect(
        data.lessons.some((l) => new Date(l.startsAt).getTime() < now.getTime())
      ).toBe(true);
      expect(
        data.homeworkAssignments.some((a) => a.missedNextLesson)
      ).toBe(true);
      const completed = data.homeworkAssignments.find(
        (a) => a.id === "sch_ha_late_done"
      );
      expect(completed?.status).toBe("reviewed");
      expect(completed?.missedNextLesson).toBe(false);
      expect(completed?.attempt1Answers?.length).toBeGreaterThan(0);

      const bound = data.homeworkAssignments.filter((a) => a.lessonId);
      for (const a of bound) {
        const lesson = data.lessons.find((l) => l.id === a.lessonId);
        expect(lesson, `lesson for ${a.id}`).toBeTruthy();
        expect(lesson?.studentIds).toEqual(["sch_s01"]);
      }

      const other = await login(t.db, "student02@umba-school.test");
      await expect(
        getAssignmentForViewer(t.db, other, "sch_ha_new")
      ).rejects.toBeInstanceOf(ApiError);

      const otherBoot = await buildBootstrap(t.db, other);
      expect(otherBoot.lessons.some((l) => l.id === data.lessons[0]?.id)).toBe(
        false
      );

      const sokolov = await login(t.db, "sokolov@umba-school.test");
      await expect(
        getAssignmentForViewer(t.db, sokolov, "sch_ha_new")
      ).rejects.toBeInstanceOf(ApiError);
      const teacherBoot = await buildBootstrap(t.db, sokolov);
      expect(teacherBoot.lessons.every((l) => l.teacherId === "sch_t2")).toBe(
        true
      );
      expect(
        teacherBoot.homeworkAssignments.every((a) => a.teacherId === "sch_t2")
      ).toBe(true);

      const owner = await getAssignmentForViewer(t.db, student, "sch_ha_new");
      expect(owner.assignment.revealKeys).toBe(false);
      expect(
        owner.snapshot.questions.some(
          (q: { correctOptionIds?: string[] }) =>
            (q.correctOptionIds?.length ?? 0) > 0
        )
      ).toBeFalsy();
    },
    60_000
  );
});
