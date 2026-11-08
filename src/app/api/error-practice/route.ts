import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk, validationError } from "@/server/errors";
import {
  parseBody,
  readJsonBody,
  requireAuth,
} from "@/server/http/request";
import { getErrorBankSummary } from "@/server/services/error-bank-service";
import {
  getErrorPracticeSession,
  listErrorPracticeHistory,
  startErrorPracticeSession,
  submitErrorPracticeAnswer,
} from "@/server/services/error-practice-service";

const bodySchema = z.object({
  action: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth(request);
    const db = getDb();
    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "summary";
    const studentId = ctx.studentId;
    if (!studentId) throw validationError("Доступно только ученику");

    switch (action) {
      case "summary":
        return jsonOk(await getErrorBankSummary(db, ctx, studentId));
      case "session": {
        const sessionId = url.searchParams.get("sessionId") ?? undefined;
        return jsonOk(await getErrorPracticeSession(db, ctx, sessionId));
      }
      case "history":
        return jsonOk(await listErrorPracticeHistory(db, ctx));
      default:
        throw validationError(`Неизвестное действие: ${action}`);
    }
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    assertMutatingRequest(request);
    const ctx = await requireAuth(request);
    const raw = parseBody(bodySchema, await readJsonBody(request));
    const p = (raw.payload ?? {}) as Record<string, unknown>;
    const db = getDb();

    switch (raw.action) {
      case "start":
        return jsonOk(await startErrorPracticeSession(db, ctx, p));
      case "answer":
        return jsonOk(await submitErrorPracticeAnswer(db, ctx, p));
      default:
        throw validationError(`Неизвестное действие: ${raw.action}`);
    }
  } catch (err) {
    return jsonError(err);
  }
}
