import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import {
  parseBody,
  readJsonBody,
  requireAuth,
} from "@/server/http/request";
import { markChatRead } from "@/server/services/chat-service";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  messageId: z.string().min(1),
});

export async function POST(request: Request, { params }: Params) {
  try {
    assertMutatingRequest(request);
    const { id } = await params;
    const ctx = await requireAuth(request);
    const body = parseBody(bodySchema, await readJsonBody(request));
    const db = getDb();
    const data = await markChatRead(db, ctx, {
      chatId: id,
      messageId: body.messageId,
    });
    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}
