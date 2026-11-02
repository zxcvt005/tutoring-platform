import { NextResponse } from "next/server";
import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk, notFound } from "@/server/errors";
import { getClientMeta, parseBody, readJsonBody } from "@/server/http/request";
import {
  PRIVATE_GUEST_COOKIE,
  PRIVATE_GUEST_TTL_MS,
  privateCookieOptions,
  sealPrivateGuest,
} from "@/server/private-calls/access";
import {
  getPrivateJoinInfo,
  joinPrivateCall,
} from "@/server/services/private-calls-service";

export const dynamic = "force-dynamic";

const CODE_RE = /^[A-Za-z0-9_-]{8,64}$/;

const bodySchema = z.object({
  name: z.string().min(1).max(40),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await context.params;
    if (!CODE_RE.test(code)) return jsonOk({ available: false, accepting: false });
    return jsonOk(await getPrivateJoinInfo(getDb(), code));
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  try {
    assertMutatingRequest(request);
    const { code } = await context.params;
    if (!CODE_RE.test(code)) throw notFound("Ссылка недействительна");
    const body = parseBody(bodySchema, await readJsonBody(request));
    const meta = getClientMeta(request);
    const joined = await joinPrivateCall(getDb(), {
      code,
      name: body.name,
      ip: meta.ip,
    });
    const expiresAt = new Date(Date.now() + PRIVATE_GUEST_TTL_MS);
    const res = NextResponse.json({ call: joined.call });
    res.cookies.set(
      PRIVATE_GUEST_COOKIE,
      sealPrivateGuest(
        { roomId: joined.roomId, sessionId: joined.sessionId },
        expiresAt
      ),
      privateCookieOptions(expiresAt)
    );
    return res;
  } catch (err) {
    return jsonError(err);
  }
}
