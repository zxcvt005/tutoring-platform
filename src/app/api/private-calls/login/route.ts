import { NextResponse } from "next/server";
import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError } from "@/server/errors";
import { getClientMeta, parseBody, readJsonBody } from "@/server/http/request";
import {
  PRIVATE_HOST_COOKIE,
  loginPrivateHost,
  privateCookieOptions,
  sealPrivateHost,
} from "@/server/private-calls/access";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    const body = parseBody(bodySchema, await readJsonBody(request));
    const meta = getClientMeta(request);
    const db = getDb();
    const { expiresAt } = await loginPrivateHost(db, body.password, meta.ip);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(
      PRIVATE_HOST_COOKIE,
      sealPrivateHost(expiresAt),
      privateCookieOptions(expiresAt)
    );
    return res;
  } catch (err) {
    return jsonError(err);
  }
}
