import { NextResponse } from "next/server";
import { z } from "zod";

import {
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/server/auth/session";
import { DEMO_ORG_ID, DEMO_PASSWORD } from "@/server/db/seed";
import { getDb } from "@/server/db/runtime";
import { jsonError, forbidden } from "@/server/errors";
import {
  getClientMeta,
  parseBody,
  readJsonBody,
} from "@/server/http/request";
import { loginWithPassword, mePayload } from "@/server/services/auth-service";
import { resolveAuthContext } from "@/server/authz/context";
import { eq } from "drizzle-orm";
import { teachers, students } from "@/server/db/schema";

/**
 * Демо-вход для локальной разработки / прототипа.
 * Включать только при ALLOW_DEMO_LOGIN=1 (по умолчанию в development).
 */
const bodySchema = z.object({
  role: z.enum(["director", "teacher", "student"]),
  teacherId: z.string().optional(),
  studentId: z.string().optional(),
});

function demoAllowed() {
  if (process.env.ALLOW_DEMO_LOGIN === "1") return true;
  if (process.env.ALLOW_DEMO_LOGIN === "0") return false;
  return process.env.NODE_ENV !== "production";
}

export async function POST(request: Request) {
  try {
    if (!demoAllowed()) throw forbidden("Демо-вход отключён");

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
