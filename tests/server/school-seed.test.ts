import { describe, it, expect, afterEach } from "vitest";

import { organizations, testAttempts, tests } from "@/server/db/schema";
import { DEMO_ORG_ID } from "@/server/db/seed";
import {
  SCHOOL_ORG_ID,
  SCHOOL_SEED_EXPECTED,
  seedSchoolOrganization,
  verifySchoolOrganization,
} from "@/server/db/seed-school";
import { schoolPhysicsTests } from "@/server/db/school-physics-catalog";
import { createTestDb } from "../helpers/pg-test";

describe("school QA seed integrity", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  it(
    "creates expected counts and stays idempotent without duplicating content",
    async () => {
      const t = await createTestDb();
      close = t.close;

      const now = new Date(2026, 9, 21, 12, 0, 0, 0);
      const seeded = await seedSchoolOrganization(t.db, now);
      expect(seeded.students).toBe(20);
      expect(seeded.teachers).toBe(3);
      expect(seeded.unassignedStudents).toBe(3);
      expect(seeded.tests).toBe(15);
      expect(seeded.questions).toBeGreaterThanOrEqual(75);
      expect(seeded.pastLessons).toBeGreaterThanOrEqual(
        SCHOOL_SEED_EXPECTED.pastLessonsMin
      );
      expect(seeded.futureLessons).toBeGreaterThanOrEqual(
        SCHOOL_SEED_EXPECTED.futureLessonsMin
      );
      expect(seeded.homeworkAssignments).toBeGreaterThanOrEqual(
        SCHOOL_SEED_EXPECTED.homeworkMin
      );

      const catalog = schoolPhysicsTests();
      const types = new Set(catalog.flatMap((x) => x.questions.map((q) => q.type)));
      expect(types.has("single_choice")).toBe(true);
      expect(types.has("multiple_choice")).toBe(true);
      expect(types.has("short_answer")).toBe(true);
      expect(types.has("numeric")).toBe(true);
      expect(types.has("essay")).toBe(true);

      const { stats, errors } = await verifySchoolOrganization(t.db, now);
      expect(errors).toEqual([]);
      expect(stats.students).toBe(SCHOOL_SEED_EXPECTED.students);
      expect(stats.teachers).toBe(SCHOOL_SEED_EXPECTED.teachers);
      expect(stats.schedules).toBe(SCHOOL_SEED_EXPECTED.schedules);
      expect(stats.payments).toBe(SCHOOL_SEED_EXPECTED.payments);
      expect(stats.tests).toBe(15);

      const orgs = await t.db.select().from(organizations);
      const ids = orgs.map((o) => o.id);
      expect(ids).toContain(DEMO_ORG_ID);
      expect(ids).toContain(SCHOOL_ORG_ID);

      const testsBefore = await t.db.select().from(tests);
      const attemptsBefore = await t.db.select().from(testAttempts);
      await seedSchoolOrganization(t.db, now);
      const again = await verifySchoolOrganization(t.db, now);
      expect(again.errors).toEqual([]);
      expect(again.stats.students).toBe(20);
      expect(again.stats.tests).toBe(15);
      const testsAfter = await t.db.select().from(tests);
      const attemptsAfter = await t.db.select().from(testAttempts);
      expect(testsAfter.filter((x) => x.organizationId === SCHOOL_ORG_ID).length).toBe(
        testsBefore.filter((x) => x.organizationId === SCHOOL_ORG_ID).length
      );
      expect(
        attemptsAfter.length
      ).toBe(attemptsBefore.length);
      expect(attemptsAfter.every((a) => a.attemptNumber <= 2)).toBe(true);
    },
    60_000
  );

  it(
    "keeps student-teacher assignments consistent",
    async () => {
      const t = await createTestDb();
      close = t.close;
      const now = new Date(2026, 9, 21, 12, 0, 0, 0);
      await seedSchoolOrganization(t.db, now);
      const { errors } = await verifySchoolOrganization(t.db, now);
      expect(errors.filter((e) => /конфликт|неизвестн/i.test(e))).toEqual([]);
    },
    60_000
  );
});
