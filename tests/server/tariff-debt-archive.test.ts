import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { students } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import { getDirectionBalance } from "@/server/services/lesson-balance";
import {
  assertStudentLearningAccess,
  resolveLearningAccess,
} from "@/server/services/learning-access";
import {
  archiveStudent,
  restoreStudent,
  setAttendance,
} from "@/server/services/platform-mutations";
import {
  makePlannedLesson,
  physicsDirectionId,
  seedPaidLessons,
} from "../helpers/commerce";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("lesson debt and student archive", () => {
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

  it("archiving a student in debt does not erase ledger balance", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    const directionId = await physicsDirectionId(t.db, director.organizationId);
    await seedPaidLessons(t.db, director, "s11", {
      directionId,
      lessons: 1,
    });

    const lessonId = await makePlannedLesson(t.db, anna, {
      studentIds: ["s11"],
      directionId,
    });
    await setAttendance(t.db, anna, lessonId, "s11", "present");

    const lesson2 = await makePlannedLesson(t.db, anna, {
      studentIds: ["s11"],
      directionId,
      slotHour: 14,
    });
    await setAttendance(t.db, anna, lesson2, "s11", "present");

    const balance = await getDirectionBalance(
      t.db,
      director.organizationId,
      "s11",
      directionId
    );
    expect(balance.remaining).toBe(-1);

    await archiveStudent(t.db, director, {
      id: "s11",
      reason: "stopped",
    });

    const [row] = await t.db
      .select()
      .from(students)
      .where(eq(students.id, "s11"))
      .limit(1);
    expect(row.status).toBe("archived");

    const afterArchive = await getDirectionBalance(
      t.db,
      director.organizationId,
      "s11",
      directionId
    );
    expect(afterArchive.remaining).toBe(-1);
  });

  it("restored student keeps debt balance; learning still gated", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const anna = await asRole(t.db, "anna@example.com");
    const directionId = await physicsDirectionId(t.db, director.organizationId);
    await seedPaidLessons(t.db, director, "s11", {
      directionId,
      lessons: 1,
    });
    const lessonId = await makePlannedLesson(t.db, anna, {
      studentIds: ["s11"],
      directionId,
    });
    await setAttendance(t.db, anna, lessonId, "s11", "present");
    const lesson2 = await makePlannedLesson(t.db, anna, {
      studentIds: ["s11"],
      directionId,
      slotHour: 15,
    });
    await setAttendance(t.db, anna, lesson2, "s11", "present");

    await archiveStudent(t.db, director, {
      id: "s11",
      reason: "other",
    });
    await restoreStudent(t.db, director, "s11");

    const access = await resolveLearningAccess(
      t.db,
      director.organizationId,
      "s11",
      "homework",
      directionId
    );
    expect(access.remaining).toBe(-1);
    await expect(
      assertStudentLearningAccess(
        t.db,
        director,
        "s11",
        "homework",
        directionId
      )
    ).rejects.toMatchObject({ status: 403 });
  });
});