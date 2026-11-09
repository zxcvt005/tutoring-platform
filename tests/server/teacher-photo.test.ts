import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { POST as uploadTeacherPhoto } from "@/app/api/admin/teachers/[id]/photo/route";
import { CSRF_COOKIE, CSRF_HEADER } from "@/server/auth/constants";
import { SESSION_COOKIE } from "@/server/auth/session";
import { resolveAuthContext } from "@/server/authz/context";
import { teachers } from "@/server/db/schema";
import {
  setChatObjectStoreForTests,
  type ChatObjectStore,
} from "@/server/media/chat-storage";
import { loginWithPassword } from "@/server/services/auth-service";
import { upsertTeacher } from "@/server/services/platform-mutations";
import { createTestDb, DEMO_PASSWORD } from "../helpers/pg-test";

function pngBytes() {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
}

function memoryStore(): ChatObjectStore & { map: Map<string, Buffer> } {
  const map = new Map<string, Buffer>();
  return {
    map,
    async put(key, bytes) {
      map.set(key, Buffer.from(bytes));
    },
    async get(key) {
      const row = map.get(key);
      if (!row) throw Object.assign(new Error("not_found"), { status: 404 });
      return row;
    },
    async delete(key) {
      map.delete(key);
    },
  };
}

describe("teacher photo upload", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    setChatObjectStoreForTests(null);
    if (close) await close();
    close = undefined;
  });

  async function sessionCookie(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    email: string
  ) {
    const { session } = await loginWithPassword(db, {
      email,
      password: DEMO_PASSWORD,
    });
    return {
      raw: session.rawToken,
      ctx: await resolveAuthContext(db, session.rawToken),
      cookie: `${SESSION_COOKIE}=${session.rawToken}; ${CSRF_COOKIE}=csrf-test`,
    };
  }

  it("stores photo object key for a director and rejects other roles", async () => {
    const t = await createTestDb();
    close = t.close;
    const store = memoryStore();
    setChatObjectStoreForTests(store);

    const director = await sessionCookie(t.db, "director@demo.local");
    const profile = await upsertTeacher(t.db, director.ctx, {
      fullName: "Photo Teacher",
      subjects: ["Физика"],
      status: "active",
    });

    const form = new FormData();
    form.append(
      "file",
      new File([pngBytes()], "photo.png", { type: "image/png" })
    );
    const ok = await uploadTeacherPhoto(
      new Request(`http://localhost/api/admin/teachers/${profile.id}/photo`, {
        method: "POST",
        headers: {
          cookie: director.cookie,
          [CSRF_HEADER]: "csrf-test",
          origin: "http://localhost:43127",
        },
        body: form,
      }),
      { params: Promise.resolve({ id: profile.id }) }
    );
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as {
      photoKey: string;
      photoUrl: string;
    };
    expect(body.photoKey).toBe(`teachers/${profile.id}.png`);
    expect(body.photoUrl).toContain(`/api/media/teachers/`);
    expect(store.map.has(body.photoKey)).toBe(true);

    const [row] = await t.db
      .select({ photoKey: teachers.photoKey })
      .from(teachers)
      .where(eq(teachers.id, profile.id))
      .limit(1);
    expect(row?.photoKey).toBe(body.photoKey);

    const teacher = await sessionCookie(t.db, "anna@example.com");
    const form2 = new FormData();
    form2.append(
      "file",
      new File([pngBytes()], "photo.png", { type: "image/png" })
    );
    const forbidden = await uploadTeacherPhoto(
      new Request(`http://localhost/api/admin/teachers/${profile.id}/photo`, {
        method: "POST",
        headers: {
          cookie: teacher.cookie,
          [CSRF_HEADER]: "csrf-test",
          origin: "http://localhost:43127",
        },
        body: form2,
      }),
      { params: Promise.resolve({ id: profile.id }) }
    );
    expect(forbidden.status).toBe(403);
  });

  it("surfaces storage failures without masking them as generic 500", async () => {
    const t = await createTestDb();
    close = t.close;
    const { serviceUnavailable } = await import("@/server/errors");
    setChatObjectStoreForTests({
      async put() {
        throw serviceUnavailable(
          "Бакет S3 не найден или URL хранилища неверный (HTTP 404 / NoSuchBucket). Проверьте S3_BUCKET и S3_ENDPOINT (origin без имени бакета), а также path-style (`S3_FORCE_PATH_STYLE=1`). HTTP 404 здесь не означает отказ ACL."
        );
      },
      async get() {
        throw new Error("unused");
      },
      async delete() {},
    });

    const director = await sessionCookie(t.db, "director@demo.local");
    const profile = await upsertTeacher(t.db, director.ctx, {
      fullName: "Fail Photo Teacher",
      subjects: [],
      status: "active",
    });
    const form = new FormData();
    form.append(
      "file",
      new File([pngBytes()], "photo.png", { type: "image/png" })
    );
    const res = await uploadTeacherPhoto(
      new Request(`http://localhost/api/admin/teachers/${profile.id}/photo`, {
        method: "POST",
        headers: {
          cookie: director.cookie,
          [CSRF_HEADER]: "csrf-test",
          origin: "http://localhost:43127",
        },
        body: form,
      }),
      { params: Promise.resolve({ id: profile.id }) }
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { message: string; code: string } };
    expect(body.error.code).toBe("service_unavailable");
    expect(body.error.message).toMatch(/NoSuchBucket|не найден/i);
    expect(body.error.message).not.toMatch(/Проверьте права ключа/i);
    expect(body.error.message).not.toBe("Внутренняя ошибка сервера");
  });
});
