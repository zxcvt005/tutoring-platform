import { afterEach, describe, expect, it } from "vitest";

import { resolveAuthContext } from "@/server/authz/context";
import { siteLeads, students } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  createSiteLeadFromLanding,
  deleteSiteLead,
  listSiteLeads,
  updateSiteLeadStatus,
} from "@/server/services/site-leads-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("site leads (Дирекция «Заявки»)", () => {
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

  it("creates a public lead, lists it for director, updates status, and deletes without touching students", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const beforeStudents = await t.db.select({ id: students.id }).from(students);

    const created = await createSiteLeadFromLanding(t.db, {
      studentName: "Илья",
      gradeId: "11",
      level: "около 55",
      parentName: "Ольга",
      contact: "+7 900 222-33-44",
      comment: "Хотим диагностику",
    });
    expect(created.id.startsWith("sl_")).toBe(true);

    const listed = await listSiteLeads(t.db, director);
    const lead = listed.find((row) => row.id === created.id);
    expect(lead).toMatchObject({
      studentName: "Илья",
      grade: "11",
      level: "около 55",
      parentName: "Ольга",
      contact: "+7 900 222-33-44",
      comment: "Хотим диагностику",
      status: "Новая",
    });

    const updated = await updateSiteLeadStatus(t.db, director, {
      id: created.id,
      status: "Диагностика",
      updatedAt: lead!.updatedAt,
    });
    expect(updated.status).toBe("Диагностика");

    await deleteSiteLead(t.db, director, created.id);
    const after = await listSiteLeads(t.db, director);
    expect(after.find((row) => row.id === created.id)).toBeUndefined();

    const leftover = await t.db.select().from(siteLeads);
    expect(leftover.find((row) => row.id === created.id)).toBeUndefined();

    const afterStudents = await t.db.select({ id: students.id }).from(students);
    expect(afterStudents.map((s) => s.id).sort()).toEqual(
      beforeStudents.map((s) => s.id).sort()
    );
  });

  it("rejects invalid public payloads and blocks non-directors", async () => {
    const t = await createTestDb();
    close = t.close;

    await expect(
      createSiteLeadFromLanding(t.db, {
        studentName: "И",
        gradeId: "vip",
        level: "",
        parentName: "О",
        contact: "нет",
        comment: "",
      })
    ).rejects.toMatchObject({ status: 400 });

    const student = await asRole(t.db, "s1@demo.local");
    await expect(listSiteLeads(t.db, student)).rejects.toMatchObject({
      code: "forbidden",
    });
    const press = await asRole(t.db, "press@demo.local");
    await expect(listSiteLeads(t.db, press)).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

