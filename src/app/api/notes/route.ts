import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk } from "@/server/errors";
import { requireAuth } from "@/server/http/request";
import { createNote, listNotes } from "@/server/services/notes-service";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth(request);
    const data = await listNotes(getDb(), ctx);
    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    const ctx = await requireAuth(request);
    const data = await createNote(getDb(), ctx);
    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}
