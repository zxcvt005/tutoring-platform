import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import {
  BASE_LEAD_SOURCES,
  BASE_LEAD_STATUSES,
} from "@/lib/base-leads";
import { resolveAuthContext } from "@/server/authz/context";
import { baseLeads, students } from "@/server/db/schema";
import { loginWithPassword } from "@/server/services/auth-service";
import {
  createBaseLead,
  deleteBaseLead,
  listBaseLeads,
  updateBaseLead,
} from "@/server/services/base-leads-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("base leads (Дирекция «База»)", () => {
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

  it("allows director to create, update, list and delete isolated records", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");

    const beforeStudents = await t.db.select({ id: students.id }).from(students);

    const created = await createBaseLead(t.db, director);
    expect(created.name).toBe("");
    expect(created.source).toBeNull();
    expect(created.status).toBeNull();
    expect(created.path1).toBe(false);
    expect(created.reconciliation).toBe(false);

    for (const source of BASE_LEAD_SOURCES) {
      const listed = await listBaseLeads(t.db, director);
      const current = listed.find((r) => r.id === created.id)!;
      const updated = await updateBaseLead(t.db, director, {
        id: created.id,
        expectedUpdatedAt: current.updatedAt,
        source,
      });
      expect(updated.source).toBe(source);
    }

    for (const status of BASE_LEAD_STATUSES) {
      const listed = await listBaseLeads(t.db, director);
      const current = listed.find((r) => r.id === created.id)!;
      const updated = await updateBaseLead(t.db, director, {
        id: created.id,
        expectedUpdatedAt: current.updatedAt,
        status,
      });
      expect(updated.status).toBe(status);
    }

    const afterStatuses = await listBaseLeads(t.db, director);
    const cur = afterStatuses.find((r) => r.id === created.id)!;
    expect(created.student).toBe("");
    expect(created.parent).toBe("");
    expect(created.teacher).toBe("");

    const filled = await updateBaseLead(t.db, director, {
      id: created.id,
      expectedUpdatedAt: cur.updatedAt,
      name: "Даниил",
      student: "Иван",
      parent: "Мария",
      teacher: "Анна",
      contact: "+79999999999",
      comment: "Очень хороший лид",
      avitoUrl: "https://www.avito.ru/item/1",
      path1: true,
      path2: true,
      path3: false,
      reconciliation: true,
      entryDate: "2026-02-01",
    });
    expect(filled.name).toBe("Даниил");
    expect(filled.student).toBe("Иван");
    expect(filled.parent).toBe("Мария");
    expect(filled.teacher).toBe("Анна");
    expect(filled.contact).toBe("+79999999999");
    expect(filled.comment).toBe("Очень хороший лид");
    expect(filled.avitoUrl).toBe("https://www.avito.ru/item/1");
    expect(filled.path1).toBe(true);
    expect(filled.path2).toBe(true);
    expect(filled.path3).toBe(false);
    expect(filled.reconciliation).toBe(true);
    expect(filled.entryDate).toBe("2026-02-01");

    const other = await createBaseLead(t.db, director);
    await deleteBaseLead(t.db, director, created.id);
    const remaining = await listBaseLeads(t.db, director);
    expect(remaining.map((r) => r.id)).toEqual([other.id]);

    const afterStudents = await t.db.select({ id: students.id }).from(students);
    expect(afterStudents.map((s) => s.id).sort()).toEqual(
      beforeStudents.map((s) => s.id).sort()
    );

    const orphanRows = await t.db
      .select()
      .from(baseLeads)
      .where(eq(baseLeads.id, created.id));
    expect(orphanRows).toHaveLength(0);
  });

  it("rejects stale updates and keeps the newer version", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const created = await createBaseLead(t.db, director);
    const stale = created.updatedAt;

    const first = await updateBaseLead(t.db, director, {
      id: created.id,
      expectedUpdatedAt: stale,
      name: "Кирилл",
    });
    expect(first.name).toBe("Кирилл");

    await expect(
      updateBaseLead(t.db, director, {
        id: created.id,
        expectedUpdatedAt: stale,
        name: "Устаревшее",
      })
    ).rejects.toMatchObject({ status: 409, code: "conflict" });

    const listed = await listBaseLeads(t.db, director);
    expect(listed.find((r) => r.id === created.id)?.name).toBe("Кирилл");
  });

  it("validates source, status and URL on the server", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const created = await createBaseLead(t.db, director);

    await expect(
      updateBaseLead(t.db, director, {
        id: created.id,
        expectedUpdatedAt: created.updatedAt,
        source: "Неизвестный" as never,
      })
    ).rejects.toMatchObject({ code: "validation_error" });

    const again = await listBaseLeads(t.db, director);
    const cur = again.find((r) => r.id === created.id)!;

    await expect(
      updateBaseLead(t.db, director, {
        id: created.id,
        expectedUpdatedAt: cur.updatedAt,
        status: "Выдуманный" as never,
      })
    ).rejects.toMatchObject({ code: "validation_error" });

    const again2 = await listBaseLeads(t.db, director);
    const cur2 = again2.find((r) => r.id === created.id)!;

    await expect(
      updateBaseLead(t.db, director, {
        id: created.id,
        expectedUpdatedAt: cur2.updatedAt,
        avitoUrl: "javascript:alert(1)",
      })
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("forbids non-director roles", async () => {
    const t = await createTestDb();
    close = t.close;
    const student = await asRole(t.db, "s1@demo.local");
    await expect(listBaseLeads(t.db, student)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(createBaseLead(t.db, student)).rejects.toMatchObject({
      code: "forbidden",
    });
    const press = await asRole(t.db, "press@demo.local");
    await expect(listBaseLeads(t.db, press)).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("edits student/parent/teacher and keeps avitoUrl after label rename", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");

    const created = await createBaseLead(t.db, director);
    expect(created.student).toBe("");
    expect(created.parent).toBe("");
    expect(created.teacher).toBe("");

    const withUrl = await updateBaseLead(t.db, director, {
      id: created.id,
      expectedUpdatedAt: created.updatedAt,
      avitoUrl: "https://www.avito.ru/item/legacy",
    });
    expect(withUrl.avitoUrl).toBe("https://www.avito.ru/item/legacy");

    let cur = withUrl;
    for (const [field, value] of [
      ["student", "Пётр"],
      ["parent", "Ольга"],
      ["teacher", "Сергей"],
    ] as const) {
      cur = await updateBaseLead(t.db, director, {
        id: created.id,
        expectedUpdatedAt: cur.updatedAt,
        [field]: value,
      });
      expect(cur[field]).toBe(value);
      expect(cur.avitoUrl).toBe("https://www.avito.ru/item/legacy");
    }

    const raw = await t.db
      .select()
      .from(baseLeads)
      .where(eq(baseLeads.id, created.id));
    expect(raw[0]?.student).toBe("Пётр");
    expect(raw[0]?.parent).toBe("Ольга");
    expect(raw[0]?.teacher).toBe("Сергей");
    expect(raw[0]?.avitoUrl).toBe("https://www.avito.ru/item/legacy");

    const cleared = await updateBaseLead(t.db, director, {
      id: created.id,
      expectedUpdatedAt: cur.updatedAt,
      student: "",
      parent: "  ",
      teacher: null,
    });
    expect(cleared.student).toBe("");
    expect(cleared.parent).toBe("");
    expect(cleared.teacher).toBe("");
    expect(cleared.avitoUrl).toBe("https://www.avito.ru/item/legacy");
  });

  it("keeps legacy rows with null people fields readable as empty strings", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    const created = await createBaseLead(t.db, director);

    await t.db
      .update(baseLeads)
      .set({
        student: null,
        parent: null,
        teacher: null,
        avitoUrl: "https://example.com/keep",
        name: "Старая",
      })
      .where(eq(baseLeads.id, created.id));

    const listed = await listBaseLeads(t.db, director);
    const row = listed.find((r) => r.id === created.id)!;
    expect(row.name).toBe("Старая");
    expect(row.student).toBe("");
    expect(row.parent).toBe("");
    expect(row.teacher).toBe("");
    expect(row.avitoUrl).toBe("https://example.com/keep");
  });
});
