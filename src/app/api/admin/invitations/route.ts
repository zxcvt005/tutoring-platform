import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import {
  parseBody,
  readJsonBody,
  requireAuth,
} from "@/server/http/request";
import {
  createProfileInvitation,
  getProfileAccessStatus,
} from "@/server/services/invitation-service";

const targetSchema = z
  .object({
    teacherId: z.string().min(1).max(80).optional(),
    studentId: z.string().min(1).max(80).optional(),
  })
  .refine((v) => Boolean(v.teacherId) !== Boolean(v.studentId), {
    message: "Укажите teacherId или studentId",
  });

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth(request);
    const url = new URL(request.url);
    const teacherId = url.searchParams.get("teacherId") || undefined;
    const studentId = url.searchParams.get("studentId") || undefined;
    const target = parseBody(targetSchema, { teacherId, studentId });
    const status = await getProfileAccessStatus(getDb(), ctx, target);
    return jsonOk(status);
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    const ctx = await requireAuth(request);
    const body = parseBody(targetSchema, await readJsonBody(request));
    const created = await createProfileInvitation(getDb(), ctx, body);
    // rawToken не отдаём отдельно — только в inviteUrl один раз.
    return jsonOk(
      {
        accessStatus: created.accessStatus,
        accountEmail: created.accountEmail,
        invitation: created.invitation,
        inviteUrl: created.inviteUrl,
      },
      { status: 201 } as ResponseInit
    );
  } catch (err) {
    return jsonError(err);
  }
}
