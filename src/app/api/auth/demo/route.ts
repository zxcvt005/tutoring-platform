import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { isDemoLoginAllowed } from "@/server/auth/env";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/server/auth/session";
import { resolveAuthContext } from "@/server/authz/context";
import { DEMO_ORG_ID, DEMO_PASSWORD } from "@/server/db/seed";
import { students, teachers } from "@/server/db/schema";
import { getDb } from "@/server/db/runtime";
import { forbidden, jsonError } from "@/server/errors";
import {
  getClientMeta,
  parseBody,
  readJsonBody,
} from "@/server/http/request";
import { loginWithPassword, mePayload } from "@/server/services/auth-service";

/**
 * Демо-вход только для локальной разработки.
 * В production всегда запрещён (даже при ALLOW_DEMO_LOGIN=1).
 */
const bodySchema = z.object({
  role: z.enum(["director", "teacher", "student"]),
  teacherId: z.string().optional(),
  studentId: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    if (!isDemoLoginAllowed()) {
      throw forbidden("Демо-вход отключён");
    }
    assertMutatingRequest(request);

    const body = parseBody(bodySchema, await readJsonBody(request));
    const db = getDb();
    const meta = getClientMeta(request);

    let email = "director@demo.local";
    if (body.role === "teacher") {
      const tid = body.teacherId ?? "t1";
      const [t] = await db
        .select()
        .from(teachers)
        .where(eq(teachers.id, tid))
        .limit(1);
      email = t?.email ?? "anna@example.com";
    }
    if (body.role === "student") {
      const sid = body.studentId ?? "s1";
      email = `${sid}@demo.local`;
      const [s] = await db
        .select()
        .from(students)
        .where(eq(students.id, sid))
        .limit(1);
      if (!s || s.organizationId !== DEMO_ORG_ID) {
        email = "s1@demo.local";
      }
    }

    const { user, session } = await loginWithPassword(db, {
      email,
      password: DEMO_PASSWORD,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });
    const ctx = await resolveAuthContext(db, session.rawToken);
    const me = mePayload(ctx);
    const res = NextResponse.json({
      user,
      organizationId: me.organizationId,
      role: me.role,
      teacherId: me.teacherId,
      studentId: me.studentId,
    });
    res.cookies.set(
      SESSION_COOKIE,
      session.rawToken,
      sessionCookieOptions(session.expiresAt)
    );
    return res;
  } catch (err) {
    return jsonError(err);
  }
}
