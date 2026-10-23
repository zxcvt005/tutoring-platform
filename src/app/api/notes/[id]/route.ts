import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import {
  parseBody,
  readJsonBody,
  requireAuth,
} from "@/server/http/request";
import { deleteNote, updateNote } from "@/server/services/notes-service";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().max(50_000).optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    assertMutatingRequest(request);
    const { id } = await params;
    const ctx = await requireAuth(request);
    const body = parseBody(patchSchema, await readJsonBody(request));
    const data = await updateNote(getDb(), ctx, {
      noteId: id,
      title: body.title,
      content: body.content,
    });
    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    assertMutatingRequest(request);
    const { id } = await params;
    const ctx = await requireAuth(request);
    const data = await deleteNote(getDb(), ctx, id);
    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}
