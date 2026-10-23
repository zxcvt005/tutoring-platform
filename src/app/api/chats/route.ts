import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import { parseBody, readJsonBody, requireAuth } from "@/server/http/request";
import {
  ensureChatForViewer,
  listChats,
} from "@/server/services/chat-service";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth(request);
    const url = new URL(request.url);
    const query = url.searchParams.get("q") ?? "";
    const offset = Number(url.searchParams.get("offset") ?? "0") || 0;
    const db = getDb();
    const data = await listChats(db, ctx, { query, offset });
    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}

const ensureSchema = z.object({
  studentId: z.string().min(1).optional(),
  teacherId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    const ctx = await requireAuth(request);
    const body = parseBody(ensureSchema, await readJsonBody(request));
    const db = getDb();
    const chat = await ensureChatForViewer(db, ctx, body);
    return jsonOk({ chat });
  } catch (err) {
    return jsonError(err);
  }
}
