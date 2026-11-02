import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import { parseBody, readJsonBody, requireAuth } from "@/server/http/request";
import {
  createVideoCall,
  listVideoCalls,
} from "@/server/services/video-calls-service";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  mode: z.enum(["parallel", "group"]).optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth(request);
    const db = getDb();
    return jsonOk({ calls: await listVideoCalls(db, ctx) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    const ctx = await requireAuth(request);
    const body = parseBody(createSchema, await readJsonBody(request));
    const db = getDb();
    const call = await createVideoCall(db, ctx, body);
    return jsonOk({ call }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
