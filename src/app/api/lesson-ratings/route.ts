import { z } from "zod";

import { assertMutatingRequest } from "@/server/auth/csrf";
import { getDb } from "@/server/db/runtime";
import { jsonError, jsonOk, validationError } from "@/server/errors";
import {
  parseBody,
  readJsonBody,
  requireAuth,
} from "@/server/http/request";
import {
  listMyLessonRatings,
  listPendingStudentRatings,
  listPressLessonRatings,
  submitLessonRating,
  updateLessonRatingComment,
} from "@/server/services/lesson-ratings-service";

const bodySchema = z.object({
  action: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

function str(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  return s || undefined;
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth(request);
    const db = getDb();
    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "mine";

    switch (action) {
      case "mine":
        return jsonOk(await listMyLessonRatings(db, ctx));
      case "pending":
        return jsonOk(await listPendingStudentRatings(db, ctx));
      case "press":
        return jsonOk(
          await listPressLessonRatings(db, ctx, {
            period: url.searchParams.get("period") ?? undefined,
            from: str(url.searchParams.get("from")),
            to: str(url.searchParams.get("to")),
            teacherId: str(url.searchParams.get("teacherId")),
            attentionOnly: url.searchParams.get("attentionOnly") ?? undefined,
            minScore: str(url.searchParams.get("minScore")),
            maxScore: str(url.searchParams.get("maxScore")),
            offset: str(url.searchParams.get("offset")),
          })
        );
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
      case "submit":
        return jsonOk(await submitLessonRating(db, ctx, p as never));
      case "comment":
        return jsonOk(await updateLessonRatingComment(db, ctx, p as never));
      default:
        throw validationError(`Неизвестное действие: ${raw.action}`);
    }
  } catch (err) {
    return jsonError(err);
  }
}
