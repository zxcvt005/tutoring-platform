import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import {
  parseBody,
  readJsonBody,
  requireAuth,
} from "@/server/http/request";
import { deleteMessage, editMessage } from "@/server/services/chat-service";

type Params = { params: Promise<{ id: string; messageId: string }> };

const editSchema = z.object({
  body: z.string().min(1).max(4000),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    assertMutatingRequest(request);
    const { id, messageId } = await params;
    const ctx = await requireAuth(request);
    const body = parseBody(editSchema, await readJsonBody(request));
    const db = getDb();
    const message = await editMessage(db, ctx, {
      chatId: id,
      messageId,
      body: body.body,
    });
    return jsonOk({ message });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    assertMutatingRequest(request);
    const { id, messageId } = await params;
    const ctx = await requireAuth(request);
    const db = getDb();
    const message = await deleteMessage(db, ctx, { chatId: id, messageId });
    return jsonOk({ message });
  } catch (err) {
    return jsonError(err);
  }
}
