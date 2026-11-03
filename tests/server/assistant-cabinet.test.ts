import { afterEach, describe, expect, it } from "vitest";

import { cabinetHomeForRole } from "@/lib/auth/roles";
import { resolveAuthContext } from "@/server/authz/context";
import { loginWithPassword } from "@/server/services/auth-service";
import { createOrgUser } from "@/server/services/admin-users-service";
import { buildBootstrap } from "@/server/services/bootstrap-service";
import {
  listKnowledgeBase,
  transferKnowledge,
} from "@/server/services/knowledge-service";
import { upsertTeacher } from "@/server/services/platform-mutations";
import { upsertTheory } from "@/server/services/theory-service";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

describe("assistant cabinet", () => {
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

  it("routes assistant home and shares knowledge base with director", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    await createOrgUser(t.db, director, {
      email: "assistant@demo.local",
      password: DEMO_PASSWORD,
      fullName: "Demo Assistant",
      role: "assistant",
    });
    const assistant = await asRole(t.db, "assistant@demo.local");
    expect(assistant.role).toBe("assistant");
    expect(cabinetHomeForRole("assistant")).toBe("/assistent");

    const created = await upsertTheory(t.db, assistant, {
      teacherId: "",
      title: "Assistant theory",
      libraryScope: "school",
      videoUrl: "https://vk.com/video-1_2",
      publish: true,
    });
    const directorBoot = await buildBootstrap(t.db, director);
    const assistantBoot = await buildBootstrap(t.db, assistant);
    expect(
      directorBoot.theories.some((row) => row.id === created.id)
    ).toBe(true);
    expect(
      assistantBoot.theories.some((row) => row.id === created.id)
    ).toBe(true);
    expect(assistantBoot.students).toEqual([]);
    expect(assistantBoot.payments).toEqual([]);
    expect(assistantBoot.products).toEqual([]);

    await expect(listKnowledgeBase(t.db, assistant)).resolves.toBeTruthy();
    await expect(
      transferKnowledge(t.db, assistant, {
        phase: "plan",
        items: [{ kind: "theory", id: created.id }],
        teacherIds: ["t1"],
      })
    ).resolves.toMatchObject({ phase: "plan" });
  });

  it("blocks assistant from director admin mutations", async () => {
    const t = await createTestDb();
    close = t.close;
    const director = await asRole(t.db, "director@demo.local");
    await createOrgUser(t.db, director, {
      email: "assistant2@demo.local",
      password: DEMO_PASSWORD,
      fullName: "Assistant Two",
      role: "assistant",
    });
    const assistant = await asRole(t.db, "assistant2@demo.local");

    await expect(
      upsertTeacher(t.db, assistant, {
        fullName: "Hack",
        subjects: [],
        status: "active",
      })
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      createOrgUser(t.db, assistant, {
        email: "hack@demo.local",
        password: DEMO_PASSWORD,
        fullName: "Hack",
        role: "student",
      })
    ).rejects.toMatchObject({ status: 403 });
  });
});
