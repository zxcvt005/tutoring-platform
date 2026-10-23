import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import { filesFromFormData, isMultipart } from "@/server/http/chat-uploads";
import {
  parseBody,
  readJsonBody,
  requireAuth,
} from "@/server/http/request";
import { listMessages, sendMessage } from "@/server/services/chat-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await requireAuth(request);
    const url = new URL(request.url);
    const db = getDb();
    const data = await listMessages(db, ctx, {
      chatId: id,
      before: url.searchParams.get("before"),
      beforeId: url.searchParams.get("beforeId"),
      limit: Number(url.searchParams.get("limit") ?? "") || undefined,
    });
    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}

const jsonSchema = z.object({
  body: z.string().optional(),
  clientRequestId: z.string().min(8).max(80),
});

export async function POST(request: Request, { params }: Params) {
  try {
    assertMutatingRequest(request);
    const { id } = await params;
    const ctx = await requireAuth(request);
    const db = getDb();
    if (isMultipart(request)) {
      const form = await request.formData();
      const result = await sendMessage(db, ctx, {
        chatId: id,
        body: String(form.get("body") ?? ""),
        clientRequestId: String(form.get("clientRequestId") ?? ""),
        files: await filesFromFormData(form),
      });
      return jsonOk(result);
    }
    const body = parseBody(jsonSchema, await readJsonBody(request));
    const result = await sendMessage(db, ctx, {
      chatId: id,
      body: body.body,
      clientRequestId: body.clientRequestId,
    });
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}
