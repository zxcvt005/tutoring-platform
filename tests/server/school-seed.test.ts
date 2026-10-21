import { describe, it, expect, afterEach } from "vitest";

import { organizations } from "@/server/db/schema";
import { DEMO_ORG_ID } from "@/server/db/seed";
import {
  SCHOOL_ORG_ID,
  SCHOOL_SEED_EXPECTED,
  seedSchoolOrganization,
  verifySchoolOrganization,
} from "@/server/db/seed-school";
import { createTestDb } from "../helpers/pg-test";

describe("school QA seed integrity", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  it("creates expected counts and does not drop org_demo", async () => {
    const t = await createTestDb();
    close = t.close;

    const now = new Date(2026, 9, 21, 12, 0, 0, 0);
    const seeded = await seedSchoolOrganization(t.db, now);
    expect(seeded.students).toBe(20);
    expect(seeded.teachers).toBe(3);
    expect(seeded.unassignedStudents).toBe(3);
    expect(seeded.pastLessons).toBe(10);
    expect(seeded.futureLessons).toBeGreaterThan(0);

    const { stats, errors } = await verifySchoolOrganization(t.db);
    expect(errors).toEqual([]);
    expect(stats.students).toBe(SCHOOL_SEED_EXPECTED.students);
    expect(stats.teachers).toBe(SCHOOL_SEED_EXPECTED.teachers);
    expect(stats.schedules).toBe(SCHOOL_SEED_EXPECTED.schedules);
    expect(stats.payments).toBe(SCHOOL_SEED_EXPECTED.payments);

    const orgs = await t.db.select().from(organizations);
    const ids = orgs.map((o) => o.id);
    expect(ids).toContain(DEMO_ORG_ID);
    expect(ids).toContain(SCHOOL_ORG_ID);

    await seedSchoolOrganization(t.db, now);
    const again = await verifySchoolOrganization(t.db);
    expect(again.errors).toEqual([]);
    expect(again.stats.students).toBe(20);
  });

  it("keeps student-teacher assignments consistent", async () => {
    const t = await createTestDb();
    close = t.close;
    await seedSchoolOrganization(t.db, new Date(2026, 9, 21, 12, 0, 0, 0));
    const { errors } = await verifySchoolOrganization(t.db);
    expect(errors.filter((e) => /конфликт|неизвестн/i.test(e))).toEqual([]);
  });
});
